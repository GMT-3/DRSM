/* eslint-disable no-console */
// Dummy data for exercising the "Requirement History" tracking feature
// (Modules.md module 2 / Roles.md "Tracking — the core requirement") end
// to end in the UI, without needing to walk every requirement through the
// real approve -> allocate -> dispatch -> receive flow by hand first.
//
// Builds on the same pilot geography/users as seedAll.ts (calling
// seedGeographyAndUsers() directly, so this script is safe to run on its
// own — `npm run seed:tracking` — even if `npm run seed` hasn't been run
// yet) and creates four Requirements, one at each stage the tracking
// timeline can show:
//   1. submitted            — just raised by a volunteer, nothing else yet
//   2. approved              — reviewed, not yet allocated
//   3. dispatched / in transit — allocated, dispatched, currently moving
//   4. delivered              — confirmed received at Municipality/Ward
//      (this build's terminal tracked stage — see Rule.md's 2026-09-05
//      update and utils/trackingTimeline.ts)
import { connectDB, disconnectDB } from '../config/db';
import { seedGeographyAndUsers } from './seedAll';
import { Requirement, IRequirementHistoryEntry } from '../models/Requirement';
import { StorageLocation } from '../models/StorageLocation';
import { Resource } from '../models/Resource';
import { ResourceAllocation } from '../models/ResourceAllocation';
import { Vehicle } from '../models/Vehicle';
import { TransportDispatch } from '../models/TransportDispatch';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function history(entries: Array<[IRequirementHistoryEntry['status'], Date, string, string?]>) {
  return entries.map(([status, at, byUserId, note]) => ({ status, at, byUserId, note }));
}

