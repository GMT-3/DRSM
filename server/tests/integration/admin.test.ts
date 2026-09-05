import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

describe('Administration (Phase 9): boundaries, disaster events, categories, permissions', () => {
  it('lets Central register the boundary hierarchy top to bottom', async () => {
    await createTestUser({ email: 'central-a1@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
    const token = await login('central-a1@test.local');

    const provinceRes = await request(app)
      .post('/api/admin/provinces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bagmati', code: `P-${Date.now()}` });
    expect(provinceRes.status).toBe(201);

    const districtRes = await request(app)
      .post('/api/admin/districts')
      .set('Authorization', `Bearer ${token}`)
      .send({ provinceId: provinceRes.body.province._id, name: 'Rasuwa', code: `D-${Date.now()}` });
    expect(districtRes.status).toBe(201);

    const muniRes = await request(app)
      .post('/api/admin/municipalities')
      .set('Authorization', `Bearer ${token}`)
      .send({ districtId: districtRes.body.district._id, name: 'Gosaikunda' });
    expect(muniRes.status).toBe(201);

    const wardRes = await request(app)
      .post('/api/admin/wards')
      .set('Authorization', `Bearer ${token}`)
      .send({ municipalityId: muniRes.body.municipality._id, wardNumber: 3 });
    expect(wardRes.status).toBe(201);
  });

  it('rejects a non-central attempt to register a province', async () => {
    const province = await Province.create({ name: 'Bagmati', code: `P-${Date.now()}` });
    const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: `D-${Date.now()}` });
    const muni = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
    await createTestUser({
      email: 'muni-a1@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muni._id },
    });
    const token = await login('muni-a1@test.local');

    const res = await request(app)
      .post('/api/admin/provinces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Someplace', code: `P2-${Date.now()}` });
    expect(res.status).toBe(403);
  });

  it('creates and closes a disaster event', async () => {
    await createTestUser({ email: 'central-a2@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
    const token = await login('central-a2@test.local');

    const createRes = await request(app)
      .post('/api/admin/disaster-events')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Melamchi Flood 2026', type: 'flood', startDate: '2026-08-01' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.event.status).toBe('active');

    const closeRes = await request(app)
      .patch(`/api/admin/disaster-events/${createRes.body.event._id}/close`)
      .set('Authorization', `Bearer ${token}`);
    expect(closeRes.body.event.status).toBe('closed');
  });

  it('lets a municipality_ward officer add a requirement category', async () => {
    const province = await Province.create({ name: 'Bagmati', code: `P-${Date.now()}` });
    const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: `D-${Date.now()}` });
    const muni = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
    await createTestUser({
      email: 'muni-a2@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muni._id },
    });
    const token = await login('muni-a2@test.local');

    const res = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'requirement', name: 'water purification tablets' });
    expect(res.status).toBe(201);

    const listRes = await request(app).get('/api/admin/categories?kind=requirement').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.categories.some((c: { name: string }) => c.name === 'water purification tablets')).toBe(true);
  });

  it("lets Central change a user's role, and rejects a non-central attempt", async () => {
    await createTestUser({ email: 'central-a3@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
    const centralToken = await login('central-a3@test.local');
    const volunteer = await createTestUser({ email: 'vol-a3@test.local', role: 'volunteer', scope: {} });

    const res = await request(app)
      .patch(`/api/admin/users/${volunteer._id}/role`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ role: 'police' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('police');

    const muniToken = await login('vol-a3@test.local'); // now role 'police', but still same credentials
    const badRes = await request(app)
      .patch(`/api/admin/users/${volunteer._id}/role`)
      .set('Authorization', `Bearer ${muniToken}`)
      .send({ role: 'army' });
    expect(badRes.status).toBe(403);
  });
});
