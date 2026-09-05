# DRMS — Disaster Response Management System

Operational name for the **Integrated Coordinated System for Disaster Management and Tracking (ICS-DMT)**.
Full specification lives in the `docs/` folder alongside this project (`../docs/`): `Prd.md`, `Roles.md`,
`Modules.md`, `Schema.md`, `Appflow.md`, `Design.md`, `Tech.md`, `Implementation.md`, `Tracker.md`, `Rule.md`.

## Structure
- `server/` — Node.js + Express + TypeScript API (MongoDB via Mongoose), deployed to Render.
- `client/` — React (Vite) + TypeScript dashboard (all government/organization roles), deployed to Vercel.
  - The offline field PWA for Volunteer/Police/Army is a later phase (Phase 2 per `Implementation.md`).

## Status
Build follows `../docs/Implementation.md`'s phases in order. See `../docs/Tracker.md` for the live checklist.
**All engineering phases (0-9) are complete.** Phases 10 (Pilot) and 11 (Provincial rollout) are
government-process phases — pilot-area selection, formal field-personnel appointment, a live
end-to-end exercise, and a rollout decision — not engineering work, and are outside this codebase's
scope. This is the final build: run it, test it, and see the "Notes on this build" section below for
an honest list of what's scoped down or out.

Phase 1 added:
- Public self-registration for NGO/INGO/Private Organizations and Donors (`POST /api/organizations/register`, page at `/register`)
- Central-only organization verification queue (`GET /api/organizations`, `PATCH /api/organizations/:id/verify`)
- Volunteer/Police/Army appointment restricted to the appointing Municipality/Ward, with a one-time generated temp password (`POST /api/users/field-personnel`)
- Field-personnel roster + activate/deactivate, scoped per role (`GET/PATCH /api/users/field-personnel/...`)
- Central-only District/CDO and Municipality/Ward account creation (`POST /api/users/gov-accounts`)
- Module 7 (Organizations & Users) now has real, role-aware screens instead of the placeholder

Phase 2 added:
- Household + Person registration at a Site (`POST /api/households`, `POST /api/households/:id/persons`), restricted to Volunteer/Police/Army at their own site or Municipality/Ward + Central administratively
- Person status/vulnerability-flag updates (`PATCH /api/households/:id/persons/:personId`) that union vulnerability flags rather than overwrite them, so a stale offline copy can never drop a flag
- QR code generation (`qrcode` package) keyed to the household's `clientUuid`, printable both offline (client-rendered) and after sync (server-rendered) — same payload either way
- Offline background sync: a hand-rolled IndexedDB outbox (`client/src/offline/db.ts`) + sync engine (`client/src/offline/syncEngine.ts`) queue every household write locally first, then flush to a bulk upsert-by-`clientUuid` endpoint (`POST /api/households/sync`) on reconnect and a periodic probe
- `GET /api/demographic/summary` — Population Status / Demographic Composition / per-site rollups (household count, population, access mode, last-update freshness), scoped per role; organizations get an explicit empty response rather than raw data
- `PATCH /api/geo/sites/:id/access-mode` — Central or the owning Municipality/Ward can update a Site's daily access-mode indicator
- Module 1 (Demographic) now has real, role-aware screens: offline household registration + QR cards for field roles, a population/composition/site-status overview for government roles, a not-shared note for organizations

Phase 3 added:
- Requirement submission with cluster + category tagging (`POST /api/requirements`), restricted to Volunteer/Police/Army at their own site or Municipality/Ward + Central administratively
- Scoped listing with Modules.md's named-bucket filters and a live-recomputed critical/urgent sort (`GET /api/requirements?status=&cluster=&critical=true`)
- Approval workflow (`PATCH /api/requirements/:id/approve`, `/:id/reject`) and a forward-only lifecycle endpoint (`PATCH /api/requirements/:id/status`) enforcing Schema.md's submitted -> approved -> allocated -> dispatched -> delivered -> fulfilled/partially_fulfilled order, every transition recorded in the Requirement's embedded history
- A pure, unit-tested priority-scoring formula (population, vulnerability, supply gap, time waited, Site accessibility, active hazard) computed at submission and on every status change
- Ward/CDO demand-consolidation workflow (`POST /api/requirements/consolidate`) rolling multiple approved requirements into one combined, pre-approved escalated request while keeping every source traceable via `consolidatedIntoId`
- Module 2 (Necessity/Requirements) now has a real, role-aware, tabbed screen instead of the placeholder