async function main() {
  await connectDB();
  console.log('[seed:tracking] ensuring pilot geography/users exist...');
  const { timureSite, bidurCampSite, users } = await seedGeographyAndUsers();

  const volunteer = users['sita.volunteer@example.com'];
  const army = users['shrestha.army@nepalarmy.mil.np'];
  const cdo = users['cdo.rasuwa@drms.gov.np'];
  const central = users['central.admin@drms.gov.np'];

  console.log('[seed:tracking] seeding demo requirements at each tracking stage...');

  // --- Requirement 1: just submitted, nothing else yet ---------------
  const r1 = await Requirement.findOneAndUpdate(
    { siteId: timureSite._id, category: 'Bottled water (demo)' },
    {
      siteId: timureSite._id,
      cluster: 'wash',
      category: 'Bottled water (demo)',
      description: 'Dummy seed: freshly submitted, awaiting review',
      quantityRequested: 150,
      submittedByUserId: volunteer._id,
      submittedByRole: 'volunteer',
      submittedAt: hoursAgo(6),
      status: 'submitted',
      history: history([['submitted', hoursAgo(6), String(volunteer._id), 'Seed: submitted from the field']]),
    },
    { upsert: true, new: true },
  );

  // --- Requirement 2: approved, not yet allocated ---------------------
  const r2 = await Requirement.findOneAndUpdate(
    { siteId: timureSite._id, category: 'Tarpaulin sheets (demo)' },
    {
      siteId: timureSite._id,
      cluster: 'shelter',
      category: 'Tarpaulin sheets (demo)',
      description: 'Dummy seed: approved, waiting on resource allocation',
      quantityRequested: 40,
      submittedByUserId: volunteer._id,
      submittedByRole: 'volunteer',
      submittedAt: hoursAgo(50),
      status: 'approved',
      approvedByUserId: cdo._id,
      approvedAt: hoursAgo(40),
      history: history([
        ['submitted', hoursAgo(50), String(volunteer._id), 'Seed: submitted from the field'],
        ['approved', hoursAgo(40), String(cdo._id), 'Seed: verified by District/CDO'],
      ]),
    },
    { upsert: true, new: true },
  );

  // --- Shared depot + vehicles for the two in-pipeline requirements ---
  const depot = await StorageLocation.findOneAndUpdate(
    { name: 'Kathmandu Central Depot (demo)' },
    { name: 'Kathmandu Central Depot (demo)', type: 'warehouse' },
    { upsert: true, new: true },
  );
  const truckInTransit = await Vehicle.findOneAndUpdate(
    { registrationNumber: 'BA-1-KHA-1001 (demo)' },
    { type: 'truck', registrationNumber: 'BA-1-KHA-1001 (demo)', active: true },
    { upsert: true, new: true },
  );
  const truckDelivered = await Vehicle.findOneAndUpdate(
    { registrationNumber: 'BA-1-KHA-2002 (demo)' },
    { type: 'truck', registrationNumber: 'BA-1-KHA-2002 (demo)', active: true },
    { upsert: true, new: true },
  );

  // --- Requirement 3: allocated -> dispatched -> in transit -----------
  const resource3 = await Resource.findOneAndUpdate(
    { resourceType: 'Medicine kits (demo)', storageLocationId: depot._id },
    {
      ownerType: 'government',
      ownerId: central._id,
      resourceType: 'Medicine kits (demo)',
      unit: 'kit',
      quantity: 25,
      storageLocationId: depot._id,
      state: 'allocated',
    },
    { upsert: true, new: true },
  );
  const r3 = await Requirement.findOneAndUpdate(
    { siteId: bidurCampSite._id, category: 'Medicine kits (demo)' },
    {
      siteId: bidurCampSite._id,
      cluster: 'health',
      category: 'Medicine kits (demo)',
      description: 'Dummy seed: on the road, in transit to the relief camp',
      quantityRequested: 25,
      submittedByUserId: army._id,
      submittedByRole: 'army',
      submittedAt: hoursAgo(30),
      status: 'dispatched',
      approvedByUserId: cdo._id,
      approvedAt: hoursAgo(26),
      history: history([
        ['submitted', hoursAgo(30), String(army._id), 'Seed: submitted from the field'],
        ['approved', hoursAgo(26), String(cdo._id), 'Seed: verified by District/CDO'],
        ['allocated', hoursAgo(20), String(central._id), 'Seed: resource allocated'],
        ['dispatched', hoursAgo(14), String(central._id), 'Seed: dispatch created'],
      ]),
    },
    { upsert: true, new: true },
  );
  const allocation3 = await ResourceAllocation.findOneAndUpdate(
    { requirementId: r3._id },
    {
      requirementId: r3._id,
      resourceId: resource3._id,
      fromLevel: 'central',
      fromUserId: central._id,
      toLevel: 'site',
      toEntityId: r3.siteId,
      quantityAllocated: 25,
      allocatedAt: hoursAgo(20),
      status: 'dispatched',
    },
    { upsert: true, new: true },
  );
  await TransportDispatch.findOneAndUpdate(
    { resourceAllocationId: allocation3._id },
    {
      resourceAllocationId: allocation3._id,
      vehicleId: truckInTransit._id,
      originLocationId: depot._id,
      destinationSiteId: bidurCampSite._id,
      cargo: { resourceType: 'Medicine kits (demo)', quantity: 25 },
      status: 'in_transit',
      currentPosition: { lat: 27.9, lng: 85.15 },
      lastPositionUpdateAt: hoursAgo(3),
      expectedArrivalAt: hoursAgo(-6), // 6 hours from now
      dispatchedAt: hoursAgo(14),
      dispatchedByUserId: central._id,
    },
    { upsert: true, new: true },
  );

  // --- Requirement 4: allocated -> dispatched -> received (delivered,
  //     confirmed at Municipality/Ward — this build's terminal stage) --
  const resource4 = await Resource.findOneAndUpdate(
    { resourceType: 'Rice (demo)', storageLocationId: depot._id },
    {
      ownerType: 'government',
      ownerId: central._id,
      resourceType: 'Rice (demo)',
      unit: 'sack',
      quantity: 200,
      storageLocationId: depot._id,
      state: 'allocated',
    },
    { upsert: true, new: true },
  );
  const r4 = await Requirement.findOneAndUpdate(
    { siteId: timureSite._id, category: 'Rice (demo)' },
    {
      siteId: timureSite._id,
      cluster: 'food_security',
      category: 'Rice (demo)',
      description: 'Dummy seed: delivered and confirmed at the Municipality/Ward',
      quantityRequested: 200,
      submittedByUserId: volunteer._id,
      submittedByRole: 'volunteer',
      submittedAt: hoursAgo(72),
      status: 'delivered',
      approvedByUserId: cdo._id,
      approvedAt: hoursAgo(65),
      history: history([
        ['submitted', hoursAgo(72), String(volunteer._id), 'Seed: submitted from the field'],
        ['approved', hoursAgo(65), String(cdo._id), 'Seed: verified by District/CDO'],
        ['allocated', hoursAgo(55), String(central._id), 'Seed: resource allocated'],
        ['dispatched', hoursAgo(48), String(central._id), 'Seed: dispatch created'],
        ['delivered', hoursAgo(20), String(central._id), 'Seed: shipment received at site'],
      ]),
    },
    { upsert: true, new: true },
  );
  const allocation4 = await ResourceAllocation.findOneAndUpdate(
    { requirementId: r4._id },
    {
      requirementId: r4._id,
      resourceId: resource4._id,
      fromLevel: 'central',
      fromUserId: central._id,
      toLevel: 'site',
      toEntityId: r4.siteId,
      quantityAllocated: 200,
      allocatedAt: hoursAgo(55),
      status: 'delivered',
    },
    { upsert: true, new: true },
  );
  await TransportDispatch.findOneAndUpdate(
    { resourceAllocationId: allocation4._id },
    {
      resourceAllocationId: allocation4._id,
      vehicleId: truckDelivered._id,
      originLocationId: depot._id,
      destinationSiteId: timureSite._id,
      cargo: { resourceType: 'Rice (demo)', quantity: 200 },
      status: 'received',
      lastPositionUpdateAt: hoursAgo(20),
      dispatchedAt: hoursAgo(48),
      dispatchedByUserId: central._id,
    },
    { upsert: true, new: true },
  );

  console.log('\n[seed:tracking] done. Four demo requirements are ready to inspect under');
  console.log('  Module 2 (Necessity/Requirements) -> "Requirement History" -> "View trace":');
  console.log(`    - ${r1.category} at ${timureSite.name}: submitted`);
  console.log(`    - ${r2.category} at ${timureSite.name}: approved`);
  console.log(`    - ${r3.category} at ${bidurCampSite.name}: dispatched / in transit`);
  console.log(`    - ${r4.category} at ${timureSite.name}: delivered (confirmed at Municipality/Ward)`);
  console.log('\n  Log in as central.admin@drms.gov.np, cdo.rasuwa@drms.gov.np, or');
  console.log('  ward.gosaikunda@drms.gov.np (password: Passw0rd!123) to view all four.');

  await disconnectDB();
}

main().catch((err) => {
  console.error('[seed:tracking] failed:', err);
  process.exit(1);
});
