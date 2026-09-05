import request from 'supertest';
import { createApp } from '../../src/app';
import { createTestUser, TEST_PASSWORD } from './helpers';
import { Province } from '../../src/models/Province';
import { District } from '../../src/models/District';
import { Municipality } from '../../src/models/Municipality';
import { Ward } from '../../src/models/Ward';
import { Site } from '../../src/models/Site';
import { StorageLocation } from '../../src/models/StorageLocation';

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

describe('Transport & Distribution (Phase 5): allocate -> dispatch -> receive -> distribute', () => {
  it('walks a full shipment through the pipeline and keeps the Requirement lifecycle in sync', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();

    await createTestUser({
      email: 'central-t1@test.local',
      role: 'central',
      loginType: 'gov_admin',
      scope: {},
    });
    const centralToken = await login('central-t1@test.local');

    await createTestUser({
      email: 'vol-t1@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-t1@test.local');

    // Submit + approve a requirement
    const submitted = await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ siteId: String(siteA._id), cluster: 'wash', category: 'bottled water', quantityRequested: 100 });
    const requirementId = submitted.body.requirement._id;

    await request(app).patch(`/api/requirements/${requirementId}/approve`).set('Authorization', `Bearer ${centralToken}`);

    // Register a storage location + a Resource
    const storage = await StorageLocation.create({ name: 'Central Depot', type: 'warehouse' });
    const resourceRes = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ resourceType: 'bottled water', unit: 'case', quantity: 100, storageLocationId: String(storage._id) });
    const resourceId = resourceRes.body.resource._id;

    // Allocate the resource to the requirement
    const allocationRes = await request(app)
      .post('/api/allocations')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ requirementId, resourceId, quantityAllocated: 100 });
    expect(allocationRes.status).toBe(201);
    const allocationId = allocationRes.body.allocation._id;

    // Register a vehicle + dispatch the shipment
    const vehicleRes = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ type: 'truck', registrationNumber: `BA-${Date.now()}` });
    const vehicleId = vehicleRes.body.vehicle._id;

    const dispatchRes = await request(app)
      .post('/api/transport')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({
        resourceAllocationId: allocationId,
        vehicleId,
        originLocationId: String(storage._id),
        destinationSiteId: String(siteA._id),
        cargo: { resourceType: 'bottled water', quantity: 100 },
      });
    expect(dispatchRes.status).toBe(201);
    expect(dispatchRes.body.dispatch.status).toBe('dispatched');
    const dispatchId = dispatchRes.body.dispatch._id;

    // Walk the dispatch forward: in_transit -> arrived -> received
    for (const status of ['in_transit', 'arrived', 'received']) {
      const res = await request(app)
        .patch(`/api/transport/${dispatchId}/status`)
        .set('Authorization', `Bearer ${centralToken}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.dispatch.status).toBe(status);
    }

    // Record a household distribution
    const householdRes = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ siteId: String(siteA._id), clientUuid: `hh-${Date.now()}`, headOfHouseholdName: 'Test HH', persons: [] });
    const householdId = householdRes.body.household._id;

    const distRes = await request(app)
      .post('/api/distributions')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ householdId, resourceType: 'bottled water', quantity: 2, transportDispatchId: dispatchId });
    expect(distRes.status).toBe(201);
    expect(distRes.body.distribution.duplicateFlag).toBe(false);

    // A same-day repeat of the same resourceType is flagged as a likely duplicate
    const dupRes = await request(app)
      .post('/api/distributions')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ householdId, resourceType: 'bottled water', quantity: 2 });
    expect(dupRes.status).toBe(201);
    expect(dupRes.body.distribution.duplicateFlag).toBe(true);
  });

  it('rejects an out-of-order dispatch status jump', async () => {
    const { province, district, muniA, wardA, siteA } = await seedGeoAndSite();
    await createTestUser({ email: 'central-t2@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
    const centralToken = await login('central-t2@test.local');
    await createTestUser({
      email: 'vol-t2@test.local',
      role: 'volunteer',
      scope: { provinceId: province._id, districtId: district._id, municipalityId: muniA._id, wardId: wardA._id },
    });
    const volToken = await login('vol-t2@test.local');

    const submitted = await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${volToken}`)
      .send({ siteId: String(siteA._id), cluster: 'wash', category: 'water', quantityRequested: 10 });
    const requirementId = submitted.body.requirement._id;
    await request(app).patch(`/api/requirements/${requirementId}/approve`).set('Authorization', `Bearer ${centralToken}`);

    const storage = await StorageLocation.create({ name: 'Depot 2', type: 'warehouse' });
    const resourceRes = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ resourceType: 'water', unit: 'case', quantity: 10, storageLocationId: String(storage._id) });
    const allocationRes = await request(app)
      .post('/api/allocations')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ requirementId, resourceId: resourceRes.body.resource._id, quantityAllocated: 10 });

    const vehicleRes = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ type: 'truck', registrationNumber: `BA-2-${Date.now()}` });

    const dispatchRes = await request(app)
      .post('/api/transport')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({
        resourceAllocationId: allocationRes.body.allocation._id,
        vehicleId: vehicleRes.body.vehicle._id,
        originLocationId: String(storage._id),
        destinationSiteId: String(siteA._id),
        cargo: { resourceType: 'water', quantity: 10 },
      });

    const badJump = await request(app)
      .patch(`/api/transport/${dispatchRes.body.dispatch._id}/status`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ status: 'distributed' });
    expect(badJump.status).toBe(400);
  });

  it('reports a blocked route and surfaces it in the blocked-routes filter', async () => {
    await createTestUser({ email: 'central-t3@test.local', role: 'central', loginType: 'gov_admin', scope: {} });
    const centralToken = await login('central-t3@test.local');

    const routeRes = await request(app)
      .post('/api/routes')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ name: 'Araniko Highway', fromLocation: 'Kathmandu', toLocation: 'Rasuwa' });
    expect(routeRes.status).toBe(201);

    const conditionRes = await request(app)
      .patch(`/api/routes/${routeRes.body.route._id}/condition`)
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ currentCondition: 'blocked', conditionNote: 'Landslide' });
    expect(conditionRes.status).toBe(200);

    const blockedList = await request(app)
      .get('/api/routes?condition=blocked')
      .set('Authorization', `Bearer ${centralToken}`);
    expect(blockedList.body.routes.some((r: { _id: string }) => r._id === routeRes.body.route._id)).toBe(true);
  });
});