Phase 4 added:
- Storage location management (`POST`/`GET /api/storage-locations`), restricted to Central/District-CDO/Municipality-Ward, each non-central creator's location anchored to their own scope
- Government + organization inventory records (`POST`/`GET /api/resources`, `PATCH /api/resources/:id/state`) split by `ownerType`, scoped for government roles via the resource's storage location and for organization roles via their own `organizationId`; donors get an empty list
- Resource contribution submission (`POST /api/resource-contributions`) for NGO/INGO/Private Org/Donor and government roles, and Central-only verification (`PATCH /api/resource-contributions/:id/verify`) that converts a verified contribution into a confirmed Resource
- Inventory movement log (`POST`/`GET /api/inventory-movements`) built on a pure, unit-tested arithmetic core covering transfer (whole-quantity relocation), distribution, and adjustment, with listing scoped to callers who can manage the underlying resource
- Module 4 (Resources & Inventory) now has a real, role-aware screen: a full tab bar with inline movement history for government roles, a scoped inventory + contributions view for organizations, and a contributions-only view for donors

Phase 5 added:
- Dispatch creation against a `ResourceAllocation` (`POST /api/allocations`, `POST /api/transport`), in-transit position tracking (`PATCH /api/transport/:id/position`), and a forward-only dispatched -> in_transit -> delivered/failed status flow (`PATCH /api/transport/:id/status`)
- Vehicle (`POST`/`GET /api/vehicles`) and Route (`POST`/`GET /api/routes`, `PATCH /api/routes/:id/condition`) management, with a blocked/disrupted route view
- Field-side delivery confirmation (`PATCH /api/transport/:id/confirm-delivery`) closing the loop back onto the Requirement
- QR-scan distribution flow (`POST /api/distributions`) with a pure, unit-tested duplicate-delivery flag (same resource type + recipient within a rolling 24-hour window — flagged for review, not blocked)
- Module 5 (Transport & Distribution) now has a real, role-aware, four-tab screen instead of the placeholder

Phase 6 added:
- `GET /api/situation/overview` — a single aggregation covering critical locations, outstanding requirements by cluster, resource gaps, supply-vs-demand, and delayed/at-risk actions
- Deliberately unrestricted, identical view across every government role and every partner role Roles.md lists as needing shared situational awareness (NGO/INGO, Private Org, police, army) — this is a common operating picture by design, not per-organization data; donors get the same not-shared pattern used elsewhere
- Module 6 (Situation & Coordination) now has a real overview screen instead of the placeholder

Phase 7 added:
- Hazard/route and rescue/evacuation field reports (`POST`/`GET /api/field-reports`), deduplicated by `clientUuid` the same way Household sync works
- PriorityCase reporting (`POST /api/priority-cases`) with a pure, unit-tested skip-level notification resolver — Ward/Municipality + District always notified simultaneously, Province added only when severity is critical — and per-level `Notice` records (`POST`/`GET /api/notices`)
- Forward-only escalation status flow (`PATCH /api/priority-cases/:id/status`): reported -> acknowledged -> dispatched -> resolved
- Module 7 (Field Operations) now has real report forms, a PriorityCase form, and a notices/escalation list

Phase 8 added:
- Seven report views (situation, requirement, resource/inventory, transport, distribution, unfulfilled-requirements, response timeline) gated to government roles only (`GET /api/reports/:type`)
- A single generic CSV export endpoint (`GET /api/reports/:type/export`) built on a pure, unit-tested `toCsv` helper — official export is CSV, not a formatted PDF/Excel workbook (see Notes)
- Module 8 (Reports & Analytics) now has a real tabbed screen with a humanized-header results table and a per-tab CSV download

