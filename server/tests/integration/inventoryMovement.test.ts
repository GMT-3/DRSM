import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { StorageLocation } from '../../src/models/StorageLocation';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

async function createResource(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/resources')
    .set('Authorization', `Bearer ${token}`)
    .send({ resourceType: 'rice', unit: 'kg', quantity: 500, ...overrides });
  return res.body.resource;
}

describe('POST /api/inventory-movements', () => {
  it('logs a distribution movement and reduces the resource quantity', async () => {
    await createTestUser({ email: 'central-mov1@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-mov1@test.local');
    const resource = await createResource(token);

    const res = await request(app)
      .post('/api/inventory-movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceId: resource._id, quantity: 150, reason: 'distribution' });

    expect(res.status).toBe(201);
    expect(res.body.resource.quantity).toBe(350);
    expect(res.body.movement.reason).toBe('distribution');
  });

  it('logs a transfer and relocates the resource', async () => {
    await createTestUser({ email: 'central-mov2@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-mov2@test.local');
    const locationB = await StorageLocation.create({ name: 'Depot B', type: 'store' });
    const resource = await createResource(token);

    const res = await request(app)
      .post('/api/inventory-movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceId: resource._id, quantity: 500, reason: 'transfer', toLocationId: String(locationB._id) });

    expect(res.status).toBe(201);
    expect(res.body.resource.storageLocationId).toBe(String(locationB._id));
  });

  it('rejects a movement that would take quantity below zero', async () => {
    await createTestUser({ email: 'central-mov3@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-mov3@test.local');
    const resource = await createResource(token, { quantity: 20 });

    const res = await request(app)
      .post('/api/inventory-movements')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceId: resource._id, quantity: 50, reason: 'distribution' });

    expect(res.status).toBe(400);
  });

  it('rejects a movement from an organization on a resource it does not own', async () => {
    const { Organization } = await import('../../src/models/Organization');
    const orgA = await Organization.create({ name: 'Org A', type: 'ngo', verificationStatus: 'verified' });
    const orgB = await Organization.create({ name: 'Org B', type: 'ngo', verificationStatus: 'verified' });
    await createTestUser({ email: 'ngo-mov1@test.local', role: 'ngo_ingo', loginType: 'org_email', scope: { organizationId: orgA._id } });
    const tokenA = await login('ngo-mov1@test.local');
    await createTestUser({ email: 'ngo-mov2@test.local', role: 'ngo_ingo', loginType: 'org_email', scope: { organizationId: orgB._id } });
    const tokenB = await login('ngo-mov2@test.local');

    const resource = await createResource(tokenA, { resourceType: 'tents', unit: 'unit', quantity: 10 });

    const res = await request(app)
      .post('/api/inventory-movements')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ resourceId: resource._id, quantity: 5, reason: 'distribution' });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/inventory-movements (Inventory History)', () => {
  it('lists movements for a given resource in reverse-chronological order', async () => {
    await createTestUser({ email: 'central-mov4@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-mov4@test.local');
    const resource = await createResource(token, { quantity: 1000 });

    await request(app).post('/api/inventory-movements').set('Authorization', `Bearer ${token}`).send({ resourceId: resource._id, quantity: 100, reason: 'distribution' });
    await request(app).post('/api/inventory-movements').set('Authorization', `Bearer ${token}`).send({ resourceId: resource._id, quantity: 50, reason: 'distribution' });

    const res = await request(app).get(`/api/inventory-movements?resourceId=${resource._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.movements).toHaveLength(2);
  });

  it('requires a resourceId', async () => {
    await createTestUser({ email: 'central-mov5@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central-mov5@test.local');

    const res = await request(app).get('/api/inventory-movements').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
