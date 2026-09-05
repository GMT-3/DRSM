import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';
import { Site } from '../../src/models/Site';
import { Notice } from '../../src/models/Notice';

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

describe('Field Operations (Phase 7): hazard/rescue reports + priority case escalation', () => {
  it('lets a volunteer submit a hazard/route report scoped to their own site', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-fo1@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol-fo1@test.local');

    const res = await request(app)
      .post('/api/field-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        siteId: String(siteA._id),
        reportType: 'hazard_route_report',
        payload: { description: 'Landslide blocking the only access road' },
        clientUuid: `fr-${Date.now()}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.report.reportType).toBe('hazard_route_report');
  });

  it('retrying the same clientUuid does not create a duplicate report', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-fo2@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol-fo2@test.local');
    const clientUuid = `fr-dup-${Date.now()}`;

    const first = await request(app)
      .post('/api/field-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), reportType: 'rescue_evacuation_report', payload: {}, clientUuid });
    expect(first.status).toBe(201);

    const retry = await request(app)
      .post('/api/field-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), reportType: 'rescue_evacuation_report', payload: {}, clientUuid });
    expect(retry.body.alreadyExisted).toBe(true);
  });

  it('a critical priority case notifies municipality, district, and province with matching Notices', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-fo3@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol-fo3@test.local');

    const res = await request(app)
      .post('/api/priority-cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), caseType: 'mass_casualty', severity: 'critical' });
    expect(res.status).toBe(201);
    expect(res.body.notifiedLevels).toEqual(['municipality', 'district', 'province']);

    const notices = await Notice.find({});
    expect(notices.length).toBe(3);
    expect(notices.some((n) => String(n.scope) === String(muniA._id))).toBe(true);
    expect(notices.some((n) => String(n.scope) === String(district._id))).toBe(true);
    expect(notices.some((n) => String(n.scope) === String(province._id))).toBe(true);
  });

  it('a high-severity (non-critical) case does not notify Province', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-fo4@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol-fo4@test.local');

    const res = await request(app)
      .post('/api/priority-cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), caseType: 'medical_emergency', severity: 'high' });
    expect(res.body.notifiedLevels).toEqual(['municipality', 'district']);
  });

  it('rejects an out-of-order priority-case status jump', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-fo5@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-fo5@test.local');
    await createTestUser({ email: 'central-fo5@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
    const centralToken = await login('central-fo5@test.local');

    const reportRes = await request(app)
      .post('/api/priority-cases')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ siteId: String(siteA._id), caseType: 'medical_emergency', severity: 'high' });

    const badJump = await request(app)
      .patch(`/api/priority-cases/${reportRes.body.priorityCase._id}/status`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ status: 'resolved' });
    expect(badJump.status).toBe(400);
  });
});
