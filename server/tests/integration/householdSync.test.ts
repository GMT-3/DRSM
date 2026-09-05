import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';
import { Site } from '../../src/models/Site';
import { Household } from '../../src/models/Household';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

async function seedGeoAndSite() {
  const province = await Province.create({ name: 'Bagmati', code: `P-${Date.now()}-${Math.random()}` });
  const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: `D-${Date.now()}-${Math.random()}` });
  const muni = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
  const ward = await Ward.create({ municipalityId: muni._id, wardNumber: 1 });
  const site = await Site.create({ wardId: ward._id, name: 'Site A', siteType: 'settlement' });
  return { province, district, muni, ward, site };
}

describe('POST /api/households/sync (offline outbox flush)', () => {
  it('creates every queued record on first flush, keyed by clientUuid', async () => {
    const { province, district, muni, ward, site } = await seedGeoAndSite();
    await createTestUser({
      email: 'sync1@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muni._id, wardId: ward._id },
    });
    const token = await login('sync1@test.local');

    const res = await request(app)
      .post('/api/households/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { clientUuid: 'offline-uuid-1', siteId: String(site._id), headOfHouseholdName: 'A', persons: [{ name: 'A' }] },
          { clientUuid: 'offline-uuid-2', siteId: String(site._id), headOfHouseholdName: 'B', persons: [] },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results.every((r: { status: string }) => r.status === 'created')).toBe(true);

    const count = await Household.countDocuments({});
    expect(count).toBe(2);
  });

  it('re-flushing the same batch after a partial-failure retry never duplicates records', async () => {
    const { province, district, muni, ward, site } = await seedGeoAndSite();
    await createTestUser({
      email: 'sync2@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muni._id, wardId: ward._id },
    });
    const token = await login('sync2@test.local');

    const batch = {
      items: [
        { clientUuid: 'retry-uuid-1', siteId: String(site._id), headOfHouseholdName: 'C', persons: [] },
        { clientUuid: 'retry-uuid-2', siteId: String(site._id), headOfHouseholdName: 'D', persons: [] },
      ],
    };

    const first = await request(app).post('/api/households/sync').set('Authorization', `Bearer ${token}`).send(batch);
    expect(first.body.results.every((r: { status: string }) => r.status === 'created')).toBe(true);

    // Simulates the client not receiving the first response (network drop
    // right after the server committed) and retrying the identical batch.
    const second = await request(app).post('/api/households/sync').set('Authorization', `Bearer ${token}`).send(batch);
    expect(second.status).toBe(200);
    expect(second.body.results.every((r: { status: string }) => r.status === 'already_synced')).toBe(true);

    const count = await Household.countDocuments({});
    expect(count).toBe(2);
  });

  it('reports a per-item error without blocking the rest of the batch', async () => {
    const { province, district, muni, ward, site } = await seedGeoAndSite();
    await createTestUser({
      email: 'sync3@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muni._id, wardId: ward._id },
    });
    const token = await login('sync3@test.local');

    const res = await request(app)
      .post('/api/households/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { clientUuid: 'bad-item', siteId: String(site._id) /* missing headOfHouseholdName */ },
          { clientUuid: 'good-item', siteId: String(site._id), headOfHouseholdName: 'Fine' },
        ],
      });

    expect(res.status).toBe(200);
    const bad = res.body.results.find((r: { clientUuid: string }) => r.clientUuid === 'bad-item');
    const good = res.body.results.find((r: { clientUuid: string }) => r.clientUuid === 'good-item');
    expect(bad.status).toBe('error');
    expect(good.status).toBe('created');
  });
});
