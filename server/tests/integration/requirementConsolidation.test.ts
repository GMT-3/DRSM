import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';
import { Site } from '../../src/models/Site';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

async function seedGeoAndSite() {
  const province = await Province.create({ name: 'Bagmati', code: `P-${Date.now()}-${Math.random()}` });
  const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: `D-${Date.now()}-${Math.random()}` });
  const muniA = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
  const wardA = await Ward.create({ municipalityId: muniA._id, wardNumber: 1 });
  const siteA = await Site.create({ wardId: wardA._id, name: 'Site A', siteType: 'settlement', accessMode: 'road' });
  return { province, district, muniA, wardA, siteA };
}

// The requirements consolidated here originate from a volunteer (a field
// role), so per the CDO-only routing rule they must be approved by
// District/CDO rather than Ward — consolidation itself stays open to any
// REVIEW_ROLES member (Ward/CDO/Central), so a CDO consolidating is not a
// change to consolidateRequirements' own permission check.
async function submitAndApprove(token: string, cdoToken: string, siteId: string, category: string) {
  const submitted = await request(app)
    .post('/api/requirements')
    .set('Authorization', `Bearer ${token}`)
    .send({ siteId, cluster: 'wash', category, quantityRequested: 50, populationAffected: 20, vulnerableCount: 2 });
  const reqId = submitted.body.requirement._id;
  await request(app).patch(`/api/requirements/${reqId}/approve`).set('Authorization', `Bearer ${cdoToken}`).send({});
  return reqId;
}

describe('POST /api/requirements/consolidate (Ward/CDO demand-consolidation workflow)', () => {
  it('rolls two approved requirements into one combined district-level request', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-con1@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-con1@test.local');
    await createTestUser({
      email: 'cdo-con1@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id },
    });
    const cdoToken = await login('cdo-con1@test.local');

    const id1 = await submitAndApprove(volToken, cdoToken, String(siteA._id), 'bottled water');
    const id2 = await submitAndApprove(volToken, cdoToken, String(siteA._id), 'water purification tablets');

    const res = await request(app)
      .post('/api/requirements/consolidate')
      .set('Authorization', `Bearer ${cdoToken}`)
      .send({ requirementIds: [id1, id2], siteId: String(siteA._id), description: 'District combined WASH demand' });

    expect(res.status).toBe(201);
    expect(res.body.requirement.status).toBe('approved');
    expect(res.body.requirement.quantityRequested).toBe(100);
    expect(res.body.requirement.priorityInputs.populationAffected).toBe(40);
    expect(res.body.consolidatedSources).toHaveLength(2);

    const source1 = await request(app).get(`/api/requirements/${id1}`).set('Authorization', `Bearer ${cdoToken}`);
    expect(source1.body.requirement.consolidatedIntoId).toBe(res.body.requirement._id);
  });

  it('rejects consolidating a requirement that is not yet approved', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-con2@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-con2@test.local');
    await createTestUser({
      email: 'cdo-con2@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id },
    });
    const cdoToken = await login('cdo-con2@test.local');

    const approved = await submitAndApprove(volToken, cdoToken, String(siteA._id), 'water');
    const unapproved = await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ siteId: String(siteA._id), cluster: 'wash', category: 'water', quantityRequested: 10 });

    const res = await request(app)
      .post('/api/requirements/consolidate')
      .set('Authorization', `Bearer ${cdoToken}`)
      .send({ requirementIds: [approved, unapproved.body.requirement._id], siteId: String(siteA._id) });

    expect(res.status).toBe(400);
  });

  it('rejects consolidating a requirement that has already been consolidated', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-con3@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-con3@test.local');
    await createTestUser({
      email: 'cdo-con3@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id },
    });
    const cdoToken = await login('cdo-con3@test.local');

    const id1 = await submitAndApprove(volToken, cdoToken, String(siteA._id), 'water');
    const id2 = await submitAndApprove(volToken, cdoToken, String(siteA._id), 'tablets');
    const id3 = await submitAndApprove(volToken, cdoToken, String(siteA._id), 'jerry cans');

    await request(app)
      .post('/api/requirements/consolidate')
      .set('Authorization', `Bearer ${cdoToken}`)
      .send({ requirementIds: [id1, id2], siteId: String(siteA._id) });

    const res = await request(app)
      .post('/api/requirements/consolidate')
      .set('Authorization', `Bearer ${cdoToken}`)
      .send({ requirementIds: [id1, id3], siteId: String(siteA._id) });

    expect(res.status).toBe(400);
  });

  it('rejects consolidation from a field role', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-con4@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-con4@test.local');

    const res = await request(app)
      .post('/api/requirements/consolidate')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ requirementIds: ['a', 'b'], siteId: String(siteA._id) });

    expect(res.status).toBe(403);
  });
});
