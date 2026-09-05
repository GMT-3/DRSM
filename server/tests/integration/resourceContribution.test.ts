import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Organization } from '../../src/models/Organization';
import { StorageLocation } from '../../src/models/StorageLocation';
import { Resource } from '../../src/models/Resource';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

describe('POST /api/resource-contributions (submission)', () => {
  it('lets an NGO submit a contribution under its own organization', async () => {
    const org = await Organization.create({ name: 'Red Cross Demo', type: 'ingo', verificationStatus: 'verified' });
    await createTestUser({ email: 'ngo-contrib1@test.local', role: 'ngo_ingo', loginType: 'org_email', scope: { organizationId: org._id } });
    const token = await login('ngo-contrib1@test.local');

    const res = await request(app)
      .post('/api/resource-contributions')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceType: 'medicine', quantity: 100, unit: 'box' });

    expect(res.status).toBe(201);
    expect(res.body.contribution.contributedByOrganizationId).toBe(String(org._id));
    expect(res.body.contribution.verificationStatus).toBe('unverified');
  });

  it('lets an individual donor submit a fund contribution with no organization', async () => {
    await createTestUser({ email: 'donor-contrib1@test.local', role: 'donor', loginType: 'org_email' });
    const token = await login('donor-contrib1@test.local');

    const res = await request(app)
      .post('/api/resource-contributions')
      .set('Authorization', `Bearer ${token}`)
      .send({ resourceType: 'cash', quantity: 1, unit: 'lump_sum', fundAmount: 5000, currency: 'NPR' });

    expect(res.status).toBe(201);
    expect(res.body.contribution.contributedByOrganizationId).toBeNull();
    expect(res.body.contribution.contributedByUserId).toBeDefined();
  });

  it('scopes the list so a donor sees only their own contribution', async () => {
    await createTestUser({ email: 'donor-contrib2@test.local', role: 'donor', loginType: 'org_email' });
    const tokenA = await login('donor-contrib2@test.local');
    await request(app)
      .post('/api/resource-contributions')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ resourceType: 'cash', quantity: 1, unit: 'lump_sum', fundAmount: 100 });

    await createTestUser({ email: 'donor-contrib3@test.local', role: 'donor', loginType: 'org_email' });
    const tokenB = await login('donor-contrib3@test.local');

    const list = await request(app).get('/api/resource-contributions').set('Authorization', `Bearer ${tokenB}`);
    expect(list.body.contributions).toHaveLength(0);
  });
});

describe('PATCH /api/resource-contributions/:id/verify (Central-only verification)', () => {
  it('converts a verified contribution into a confirmed Resource', async () => {
    const org = await Organization.create({ name: 'WFP Demo', type: 'ingo', verificationStatus: 'verified' });
    await createTestUser({ email: 'ngo-contrib2@test.local', role: 'ngo_ingo', loginType: 'org_email', scope: { organizationId: org._id } });
    const ngoToken = await login('ngo-contrib2@test.local');

    const submitted = await request(app)
      .post('/api/resource-contributions')
      .set('Authorization', `Bearer ${ngoToken}`)
      .send({ resourceType: 'rice', quantity: 300, unit: 'kg' });

    const location = await StorageLocation.create({ name: 'Central Warehouse', type: 'warehouse' });

    await createTestUser({ email: 'central-contrib1@test.local', role: 'central', loginType: 'gov_admin' });
    const centralToken = await login('central-contrib1@test.local');

    const res = await request(app)
      .patch(`/api/resource-contributions/${submitted.body.contribution._id}/verify`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ decision: 'verified', storageLocationId: String(location._id) });

    expect(res.status).toBe(200);
    expect(res.body.contribution.verificationStatus).toBe('verified');
    expect(res.body.contribution.convertedToResourceId).toBeDefined();

    const resource = await Resource.findById(res.body.contribution.convertedToResourceId);
    expect(resource).not.toBeNull();
    expect(resource!.ownerType).toBe('organization');
    expect(resource!.quantity).toBe(300);
  });

  it('rejects verification from a non-central role', async () => {
    await createTestUser({ email: 'donor-contrib4@test.local', role: 'donor', loginType: 'org_email' });
    const donorToken = await login('donor-contrib4@test.local');
    const submitted = await request(app)
      .post('/api/resource-contributions')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({ resourceType: 'cash', quantity: 1, unit: 'lump_sum', fundAmount: 50 });

    await createTestUser({ email: 'muni-contrib1@test.local', role: 'municipality_ward', loginType: 'gov_email' });
    const muniToken = await login('muni-contrib1@test.local');

    const res = await request(app)
      .patch(`/api/resource-contributions/${submitted.body.contribution._id}/verify`)
      .set('Authorization', `Bearer ${muniToken}`)
      .send({ decision: 'verified' });

    expect(res.status).toBe(403);
  });

  it('rejects re-verifying an already-verified contribution, and requires a storageLocationId to verify', async () => {
    await createTestUser({ email: 'donor-contrib5@test.local', role: 'donor', loginType: 'org_email' });
    const donorToken = await login('donor-contrib5@test.local');
    const submitted = await request(app)
      .post('/api/resource-contributions')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({ resourceType: 'water', quantity: 50, unit: 'liter' });

    await createTestUser({ email: 'central-contrib2@test.local', role: 'central', loginType: 'gov_admin' });
    const centralToken = await login('central-contrib2@test.local');

    const missingLocation = await request(app)
      .patch(`/api/resource-contributions/${submitted.body.contribution._id}/verify`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ decision: 'verified' });
    expect(missingLocation.status).toBe(400);

    const location = await StorageLocation.create({ name: 'Depot', type: 'store' });
    await request(app)
      .patch(`/api/resource-contributions/${submitted.body.contribution._id}/verify`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ decision: 'verified', storageLocationId: String(location._id) });

    const reVerify = await request(app)
      .patch(`/api/resource-contributions/${submitted.body.contribution._id}/verify`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ decision: 'verified', storageLocationId: String(location._id) });
    expect(reVerify.status).toBe(400);
  });
});
