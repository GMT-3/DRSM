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
  const wardA = await Ward.create({ municipalityId: muniA._id, wardNumber: 1 });
  const siteA = await Site.create({ wardId: wardA._id, name: 'Site A', siteType: 'settlement', accessMode: 'road' });
  return { province, district, muniA, wardA, siteA };
}

describe('GET /api/situation/overview (Phase 6: Situation & Coordination)', () => {
  it('gives central an aggregate view including an outstanding requirement', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({ email: 'central-s1@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
    const centralToken = await login('central-s1@test.local');
    await createTestUser({
      email: 'vol-s1@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-s1@test.local');

    await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ siteId: String(siteA._id), cluster: 'wash', category: 'water', quantityRequested: 50 });

    const res = await request(app).get('/api/situation/overview').set('Authorization', `Bearer ${centralToken}`);
    expect(res.status).toBe(200);
    expect(res.body.outstandingRequirements.count).toBeGreaterThanOrEqual(1);
    expect(res.body.supplyDemand.some((s: { cluster: string }) => s.cluster === 'wash')).toBe(true);
  });

  it('gives an NGO the same shared coordination view rather than an empty one', async () => {
    await createTestUser({
      email: 'ngo-s1@test.local',
      role: 'ngo_ingo',
      loginType: 'org_email',
      scope: { organizationId: 'org-1' },
    });
    const token = await login('ngo-s1@test.local');
    const res = await request(app).get('/api/situation/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notShared).toBeUndefined();
  });

  it('tells a donor the coordination view is not shared with them', async () => {
    await createTestUser({ email: 'donor-s1@test.local', role: 'donor', loginType: 'own_email', scope: {} });
    const token = await login('donor-s1@test.local');
    const res = await request(app).get('/api/situation/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.notShared).toBe(true);
  });
});