Phase 9 added:
- Administrative-boundary management (`POST /api/admin/provinces|districts|municipalities|wards`, Central-only, parent-validated), DisasterEvent create/list/close, resource & requirement Category management (new `Category` model), and user-permission management — all Central/District-CDO/Municipality-Ward only
- A real-time layer: every audited mutation across the entire project now also broadcasts a WebSocket event, wired through the single `writeAuditLog` hookpoint rather than per-controller emit calls; the header's notification bell now reflects a live unseen-event count
- Module 9 (Administration) now has a real, tabbed screen (Boundaries/Disaster Events/Categories/User Permissions) instead of the placeholder

## 2026-09-04 additions (post-Phase-9)

### MongoDB Atlas
The database connection moved from local MongoDB Compass to MongoDB Atlas. `server/.env`'s
`MONGODB_URI` now points at an `mongodb+srv://` Atlas cluster (with an explicit `/drms` database name
and `retryWrites=true&w=majority`) instead of `mongodb://localhost:27017/...`; no application code
changed, since `connectDB()` already just takes a connection-string env var. `.env` is already covered
by `.gitignore`. Full end-to-end verification of the live Atlas connection could not be completed from
either sandbox available during this change (see Notes below) — the connection string is correctly
formed and DNS/SRV-resolves to real Atlas shard hosts, but the last-mile TCP handshake needs the
running server's IP added to the cluster's Network Access (IP Access List) in the Atlas dashboard,
which only the account owner can do.

### Volunteer -> District/CDO -> Central -> NGO/INGO supply coordination
Refines Phase 3-5's Requirement -> Approval -> Allocation -> Dispatch flow per an explicit routing and
shortfall-coordination rule:

- **CDO-only verification for field-submitted requests.** A Requirement now records `submittedByRole`
  at submission time. When that role is Volunteer/Police/Army, only District/CDO (or Central) can
  approve, reject, or otherwise move it into `approved`/`rejected` — Municipality/Ward is blocked, even
  though it remains in the general reviewer set for Ward/Municipality-submitted requirements. Enforced
  by a small pure, unit-tested helper (`canVerifyRequirement`, `server/src/utils/requirementVerification.ts`)
  wired into `approveRequirement`, `rejectRequirement`, and the `approved`/`rejected` targets of
  `updateRequirementStatus` — the transition-matrix "backdoor" through the generic status endpoint is
  closed the same way the dedicated endpoints are.
