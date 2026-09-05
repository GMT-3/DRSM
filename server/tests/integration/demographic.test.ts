import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';
import { Site } from '../../src/models/Site';
import { Household } from '../../src/models/Household';
import { Person } from '../../src/models/Person';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

async function seedGeoWithPopulatedSites() {
  const province = await Province.create({ name: 'Bagmati', code: `P-${Date.now()}-${Math.random()}` });
  const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: `D-${Date.now()}-${Math.random()}` });
  const muniA = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
  const muniB = await Municipality.create({ districtId: district._id, name: 'Other Muni', type: 'municipality' });
  const wardA = await Ward.create({ municipalityId: muniA._id, wardNumber: 1 });
  const wardB = await Ward.create({ municipalityId: muniB._id, wardNumber: 1 });
  const siteA = await Site.create({ wardId: wardA._id, name: 'Site A', siteType: 'settlement' });
  const siteB = await Site.create({ wardId: wardB._id, name: 'Site B', siteType: 'settlement' });

  const registrar = await createTestUser({ email: `registrar-${Date.now()}@test.local`, role: 'central', loginType: 'gov_admin' });

  const hhA = await Household.create({
    siteId: siteA._id,
    headOfHouseholdName: 'HH A',
    qrCode: 'qr-a',
    clientUuid: 'uuid-hh-a',
    registeredByUserId: registrar._id,
  });
  await Person.create({ householdId: hhA._id, name: 'Person A1', status: 'stranded', vulnerabilityFlags: ['elderly'] });
  await Person.create({ householdId: hhA._id, name: 'Person A2', status: 'normal', vulnerabilityFlags: [] });

  const hhB = await Household.create({
    siteId: siteB._id,
    headOfHouseholdName: 'HH B',
    qrCode: 'qr-b',
    clientUuid: 'uuid-hh-b',
    registeredByUserId: registrar._id,
  });
  await Person.create({ householdId: hhB._id, name: 'Person B1', status: 'displaced', vulnerabilityFlags: [] });

  return { province, district, muniA, muniB, wardA, wardB, siteA, siteB };
}

describe('GET /api/demographic/summary', () => {
  it('gives central the full aggregate across every site', async () => {
    await seedGeoWithPopulatedSites();
    await createTestUser({ email: 'central-demo@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-demo@test.local');

    const res = await request(app).get('/api/demographic/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.aggregate.totalPopulation).toBe(3);
    expect(res.body.aggregate.byStatus.stranded).toBe(1);
    expect(res.body.aggregate.byStatus.displaced).toBe(1);
    expect(res.body.sites).toHaveLength(2);
  });

  it('scopes a municipality_ward officer to only their own site', async () => {
    const { province, district, muniA } = await seedGeoWithPopulatedSites();
    await createTestUser({
      email: 'muniofficer@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const token = await login('muniofficer@test.local');

    const res = await request(app).get('/api/demographic/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.sites).toHaveLength(1);
    expect(res.body.aggregate.totalPopulation).toBe(2);
  });

  it('gives organizations an empty, non-error response rather than raw demographic data', async () => {
    await seedGeoWithPopulatedSites();
    await createTestUser({ email: 'ngo-demo@test.local', role: 'ngo_ingo', loginType: 'org_email' });
    const token = await login('ngo-demo@test.local');

    const res = await request(app).get('/api/demographic/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.sites).toEqual([]);
  });
});

describe('PATCH /api/geo/sites/:id/access-mode', () => {
  it('lets the owning municipality_ward update access mode', async () => {
    const { province, district, muniA, siteA } = await seedGeoWithPopulatedSites();
    await createTestUser({
      email: 'muniofficer2@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const token = await login('muniofficer2@test.local');

    const res = await request(app)
      .patch(`/api/geo/sites/${siteA._id}/access-mode`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accessMode: 'foot_only' });

    expect(res.status).toBe(200);
    expect(res.body.site.accessMode).toBe('foot_only');
  });

  it('rejects an update from outside the site\'s municipality', async () => {
    const { province, district, muniB, siteA } = await seedGeoWithPopulatedSites();
    await createTestUser({
      email: 'muniofficer3@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniB._id },
    });
    const token = await login('muniofficer3@test.local');

    const res = await request(app)
      .patch(`/api/geo/sites/${siteA._id}/access-mode`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accessMode: 'airlift_only' });

    expect(res.status).toBe(403);
  });

  it('rejects an invalid accessMode value', async () => {
    const { siteA } = await seedGeoWithPopulatedSites();
    await createTestUser({ email: 'central-demo2@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-demo2@test.local');

    const res = await request(app)
      .patch(`/api/geo/sites/${siteA._id}/access-mode`)
      .set('Authorization', `Bearer ${token}`)
      .send({ accessMode: 'teleport' });

    expect(res.status).toBe(400);
  });
});
