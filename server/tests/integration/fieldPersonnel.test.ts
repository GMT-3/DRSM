import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';

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
  const wardA = await Ward.create({ municipalityId: muniA._id, wardNumber: 1 });
  const wardB = await Ward.create({ municipalityId: muniB._id, wardNumber: 1 });
  return { province, district, muniA, muniB, wardA, wardB };
}

describe('POST /api/users/field-personnel (Volunteer/Police/Army appointment)', () => {
  it('lets a municipality_ward officer appoint a volunteer inside their own municipality', async () => {
    const { province, district, muniA, wardA } = await seedGeo();
    await createTestUser({
      email: 'wardofficer1@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const token = await login('wardofficer1@test.local');

    const res = await request(app)
      .post('/api/users/field-personnel')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Volunteer',
        email: 'newvolunteer@example.com',
        role: 'volunteer',
        category: 'food',
        wardId: String(wardA._id),
      });

    expect(res.status).toBe(201);
    expect(res.body.tempPassword).toBeDefined();
    expect(res.body.user.role).toBe('volunteer');

    // The generated credential must actually work.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'newvolunteer@example.com', password: res.body.tempPassword });
    expect(loginRes.status).toBe(200);
  });

  it('rejects appointing into a ward outside the caller\'s municipality', async () => {
    const { province, district, muniA, wardB } = await seedGeo();
    await createTestUser({
      email: 'wardofficer2@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const token = await login('wardofficer2@test.local');

    const res = await request(app)
      .post('/api/users/field-personnel')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Should Fail',
        email: 'shouldfail@example.com',
        role: 'police',
        category: 'security',
        wardId: String(wardB._id),
      });

    expect(res.status).toBe(403);
  });

  it('rejects appointment from a non-municipality_ward role', async () => {
    const { wardA } = await seedGeo();
    await createTestUser({ email: 'centralX@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('centralX@test.local');

    const res = await request(app)
      .post('/api/users/field-personnel')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'x@example.com', role: 'army', category: 'logistics', wardId: String(wardA._id) });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/field-personnel/:id/active', () => {
  it('lets the appointing municipality deactivate an account it appointed', async () => {
    const { province, district, muniA, wardA } = await seedGeo();
    const officer = await createTestUser({
      email: 'wardofficer3@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const token = await login('wardofficer3@test.local');

    const appointRes = await request(app)
      .post('/api/users/field-personnel')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Volly', email: 'volly@example.com', role: 'volunteer', category: 'water', wardId: String(wardA._id) });

    const userId = appointRes.body.user.id;

    const deactivateRes = await request(app)
      .patch(`/api/users/field-personnel/${userId}/active`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false });

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.user.active).toBe(false);

    const loginRes = await request(app).post('/api/auth/login').send({ email: 'volly@example.com', password: 'irrelevant' });
    expect(loginRes.status).toBe(401);
    void officer;
  });
});

describe('POST /api/users/gov-accounts (Central only)', () => {
  it('lets central create a district_cdo account', async () => {
    const { district } = await seedGeo();
    await createTestUser({ email: 'central4@test.local', role: 'central', loginType: 'gov_admin' });
    const token = await login('central4@test.local');

    const res = await request(app)
      .post('/api/users/gov-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New CDO', email: 'newcdo@drms.gov.np', role: 'district_cdo', districtId: String(district._id) });

    expect(res.status).toBe(201);
    expect(res.body.tempPassword).toBeDefined();
    expect(res.body.user.role).toBe('district_cdo');
  });

  it('rejects a non-central caller', async () => {
    const { district } = await seedGeo();
    await createTestUser({ email: 'cdoY@test.local', role: 'district_cdo', loginType: 'gov_email' });
    const token = await login('cdoY@test.local');

    const res = await request(app)
      .post('/api/users/gov-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'x2@drms.gov.np', role: 'municipality_ward', districtId: String(district._id) });

    expect(res.status).toBe(403);
  });
});
