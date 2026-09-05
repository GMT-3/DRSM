import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Organization } from '../../src/models/Organization';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

async function seedGeo() {
  const province = await Province.create({ name: 'Bagmati', code: `P-${Date.now()}-${Math.random()}` });
  const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: `D-${Date.now()}-${Math.random()}` });
  const muniA = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
  const muniB = await Municipality.create({ districtId: district._id, name: 'Other Muni', type: 'municipality' });
  return { province, district, muniA, muniB };
}

describe('POST /api/storage-locations (Storage location management)', () => {
  it('lets a municipality_ward officer register a storage location anchored to their own municipality', async () => {
    const { province, district, muniA } = await seedGeo();
    await createTestUser({
      email: 'muni-store1@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const token = await login('muni-store1@test.local');

    const res = await request(app)
      .post('/api/storage-locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gosaikunda Warehouse', type: 'warehouse' });

    expect(res.status).toBe(201);
    expect(res.body.storageLocation.municipalityId).toBe(String(muniA._id));
  });

  it('scopes the list so a municipality_ward officer does not see another municipality\'s locations', async () => {
    const { province, district, muniA, muniB } = await seedGeo();
    await createTestUser({
      email: 'muni-store2@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const tokenA = await login('muni-store2@test.local');
    await request(app).post('/api/storage-locations').set('Authorization', `Bearer ${tokenA}`).send({ name: 'A Store' });

    await createTestUser({
      email: 'muni-store3@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniB._id },
    });
    const tokenB = await login('muni-store3@test.local');

    const list = await request(app).get('/api/storage-locations').set('Authorization', `Bearer ${tokenB}`);
    expect(list.body.storageLocations.every((l: { name: string }) => l.name !== 'A Store')).toBe(true);
  });

  it('rejects storage location creation from a field role', async () => {
    await seedGeo();
    await createTestUser({ email: 'vol-store1@test.local', role: 'volunteer' });
    const token = await login('vol-store1@test.local');

    const res = await request(app).post('/api/storage-locations').set('Authorization', `Bearer ${token}`).send({ name: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/resources (Government inventory + Organization inventory records)', () => {
  it('lets a government role create a government-owned resource', async () => {
    await seedGeo();
    await createTestUser({ email: 'central-res1@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-res1@test.local');

    const res = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceType: 'rice', unit: 'kg', quantity: 500 });

    expect(res.status).toBe(201);
    expect(res.body.resource.ownerType).toBe('government');
    expect(res.body.resource.state).toBe('available');
  });

  it('lets an NGO create a resource owned by their own organization, scoped to their org on listing', async () => {
    const wfp = await Organization.create({ name: 'WFP Demo', type: 'ingo', verificationStatus: 'verified' });
    await createTestUser({
      email: 'ngo-res1@test.local',
      role: 'ngo_ingo',
      loginType: 'org_email',
      scope: { organizationId: wfp._id },
    });
    const token = await login('ngo-res1@test.local');

    const created = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceType: 'tents', unit: 'unit', quantity: 40 });
    expect(created.status).toBe(201);
    expect(created.body.resource.ownerType).toBe('organization');
    expect(created.body.resource.ownerId).toBe(String(wfp._id));

    const list = await request(app).get('/api/resources').set('Authorization', `Bearer ${token}`);
    expect(list.body.resources).toHaveLength(1);
  });

  it('gives a donor an empty resource list rather than raw inventory data', async () => {
    await createTestUser({ email: 'donor-res1@test.local', role: 'donor', loginType: 'org_email' });
    const token = await login('donor-res1@test.local');

    const res = await request(app).get('/api/resources').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.resources).toEqual([]);
  });
});

describe('PATCH /api/resources/:id/state (Available/allocated/reserved tracking)', () => {
  it('lets central move a resource from available to reserved', async () => {
    await createTestUser({ email: 'central-res2@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-res2@test.local');

    const created = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceType: 'blankets', unit: 'unit', quantity: 200 });

    const res = await request(app)
      .patch(`/api/resources/${created.body.resource._id}/state`)
      .set('Authorization', `Bearer ${token}`)
      .send({ state: 'reserved' });

    expect(res.status).toBe(200);
    expect(res.body.resource.state).toBe('reserved');
  });

  it('rejects an organization changing the state of a resource it does not own', async () => {
    const orgA = await Organization.create({ name: 'Org A', type: 'ngo', verificationStatus: 'verified' });
    const orgB = await Organization.create({ name: 'Org B', type: 'ngo', verificationStatus: 'verified' });
    await createTestUser({ email: 'ngo-res2@test.local', role: 'ngo_ingo', loginType: 'org_email', scope: { organizationId: orgA._id } });
    const tokenA = await login('ngo-res2@test.local');
    await createTestUser({ email: 'ngo-res3@test.local', role: 'ngo_ingo', loginType: 'org_email', scope: { organizationId: orgB._id } });
    const tokenB = await login('ngo-res3@test.local');

    const created = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ resourceType: 'water', unit: 'liter', quantity: 1000 });

    const res = await request(app)
      .patch(`/api/resources/${created.body.resource._id}/state`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ state: 'allocated' });

    expect(res.status).toBe(403);
  });
});
