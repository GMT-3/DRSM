import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';
import { AuditLog } from '../../src/models/AuditLog';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

describe('Server-side scope enforcement (Roles.md access control summary)', () => {
  it('central sees all districts; district_cdo sees only their own', async () => {
    const province = await Province.create({ name: 'Bagmati', code: 'P3-TEST' });
    const rasuwa = await District.create({ provinceId: province._id, name: 'Rasuwa', code: 'RSW-TEST' });
    const nuwakot = await District.create({ provinceId: province._id, name: 'Nuwakot', code: 'NWK-TEST' });

    await createTestUser({ email: 'central2@test.local', role: 'central', loginType: 'gov_admin' });
    await createTestUser({
      email: 'cdo2@test.local',
      role: 'district_cdo',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: rasuwa._id },
    });

    const centralToken = await login('central2@test.local');
    const cdoToken = await login('cdo2@test.local');

    const centralRes = await request(app).get('/api/geo/districts').set('Authorization', `Bearer ${centralToken}`);
    expect(centralRes.body.districts.length).toBeGreaterThanOrEqual(2);

    const cdoRes = await request(app).get('/api/geo/districts').set('Authorization', `Bearer ${cdoToken}`);
    expect(cdoRes.body.districts.length).toBe(1);
    expect(cdoRes.body.districts[0]._id).toBe(String(rasuwa._id));
    expect(cdoRes.body.districts.map((d: { _id: string }) => d._id)).not.toContain(String(nuwakot._id));
  });

  it('municipality_ward cannot create a Site outside its own municipality', async () => {
    const province = await Province.create({ name: 'Bagmati', code: 'P3-TEST2' });
    const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: 'RSW-TEST2' });
    const ownMuni = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
    const otherMuni = await Municipality.create({ districtId: district._id, name: 'Other Muni', type: 'municipality' });
    const ownWard = await Ward.create({ municipalityId: ownMuni._id, wardNumber: 1 });
    const otherWard = await Ward.create({ municipalityId: otherMuni._id, wardNumber: 1 });

    await createTestUser({
      email: 'wardofficer@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: ownMuni._id, wardId: ownWard._id },
    });

    const token = await login('wardofficer@test.local');

    const allowed = await request(app)
      .post('/api/geo/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ wardId: String(ownWard._id), name: 'My Ward Site' });
    expect(allowed.status).toBe(201);

    const denied = await request(app)
      .post('/api/geo/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ wardId: String(otherWard._id), name: 'Someone Else Site' });
    expect(denied.status).toBe(403);
  });

  it('every mutating route produces an AuditLog entry', async () => {
    const province = await Province.create({ name: 'Bagmati', code: 'P3-TEST3' });
    const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: 'RSW-TEST3' });
    const muni = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
    const ward = await Ward.create({ municipalityId: muni._id, wardNumber: 1 });

    await createTestUser({
      email: 'auditward@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muni._id, wardId: ward._id },
    });
    const token = await login('auditward@test.local');

    await request(app)
      .post('/api/geo/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ wardId: String(ward._id), name: 'Audited Site' });

    const logs = await AuditLog.find({ action: 'create', targetType: 'Site' });
    expect(logs.length).toBe(1);
    expect(logs[0].actorRole).toBe('municipality_ward');
  });

  it('non-central roles cannot read the national audit log', async () => {
    await createTestUser({ email: 'volunteerX@test.local', role: 'volunteer', loginType: 'own_email' });
    const token = await login('volunteerX@test.local');
    const res = await request(app).get('/api/audit-logs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
