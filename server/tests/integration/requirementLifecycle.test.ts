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
  const muniB = await Municipality.create({ districtId: district._id, name: 'Other Muni', type: 'municipality' });
  const wardA = await Ward.create({ municipalityId: muniA._id, wardNumber: 1 });
  const siteA = await Site.create({ wardId: wardA._id, name: 'Site A', siteType: 'settlement', accessMode: 'road' });
  return { province, district, muniA, muniB, wardA, siteA };
}

async function submitRequirement(app_: typeof app, token: string, siteId: string) {
  return request(app_)
    .post('/api/requirements')
    .set('Authorization', `Bearer ${token}`)
    .send({ siteId, cluster: 'wash', category: 'water', quantityRequested: 100 });
}

describe('Requirement approval workflow (Modules.md: Pending Approval -> Approved Requirements)', () => {
  it('lets the District/CDO approve a volunteer-submitted requirement (routing rule: field-submitted requests go to CDO)', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-life1@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-life1@test.local');
    const submitted = await submitRequirement(app, volToken, String(siteA._id));
    const reqId = submitted.body.requirement._id;

    await createTestUser({
      email: 'cdo-life1@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id },
    });
    const cdoToken = await login('cdo-life1@test.local');

    const res = await request(app)
      .patch(`/api/requirements/${reqId}/approve`)
      .set('Authorization', `Bearer ${cdoToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.requirement.status).toBe('approved');
    expect(res.body.requirement.approvedByUserId).toBeDefined();
  });

  it('rejects an approval attempt on a volunteer-submitted requirement from Ward/Municipality (must go to CDO, not Ward)', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-life1b@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-life1b@test.local');
    const submitted = await submitRequirement(app, volToken, String(siteA._id));

    await createTestUser({
      email: 'muni-life1b@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const muniToken = await login('muni-life1b@test.local');

    const res = await request(app)
      .patch(`/api/requirements/${submitted.body.requirement._id}/approve`)
      .set('Authorization', `Bearer ${muniToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('lets Ward approve its own Municipality/Ward-submitted requirement (CDO routing only applies to field-personnel submissions)', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'muni-life1c@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const muniToken = await login('muni-life1c@test.local');
    const submitted = await submitRequirement(app, muniToken, String(siteA._id));

    const res = await request(app)
      .patch(`/api/requirements/${submitted.body.requirement._id}/approve`)
      .set('Authorization', `Bearer ${muniToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.requirement.status).toBe('approved');
  });

  it('rejects an approval attempt from a CDO outside the site\'s district', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-life2@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-life2@test.local');
    const submitted = await submitRequirement(app, volToken, String(siteA._id));

    const otherDistrict = await District.create({
      provinceId: province._id,
      name: 'Other District',
      code: `D-${Date.now()}-${Math.random()}`,
    });
    await createTestUser({
      email: 'cdo-life2@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: otherDistrict._id },
    });
    const otherCdoToken = await login('cdo-life2@test.local');

    const res = await request(app)
      .patch(`/api/requirements/${submitted.body.requirement._id}/approve`)
      .set('Authorization', `Bearer ${otherCdoToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('requires a note to reject, and rejects a non-approvable (already-approved) requirement for re-approval', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-life3@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-life3@test.local');
    const submitted = await submitRequirement(app, volToken, String(siteA._id));
    const reqId = submitted.body.requirement._id;

    await createTestUser({
      email: 'cdo-life3@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id },
    });
    const cdoToken = await login('cdo-life3@test.local');

    const missingNote = await request(app)
      .patch(`/api/requirements/${reqId}/reject`)
      .set('Authorization', `Bearer ${cdoToken}`)
      .send({});
    expect(missingNote.status).toBe(400);

    await request(app).patch(`/api/requirements/${reqId}/approve`).set('Authorization', `Bearer ${cdoToken}`).send({});

    const reRejectAttempt = await request(app)
      .patch(`/api/requirements/${reqId}/reject`)
      .set('Authorization', `Bearer ${cdoToken}`)
      .send({ note: 'too late' });
    expect(reRejectAttempt.status).toBe(400);
  });
});

describe('PATCH /api/requirements/:id/status (lifecycle transitions)', () => {
  it('walks a requirement through approved -> allocated -> dispatched -> delivered -> fulfilled', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-life4@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-life4@test.local');
    const submitted = await submitRequirement(app, volToken, String(siteA._id));
    const reqId = submitted.body.requirement._id;

    await createTestUser({
      email: 'cdo-life4@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id },
    });
    const cdoToken = await login('cdo-life4@test.local');
    await request(app).patch(`/api/requirements/${reqId}/approve`).set('Authorization', `Bearer ${cdoToken}`).send({});

    for (const status of ['allocated', 'dispatched', 'delivered', 'fulfilled']) {
      const res = await request(app)
        .patch(`/api/requirements/${reqId}/status`)
        .set('Authorization', `Bearer ${cdoToken}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.requirement.status).toBe(status);
    }

    const detail = await request(app).get(`/api/requirements/${reqId}`).set('Authorization', `Bearer ${cdoToken}`);
    expect(detail.body.requirement.history.map((h: { status: string }) => h.status)).toEqual([
      'submitted',
      'approved',
      'allocated',
      'dispatched',
      'delivered',
      'fulfilled',
    ]);
  });

  it('rejects an out-of-order transition (e.g. submitted straight to dispatched)', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-life5@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-life5@test.local');
    const submitted = await submitRequirement(app, volToken, String(siteA._id));

    await createTestUser({
      email: 'muni-life5@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const muniToken = await login('muni-life5@test.local');

    const res = await request(app)
      .patch(`/api/requirements/${submitted.body.requirement._id}/status`)
      .set('Authorization', `Bearer ${muniToken}`)
      .send({ status: 'dispatched' });

    expect(res.status).toBe(400);
  });

  it('rejects a status update from a field role (volunteer)', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-life6@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-life6@test.local');
    const submitted = await submitRequirement(app, volToken, String(siteA._id));

    const res = await request(app)
      .patch(`/api/requirements/${submitted.body.requirement._id}/status`)
      .set('Authorization', `Bearer ${volToken}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(403);
  });
});
