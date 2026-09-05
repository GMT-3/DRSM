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
  const wardB = await Ward.create({ municipalityId: muniB._id, wardNumber: 1 });
  const siteA = await Site.create({ wardId: wardA._id, name: 'Site A', siteType: 'settlement' });
  const siteB = await Site.create({ wardId: wardB._id, name: 'Site B', siteType: 'settlement' });
  return { province, district, muniA, muniB, wardA, wardB, siteA, siteB };
}

describe('POST /api/households (registration)', () => {
  it('lets a volunteer register a household with persons inside their own site', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol1@test.local',
      role: 'volunteer',
      loginType: 'own_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol1@test.local');

    const res = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({
        siteId: String(siteA._id),
        headOfHouseholdName: 'Ram Bahadur',
        clientUuid: 'client-uuid-household-1',
        persons: [
          { name: 'Ram Bahadur', age: 45, sex: 'male', vulnerabilityFlags: [] },
          { name: 'Sita Devi', age: 68, sex: 'female', vulnerabilityFlags: ['elderly'] },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.household.qrCode).toBe('client-uuid-household-1');
    expect(res.body.persons).toHaveLength(2);
  });

  it('rejects registering a household at a site outside the volunteer\'s municipality', async () => {
    const { province, district, muniA, wardA, siteB } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol2@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol2@test.local');

    const res = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteB._id), headOfHouseholdName: 'Someone', clientUuid: 'client-uuid-2' });

    expect(res.status).toBe(403);
  });

  it('rejects a duplicate clientUuid', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol3@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol3@test.local');

    const payload = { siteId: String(siteA._id), headOfHouseholdName: 'Dup', clientUuid: 'dup-uuid' };
    const first = await request(app).post('/api/households').set('Authorization', `Bearer ${token}`).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/households').set('Authorization', `Bearer ${token}`).send(payload);
    expect(second.status).toBe(400);
  });

  it('rejects a non-field, non-municipality role (e.g. an NGO)', async () => {
    const { siteA } = await seedGeoAndSite();
    await createTestUser({ email: 'ngo1@test.local', role: 'ngo_ingo', loginType: 'org_email' });
    const token = await login('ngo1@test.local');

    const res = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), headOfHouseholdName: 'X', clientUuid: 'uuid-x' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/households and person updates', () => {
  it('scopes the household list to the caller\'s municipality and returns detail + QR', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol4@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol4@test.local');

    const created = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), headOfHouseholdName: 'Gita', clientUuid: 'uuid-gita' });
    const householdId = created.body.household._id;

    const list = await request(app).get('/api/households').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.households.some((h: { _id: string }) => h._id === householdId)).toBe(true);

    const detail = await request(app).get(`/api/households/${householdId}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.household._id).toBe(householdId);

    const qr = await request(app).get(`/api/households/${householdId}/qr`).set('Authorization', `Bearer ${token}`);
    expect(qr.status).toBe(200);
    expect(qr.body.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('adds a person, then updates their status and unions (never drops) vulnerability flags', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol5@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol5@test.local');

    const created = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), headOfHouseholdName: 'Hari', clientUuid: 'uuid-hari' });
    const householdId = created.body.household._id;

    const added = await request(app)
      .post(`/api/households/${householdId}/persons`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hari', age: 30, sex: 'male', vulnerabilityFlags: ['chronic_illness'] });
    expect(added.status).toBe(201);
    const personId = added.body.person._id;

    const updated = await request(app)
      .patch(`/api/households/${householdId}/persons/${personId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'displaced', vulnerabilityFlags: ['disabled'] });

    expect(updated.status).toBe(200);
    expect(updated.body.person.status).toBe('displaced');
    // Union, not replace: the original chronic_illness flag must survive.
    expect(updated.body.person.vulnerabilityFlags.sort()).toEqual(['chronic_illness', 'disabled']);
  });
});