- **Supply Assistance requests** (new `SupplyAssistanceRequest` model, `POST`/`GET /api/supply-assistance`):
  once Central reviews an approved Requirement and finds government stock falls short, Central opens a
  request describing the shortfall (what's needed vs. what government is already committing). Any
  NGO/INGO or Private Organization can offer a quantity (`POST /api/supply-assistance/:id/offers`);
  Central accepts or declines each offer (`PATCH /api/supply-assistance/:id/offers/:offerId`). Accepting
  converts the offer straight into a confirmed `Resource` owned by the offering organization — the same
  pledge-then-verify pattern `ResourceContribution`/`verifyContribution` already used, reused rather than
  reinvented — and the request auto-flips to `fulfilled` once accepted offers cover the needed quantity
  (pure, unit-tested `sumAcceptedOfferQuantity`/`isRequestFulfilled`, `server/src/utils/supplyAssistance.ts`).
  Central then allocates/dispatches the resulting Resource to the site exactly like any other stock —
  `ResourceAllocation` gained an optional `linkedSupplyAssistanceRequestId` for traceability, but no new
  dispatch mechanism was built, per the design decision to reuse the existing allocate/dispatch pipeline
  rather than add a second one.
- Module 4 (Resources & Inventory) gained a new "Supply Assistance" tab: a create-request form and
  accept/decline controls for Central, and an offer form for NGO/INGO/Private Org, on the same tab bar
  pattern the rest of the module uses.

## Quick start (dev)

### Server
```bash
cd server
cp .env.example .env   # set MONGODB_URI, JWT secrets
npm install
npm run seed             # seeds pilot geography (Rasuwa/Nuwakot) + one demo user per role
npm run dev               # http://localhost:4000
npm run test:unit         # pure-logic tests (JWT, password hashing, scope-filter derivation) — no DB needed
npm run test:integration  # full HTTP+DB flows via supertest + mongodb-memory-server (needs network access
                           # to download a real mongod binary the first time, or a running MongoDB reachable
                           # at MONGODB_URI)
```

### Client
```bash
cd client
npm install
npm run dev               # http://localhost:5173 (proxies /api to the server above)
npm test                  # vitest + Testing Library — modulesForRole, Login, ProtectedRoute
```

Demo login credentials are printed by `npm run seed` (see `server/src/seed/seedAll.ts`) — all demo
accounts share the password `Passw0rd!123`.

## Notes on this build
- Every collection in `Schema.md` has a Mongoose model under `server/src/models/`, so later phases add
  business logic rather than re-deriving the data model.
- Scope enforcement (Roles.md's access-control summary) is centralized in
  `server/src/middleware/scope.ts` (`buildScopeFilter` / `isWithinCallerScope`) and
  `server/src/utils/scopeResolvers.ts` — every future module should reuse these rather than
  re-deriving visibility rules per route.
- AuditLog writing is centralized in `server/src/middleware/auditLog.ts` (`writeAuditLog` /
  `auditMutation`) — it is the only code path that writes to the `AuditLog` collection.
- The environment this Phase 0 build was developed in blocks outbound access to
  `fastdl.mongodb.org` (and general internet access) by policy, so `mongodb-memory-server`
  couldn't download its test binary here — `npm run test:integration` is untested in that sandbox,
  though the code path is a standard, well-worn pattern. `npm run test:unit` (14 tests covering JWT,
  password hashing, and the scope-filter logic) passes and was verified. Run `test:integration` on a
  machine with normal internet access, or point it at an already-running MongoDB.
- Client has its own Vitest suite (`client/tests/`) covering the sidebar's role-based module
  filtering, the Login form, and the ProtectedRoute auth guard — 10 tests, all passing. Test-run
  note: the first run surfaced a real cross-test-contamination bug (Testing Library's DOM wasn't
  being cleaned up between tests since Vitest's `test.globals` was deliberately left off), which
  made three tests fail on leftover elements from a previous test in the same file. Fixed by
  registering `cleanup()` in `client/tests/setup.ts`; all 10 tests pass now.
- Test run after Phase 1 (2026-09-03): re-verified everything above still passes (server unit now
  17/17, client Vitest still 10/10, tsc/build clean), and confirmed the MongoDB network block is
  unchanged, not a regression. Fixed a real DX bug in the process: a blocked mongod download used to
  print ~30 lines of `mongodb-memory-server`'s own internal stack trace before Jest's failure output,
  which read like the test suite itself was broken. `server/tests/integration/setup.ts` now
  suppresses that internal warning and throws one short, actionable message explaining the network
  restriction and how to run the suite elsewhere. Full detail in `TEST_REPORT.md`.
- Phase 2 (2026-09-03): added `clientUuid` to the `Household` model — not in `Schema.md`'s original
  field list, but required by `Tech.md`'s offline-sync spec ("every queued record carries a
  client-generated UUID"); documented here as a deliberate, minimal schema extension rather than a
  drift from spec. `client/tests/` now also covers the offline outbox for real against
  `fake-indexeddb` (not just a mock), the sync engine's dedup/error/network-failure handling, and a
  role-dispatch smoke test for the Demographic page — 20 client tests total, all passing, plus 22
  server unit tests and 15 new integration tests (40 total, still blocked in this sandbox by the same
  MongoDB network restriction as Phase 0/1 — see `TEST_REPORT.md`). All three role views were
  visually verified via screenshot, including filling the registration form, toggling a vulnerability
  flag, and opening a QR card.
- Phase 3 (2026-09-03): added a `priorityInputs` snapshot (`populationAffected`, `vulnerableCount`,
  `availableSupplyRatio`, `hazardActive`) to the `Requirement` model — Schema.md names these as the
  priority-score inputs but doesn't specify how they're stored, so this follows the same pattern as
  Phase 2's `Household.clientUuid`: a small, documented extension rather than an undocumented drift.
  The scoring formula itself (`server/src/utils/priorityScore.ts`) is pure and unit-tested for
  monotonicity in every input (more population/vulnerability/supply-gap/hazard/inaccessibility/time
  waiting all push the score up, never down) and for the 0-100 clamp. `server/tests/integration/`
  covers submission + scoping + the critical/urgent live-recompute sort, the full approval and
  forward-only lifecycle-transition workflow (including rejecting an out-of-order jump like
  submitted -> dispatched), and the consolidation workflow's guardrails (can't consolidate an
  unapproved or already-consolidated requirement, can't consolidate from a field role) — 57
  integration tests total, still blocked in this sandbox by the same MongoDB restriction as every
  earlier phase. Client tests grew to 23, covering the submission-form-vs-review-actions role split.
  All three review-side screens were visually verified via screenshot.
- Phase 4 (2026-09-03): no model edits were needed — `Resource`, `StorageLocation`,
  `ResourceContribution`, `InventoryMovement`, and `ResourceAllocation` already matched `Schema.md`
  exactly from Phase 0. Two scoping decisions worth recording: (1) `StorageLocation` carries its own
  province/district/municipality fields directly rather than hanging off the Ward -> Site chain used
  by Household/Requirement, so it gets its own `resolveScopedStorageLocationIds` resolver, and
  government-owned `Resource`s are scoped through their storage location rather than through a Site;
  (2) contribution verification is Central-only, per `Roles.md` ("Central Government... lists every
  contribution, decides allocation") and `Rule.md` ("All external contributions must be listed
  centrally... regardless of which level they were given to") — other government roles can still
  list contributions for situational awareness. The movement-arithmetic core
  (`server/src/utils/inventoryMovement.ts`) deliberately only supports whole-quantity transfers,
  since this schema has no way to split one Resource record's quantity across two storage locations
  at once; a partial-quantity transfer is rejected rather than silently mishandled. `server/tests/`
  grew to 38 unit tests and 77 integration tests (still blocked in this sandbox by the same MongoDB
  restriction as every earlier phase); client tests grew to 26. All three role views (government
  inventory with state-change buttons, organization inventory + contributions, donor
  contributions-only) were visually verified via screenshot.
- Phase 5 (2026-09-04): refactored two pieces of Requirement logic (`utils/requirementTransitions.ts`,
  `utils/requirementScope.ts`) out of `requirementController.ts` before building Transport &
  Distribution on top of them, so allocation/dispatch could reuse the exact same forward-only
  transition matrix and site-scope chain rather than duplicating it — verified clean (tsc + full unit
  re-run) at each refactor step. Distribution's duplicate-delivery flag is a flag, not a block, per
  `Rule.md`'s "flag, don't silently allow" duplicate-prevention rule. `server/tests/` grew to 43 unit
  tests and 80 integration tests (still blocked in this sandbox by the same MongoDB restriction as
  every earlier phase); client tests grew to 29.
- Phase 6 (2026-09-04): the Situation & Coordination view is deliberately unrestricted and identical
  across every government role and every partner role (NGO/INGO, Private Org, police, army) — this
  was a considered design choice, not an oversight: `Appflow.md` frames this screen as a common
  operating picture across agencies, so narrowing it per-organization would defeat its purpose. Only
  Donor accounts get the not-shared pattern, matching their access elsewhere.
- Phase 7 (2026-09-04): the skip-level escalation rule from `Rule.md`/`Appflow.md` (Ward/Municipality
  and District always notified together for an emergency, never a strict bottom-up chain; Province
  added only above the critical severity threshold) is implemented as a small pure function,
  `resolveNotifiedLevels(severity)`, unit-tested for every severity level. FieldReport's "pending
  sync" indicator is a simple in-flight counter, not the full IndexedDB queue + background-sync
  engine Household got in Phase 2 — the server's clientUuid-based dedup is identical, so wiring the
  same offline engine to FieldReport later needs no server changes; flagged here rather than left as
  a silent gap.
- Phase 8 (2026-09-04): the situation report reuses the Phase 6 aggregation directly, so the two
  screens can't drift out of sync with each other. "Official export" is delivered as CSV, not a
  formatted PDF or Excel workbook — CSV carries every report's data losslessly and opens in any
  spreadsheet tool, but not letterhead/signature-block formatting a government office might want for
  a printed official report; noted as a deliberate scope decision.
- Phase 9 (2026-09-04): added a `Category` model (not in `Schema.md`, which fixes resource/requirement
  categories as code enums) so Modules.md's admin-configurable category list has somewhere to live —
  the same kind of minimal, documented schema extension as `Household.clientUuid` (Phase 2) and
  `Requirement.priorityInputs` (Phase 3). The real-time layer hooks into the single, already-proven
  `writeAuditLog` write path rather than adding socket-emit calls to dozens of individual
  controllers, so anything audited is live by construction. Three things are honestly scoped down/out
  here: DisasterEvent create/close works but no other module yet scopes its own records to an active
  event (no `Implementation.md` line item required it); the notification bell is in-app/WebSocket
  only, no SMS push (no SMS gateway available in this environment); and SMS/IVR intake for
  Requirement/PriorityCase submission is left out entirely — it needs an external telecom gateway
  this environment can't reach, though the data model already accepts `reportedVia: 'sms'/'ivr'`.
- Final verification (2026-09-04): full pass across all ten phases after Phase 5-9 landed — server
  `tsc --noEmit` clean, 49/49 unit tests across 12 files, 93 integration tests across 17 files still
  written-but-blocked by the same `fastdl.mongodb.org` restriction (an environment limit, confirmed
  again to be unchanged, not a regression); client `tsc -b` + `vite build` clean (386.46 kB / 118.90
  kB gzipped), 39/39 Vitest tests across 13 files. Eight screenshots taken against the production
  build with all API routes mocked (Transport, Situation, Field Operations, Reports, Administration)
  confirm correct role-based data, correct sidebar highlighting, and correct not-shared notes where
  expected.
- Test re-verification (2026-09-04): full suite re-run end-to-end on request, with no code changes
  needed — server `tsc --noEmit` clean, 49/49 unit tests, production build clean; client `tsc -b` +
  `vite build` clean (386.54 kB / 118.95 kB gzipped after moving a stale `dist/` into
  `client/_to_delete/` to work around this environment's delete-permission constraint), 39/39 Vitest
  tests. Server integration tests remain blocked for the same pre-existing `fastdl.mongodb.org`
  network-policy reason as every earlier phase.
- MongoDB Atlas migration (2026-09-04): `MONGODB_URI` now points at Atlas instead of local Compass.
  Honestly scoped down: I could not complete a live end-to-end connection check from either sandbox
  available to me — the device shell has no raw DNS/non-HTTP egress at all (only an HTTP(S) proxy), and
  the cloud container's broader network resolved Atlas's real hostnames but was rejected by Atlas's own
  IP Access List. The connection string itself is correctly formed; the remaining step (adding the
  server's IP, or `0.0.0.0/0` for development, to the cluster's Network Access list) is an Atlas
  dashboard action only the account owner can take.
- Volunteer -> CDO -> Central -> NGO/INGO supply coordination (2026-09-04): added `submittedByRole` to
  `Requirement` and a `canVerifyRequirement` gate so Ward can no longer approve a Volunteer/Police/Army
  request (must go to District/CDO), plus a new `SupplyAssistanceRequest` model/controller/routes and a
  matching "Supply Assistance" client tab for the shortfall-to-NGO/INGO handoff. Design decisions (each
  confirmed): CDO-only routing rather than a configurable rule table; a dedicated Supply Assistance
  feature rather than overloading `ResourceContribution`; and reuse of the existing
  allocate/dispatch pipeline rather than a second dispatch mechanism for NGO-sourced supplies. New
  integration coverage: `server/tests/integration/supplyAssistance.test.ts`, plus updated
  `requirementLifecycle.test.ts`/`requirementConsolidation.test.ts` fixtures (their volunteer-submitted
  scenarios now route approval through a District/CDO test user instead of Municipality/Ward, matching
  the new rule) — all still blocked from actually running by the same MongoDB sandbox limitation as
  every other integration test in this project, so this is unverified beyond `tsc`, the new pure-logic
  unit tests, and manual code review.
