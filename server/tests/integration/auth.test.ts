import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { AuditLog } from '../../src/models/AuditLog';

const app = createApp();

describe('POST /api/auth/login', () => {
  it('logs in a valid user and returns a scoped access token', async () => {
    await createTestUser({
      email: 'central@test.local',
      role: 'central',
      loginType: 'gov_admin',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'central@test.local', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.role).toBe('central');
  });

  it('rejects an invalid password', async () => {
    await createTestUser({ email: 'volunteer@test.local', role: 'volunteer', loginType: 'own_email' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'volunteer@test.local', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects a deactivated user', async () => {
    await createTestUser({
      email: 'inactive@test.local',
      role: 'volunteer',
      loginType: 'own_email',
      active: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@test.local', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('writes an AuditLog entry on successful login', async () => {
    await createTestUser({ email: 'audit@test.local', role: 'central', loginType: 'gov_admin' });

    await request(app).post('/api/auth/login').send({ email: 'audit@test.local', password: TEST_PASSWORD });

    const logs = await AuditLog.find({ action: 'login' });
    expect(logs.length).toBe(1);
    expect(logs[0].actorRole).toBe('central');
  });
});

describe('GET /api/auth/me', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    await createTestUser({ email: 'me@test.local', role: 'municipality_ward', loginType: 'gov_email' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'me@test.local', password: TEST_PASSWORD });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('me@test.local');
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token from a valid refresh token', async () => {
    await createTestUser({ email: 'refresh@test.local', role: 'central', loginType: 'gov_admin' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'refresh@test.local', password: TEST_PASSWORD });

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
  });

  it('rejects a garbage refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });
});
