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
  const siteA = await Site.create({ wardId: wardA._id, name: 'Site A', siteType: 'settlement', accessMode: 'road' });
  const siteB = await Site.create({ wardId: wardB._id, name: 'Site B', siteType: 'settlement', accessMode: 'road' });
  return { province, district, muniA, muniB, wardA, wardB, siteA, siteB };
}

describe('POST /api/requirements (submission, cluster + category tagging)', () => {
  it('lets a volunteer submit a requirement at their own site with a computed priority score', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-req1@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol-req1@test.local');

    const res = await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        siteId: String(siteA._id),
        cluster: 'wash',
        category: 'water',
        quantityRequested: 500,
        populationAffected: 80,
        vulnerableCount: 10,
        availableSupplyRatio: 0.2,
        hazardActive: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.requirement.status).toBe('submitted');
    expect(res.body.requirement.priorityScore).toBeGreaterThan(0);
    expect(res.body.requirement.history).toHaveLength(1);
  });

  it('rejects submission at a site outside the volunteer\'s municipality', async () => {
    const { province, district, muniA, wardA, siteB } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-req2@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol-req2@test.local');

    const res = await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteB._id), cluster: 'health', category: 'medicine', quantityRequested: 10 });

    expect(res.status).toBe(403);
  });

  it('rejects submission from an organization role', async () => {
    const { siteA } = await seedGeoAndSite();
    await createTestUser({ email: 'ngo-req1@test.local', role: 'ngo_ingo', loginType: 'org_email' });
    const token = await login('ngo-req1@test.local');

    const res = await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), cluster: 'health', category: 'medicine', quantityRequested: 10 });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/requirements (scoping)', () => {
  it('scopes a volunteer to only their own submissions', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-req3@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const tokenA = await login('vol-req3@test.local');
    await createTestUser({
      email: 'vol-req4@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const tokenB = await login('vol-req4@test.local');

    await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ siteId: String(siteA._id), cluster: 'wash', category: 'water', quantityRequested: 5 });
    await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ siteId: String(siteA._id), cluster: 'health', category: 'medicine', quantityRequested: 5 });

    const listA = await request(app).get('/api/requirements').set('Authorization', `Bearer ${tokenA}`);
    expect(listA.body.requirements).toHaveLength(1);
    expect(listA.body.requirements[0].cluster).toBe('wash');
  });

  it('gives a municipality_ward officer every requirement in their municipality, not just their own', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-req5@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-req5@test.local');
    await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ siteId: String(siteA._id), cluster: 'shelter', category: 'tarpaulin', quantityRequested: 20 });

    await createTestUser({
      email: 'muni-req1@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id },
    });
    const muniToken = await login('muni-req1@test.local');

    const list = await request(app).get('/api/requirements').set('Authorization', `Bearer ${muniToken}`);
    expect(list.body.requirements.length).toBeGreaterThanOrEqual(1);
  });

  it('gives organizations an empty list rather than raw requirement data', async () => {
    await seedGeoAndSite();
    await createTestUser({ email: 'ngo-req2@test.local', role: 'ngo_ingo', loginType: 'org_email' });
    const token = await login('ngo-req2@test.local');

    const res = await request(app).get('/api/requirements').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.requirements).toEqual([]);
  });

  it('critical=true recomputes and sorts by priority score descending', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({
      email: 'vol-req6@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const token = await login('vol-req6@test.local');

    await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${token}`)
      .send({ siteId: String(siteA._id), cluster: 'wash', category: 'water', quantityRequested: 5, populationAffected: 5 });
    await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${token}`)
      .send({
        siteId: String(siteA._id),
        cluster: 'health',
        category: 'medicine',
        quantityRequested: 5,
        populationAffected: 90,
        vulnerableCount: 15,
        hazardActive: true,
      });

    const res = await request(app).get('/api/requirements?critical=true').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const scores = res.body.requirements.map((r: { priorityScore: number }) => r.priorityScore);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
  });
});
