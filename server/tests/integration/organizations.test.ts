import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Organization } from '../../src/models/Organization';

const app = createApp();

async function login(email: string, password = TEST_PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken as string;
}

describe('POST /api/organizations/register', () => {
  it('registers an NGO and returns a usable access token', async () => {
    const res = await request(app).post('/api/organizations/register').send({
      entityKind: 'ngo',
      name: 'Coordinator Person',
      organizationName: 'Example Relief NGO',
      email: 'coordinator@example-relief.org',
      password: 'StrongPass123',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.organization.verificationStatus).toBe('unverified');
    expect(res.body.user.role).toBe('ngo_ingo');

    const org = await Organization.findOne({ name: 'Example Relief NGO' });
    expect(org).not.toBeNull();
    expect(org!.type).toBe('ngo');
  });

  it('registers an individual donor without creating an Organization', async () => {
    const res = await request(app).post('/api/organizations/register').send({
      entityKind: 'donor_individual',
      name: 'Jane Donor',
      email: 'jane@example.com',
      password: 'StrongPass123',
    });

    expect(res.status).toBe(201);
    expect(res.body.organization).toBeNull();
    expect(res.body.user.role).toBe('donor');
    expect(res.body.user.loginType).toBe('own_email');
  });

  it('rejects a duplicate email', async () => {
    await createTestUser({ email: 'dupe@example.com', role: 'donor', loginType: 'own_email' });

    const res = await request(app).post('/api/organizations/register').send({
      entityKind: 'donor_individual',
      name: 'Someone',
      email: 'dupe@example.com',
      password: 'StrongPass123',
    });

    expect(res.status).toBe(409);
  });

  it('rejects a short password', async () => {
    const res = await request(app).post('/api/organizations/register').send({
      entityKind: 'donor_individual',
      name: 'Someone',
      email: 'short@example.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/organizations and PATCH /:id/verify', () => {
  it('an organization user sees only their own organization', async () => {
    const orgA = await Organization.create({ name: 'Org A', type: 'ngo', verificationStatus: 'unverified' });
    const orgB = await Organization.create({ name: 'Org B', type: 'private', verificationStatus: 'unverified' });

    await createTestUser({
      email: 'usera@orga.com',
      role: 'ngo_ingo',
      loginType: 'org_email',
      scope: { organizationId: orgA._id },
    });

    const token = await login('usera@orga.com');
    const res = await request(app).get('/api/organizations').set('Authorization', `Bearer ${token}`);

    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.organizations[0]._id).toBe(String(orgA._id));
    expect(res.body.organizations.map((o: { _id: string }) => o._id)).not.toContain(String(orgB._id));
  });

  it('central sees every organization and can verify one', async () => {
    const org = await Organization.create({ name: 'Pending Org', type: 'ingo', verificationStatus: 'unverified' });
    await createTestUser({ email: 'central3@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central3@test.local');

    const listRes = await request(app).get('/api/organizations').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.organizations.length).toBeGreaterThanOrEqual(1);

    const verifyRes = await request(app)
      .patch(`/api/organizations/${org._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'verified' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.organization.verificationStatus).toBe('verified');
  });

  it('rejects verification from a non-central role', async () => {
    const org = await Organization.create({ name: 'Another Org', type: 'ngo', verificationStatus: 'unverified' });
    await createTestUser({ email: 'ward5@test.local', role: 'municipality_ward', loginType: 'gov_email' });
    const token = await login('ward5@test.local');

    const res = await request(app)
      .patch(`/api/organizations/${org._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'verified' });

    expect(res.status).toBe(403);
  });
});
