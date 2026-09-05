import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';
import { Site } from '../../src/models/Site';
import { StorageLocation } from '../../src/models/StorageLocation';
import { Organization } from '../../src/models/Organization';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  return res.body.accessToken as string;
}

async function seedApprovedRequirement() {
  const province = await Province.create({ name: 'Bagmati', code: `P-${Date.now()}-${Math.random()}` });
  const district = await District.create({ provinceId: province._id, name: 'Rasuwa', code: `D-${Date.now()}-${Math.random()}` });
  const muniA = await Municipality.create({ districtId: district._id, name: 'Gosaikunda', type: 'rural_municipality' });
  const wardA = await Ward.create({ municipalityId: muniA._id, wardNumber: 1 });
  const siteA = await Site.create({ wardId: wardA._id, name: 'Site A', siteType: 'settlement', accessMode: 'road' });

  await createTestUser({
    email: 'vol-sa1@test.local',
    role: 'volunteer',
    scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
  });
  const volToken = await login('vol-sa1@test.local');
  const submitted = await request(app)
    .post('/api/requirements')
    .set('Authorization', `Bearer ${volToken}`)
    .send({ siteId: String(siteA._id), cluster: 'wash', category: 'bottled water', quantityRequested: 500 });
  const requirementId = submitted.body.requirement._id;

  await createTestUser({
    email: 'cdo-sa1@test.local',
    role: 'district_cdo',
    loginType: 'gov_email',
    scope: { provinceId: province._id, districtId: district._id },
  });
  const cdoToken = await login('cdo-sa1@test.local');
  await request(app).patch(`/api/requirements/${requirementId}/approve`).set('Authorization', `Bearer ${cdoToken}`).send({});

  await createTestUser({ email: 'central-sa1@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
  const centralToken = await login('central-sa1@test.local');

  return { requirementId, centralToken, siteA };
}

/**
 * Supply Assistance workflow (user requirement, 2026-09-04): Central opens
 * a request describing a shortfall against an approved Requirement; NGOs
 * and INGOs can offer quantities; Central decides which offers to accept,
 * converting them into confirmed Resources.
 */
describe('Supply Assistance workflow (Central <-> NGOs/INGOs)', () => {
  it('lets Central open a request, an NGO offer supplies, and Central accept the offer into inventory', async () => {
    const { requirementId, centralToken } = await seedApprovedRequirement();

    const createRes = await request(app)
      .post('/api/supply-assistance')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({
        requirementId,
        quantityNeeded: 200,
        quantityGovernmentCommitted: 300,
        unit: 'case',
        category: 'bottled water',
        note: 'Government can only cover 300 of the 500 requested',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.supplyAssistanceRequest.status).toBe('open');
    const supplyRequestId = createRes.body.supplyAssistanceRequest._id;

    const org = await Organization.create({ name: 'Helping Hands INGO', type: 'ingo' });
    await createTestUser({
      email: 'ingo-sa1@test.local',
      role: 'ngo_ingo',
      loginType: 'org_email',
      scope: { organizationId: String(org._id) },
    });
    const ingoToken = await login('ingo-sa1@test.local');

    const listAsNgo = await request(app).get('/api/supply-assistance').set('Authorization', `Bearer ${ingoToken}`);
    expect(listAsNgo.status).toBe(200);
    expect(listAsNgo.body.supplyAssistanceRequests.some((r: { _id: string }) => r._id === supplyRequestId)).toBe(true);

    const offerRes = await request(app)
      .post(`/api/supply-assistance/${supplyRequestId}/offers`)
      .set('Authorization', `Bearer ${ingoToken}`)
      .send({ quantityOffered: 200, note: 'We can cover the full shortfall' });
    expect(offerRes.status).toBe(201);
    const offerId = offerRes.body.supplyAssistanceRequest.offers[0]._id;

    const storage = await StorageLocation.create({ name: 'INGO Drop Point', type: 'warehouse' });
    const acceptRes = await request(app)
      .patch(`/api/supply-assistance/${supplyRequestId}/offers/${offerId}`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ decision: 'accepted', storageLocationId: String(storage._id) });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.supplyAssistanceRequest.status).toBe('fulfilled');
    expect(acceptRes.body.supplyAssistanceRequest.offers[0].status).toBe('accepted');
    expect(acceptRes.body.supplyAssistanceRequest.offers[0].resourceId).toBeDefined();

    // The accepted offer is now a confirmed Resource Central can see and allocate like any other stock.
    const resourceList = await request(app)
      .get('/api/resources?ownerType=organization')
      .set('Authorization', `Bearer ${centralToken}`);
    expect(
      resourceList.body.resources.some((r: { _id: string }) => r._id === acceptRes.body.supplyAssistanceRequest.offers[0].resourceId),
    ).toBe(true);
  });

  it('lets Central decline an offer without fulfilling the request', async () => {
    const { requirementId, centralToken } = await seedApprovedRequirement();

    const createRes = await request(app)
      .post('/api/supply-assistance')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ requirementId, quantityNeeded: 100, unit: 'case', category: 'bottled water' });
    const supplyRequestId = createRes.body.supplyAssistanceRequest._id;

    const org = await Organization.create({ name: 'Private Org Co', type: 'private' });
    await createTestUser({
      email: 'priv-sa1@test.local',
      role: 'private_org',
      loginType: 'org_email',
      scope: { organizationId: String(org._id) },
    });
    const privToken = await login('priv-sa1@test.local');

    const offerRes = await request(app)
      .post(`/api/supply-assistance/${supplyRequestId}/offers`)
      .set('Authorization', `Bearer ${privToken}`)
      .send({ quantityOffered: 50 });
    const offerId = offerRes.body.supplyAssistanceRequest.offers[0]._id;

    const declineRes = await request(app)
      .patch(`/api/supply-assistance/${supplyRequestId}/offers/${offerId}`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ decision: 'declined' });

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.supplyAssistanceRequest.status).toBe('open');
    expect(declineRes.body.supplyAssistanceRequest.offers[0].status).toBe('declined');
  });

  it('rejects a non-central attempt to open a supply assistance request', async () => {
    const { requirementId } = await seedApprovedRequirement();
    await createTestUser({
      email: 'muni-sa1@test.local',
      role: 'municipality_ward',
      loginType: 'gov_email',
      scope: {},
    });
    const muniToken = await login('muni-sa1@test.local');

    const res = await request(app)
      .post('/api/supply-assistance')
      .set('Authorization', `Bearer ${muniToken}`)
      .send({ requirementId, quantityNeeded: 100, unit: 'case', category: 'bottled water' });

    expect(res.status).toBe(403);
  });

  it('rejects an offer from a role other than NGO/INGO or private org', async () => {
    const { requirementId, centralToken } = await seedApprovedRequirement();
    const createRes = await request(app)
      .post('/api/supply-assistance')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ requirementId, quantityNeeded: 100, unit: 'case', category: 'bottled water' });
    const supplyRequestId = createRes.body.supplyAssistanceRequest._id;

    await createTestUser({ email: 'donor-sa1@test.local', role: 'donor', loginType: 'org_email' });
    const donorToken = await login('donor-sa1@test.local');

    const res = await request(app)
      .post(`/api/supply-assistance/${supplyRequestId}/offers`)
      .set('Authorization', `Bearer ${donorToken}`)
      .send({ quantityOffered: 10 });

    expect(res.status).toBe(403);
  });
});
