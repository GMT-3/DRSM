import { Types } from 'mongoose';
import { buildTrackingTimeline, CURRENT_BUILD_SCOPE_NOTE } from '../../src/utils/trackingTimeline';

const USER_ID = new Types.ObjectId();

describe('buildTrackingTimeline (current build scope: Municipality/Ward only)', () => {
  it('reports "submitted" as the current stage for a brand-new requirement', () => {
    const requirement = {
      status: 'submitted' as const,
      history: [{ status: 'submitted' as const, byUserId: USER_ID, at: new Date('2026-09-05T08:00:00Z') }],
    };
    const result = buildTrackingTimeline(requirement, [], []);
    expect(result.currentStage).toBe('submitted');
    expect(result.timeline).toHaveLength(1);
    expect(result.scopeNote).toBe(CURRENT_BUILD_SCOPE_NOTE);
  });

  it('advances to "approved" once the requirement history records approval', () => {
    const requirement = {
      status: 'approved' as const,
      history: [
        { status: 'submitted' as const, byUserId: USER_ID, at: new Date('2026-09-05T08:00:00Z') },
        { status: 'approved' as const, byUserId: USER_ID, at: new Date('2026-09-05T09:00:00Z') },
      ],
    };
    const result = buildTrackingTimeline(requirement, [], []);
    expect(result.currentStage).toBe('approved');
  });

  it('folds in an allocation and a dispatched-but-not-moved shipment', () => {
    const requirement = {
      status: 'dispatched' as const,
      history: [
        { status: 'submitted' as const, byUserId: USER_ID, at: new Date('2026-09-05T08:00:00Z') },
        { status: 'approved' as const, byUserId: USER_ID, at: new Date('2026-09-05T09:00:00Z') },
      ],
    };
    const allocations = [{ allocatedAt: new Date('2026-09-05T10:00:00Z'), status: 'dispatched' as const }];
    const dispatches = [
      { status: 'dispatched' as const, dispatchedAt: new Date('2026-09-05T11:00:00Z'), lastPositionUpdateAt: null },
    ];
    const result = buildTrackingTimeline(requirement, allocations, dispatches);
    expect(result.currentStage).toBe('dispatched');
    expect(result.timeline.map((e) => e.stage)).toEqual(['submitted', 'approved', 'allocated', 'dispatched']);
  });

  it('reads a dispatch stuck at "arrived" as still in transit, ahead of a stale requirement.status', () => {
    const requirement = {
      status: 'dispatched' as const,
      history: [{ status: 'submitted' as const, byUserId: USER_ID, at: new Date('2026-09-05T08:00:00Z') }],
    };
    const dispatches = [
      {
        status: 'arrived' as const,
        dispatchedAt: new Date('2026-09-05T09:00:00Z'),
        lastPositionUpdateAt: new Date('2026-09-05T12:00:00Z'),
      },
    ];
    const result = buildTrackingTimeline(requirement, [], dispatches);
    expect(result.currentStage).toBe('in_transit');
  });

  it('caps the visible stage at "delivered" (Municipality/Ward) even if the dispatch itself has moved to "distributed"', () => {
    const requirement = {
      status: 'delivered' as const,
      history: [{ status: 'submitted' as const, byUserId: USER_ID, at: new Date('2026-09-05T08:00:00Z') }],
    };
    const dispatches = [
      {
        status: 'distributed' as const,
        dispatchedAt: new Date('2026-09-05T09:00:00Z'),
        lastPositionUpdateAt: new Date('2026-09-05T14:00:00Z'),
      },
    ];
    const result = buildTrackingTimeline(requirement, [], dispatches);
    expect(result.currentStage).toBe('delivered');
    expect(result.timeline.every((e) => e.stage !== ('distributed' as never))).toBe(true);
    expect(result.timeline.some((e) => e.label.includes('Municipality/Ward'))).toBe(true);
  });

  it('never labels a stage using the word "beneficiary" or "victim" — that confirmation is next-update scope', () => {
    const requirement = {
      status: 'delivered' as const,
      history: [{ status: 'submitted' as const, byUserId: USER_ID, at: new Date('2026-09-05T08:00:00Z') }],
    };
    const dispatches = [
      { status: 'received' as const, dispatchedAt: new Date('2026-09-05T09:00:00Z'), lastPositionUpdateAt: new Date('2026-09-05T13:00:00Z') },
    ];
    const result = buildTrackingTimeline(requirement, [], dispatches);
    const anyMention = result.timeline.some((e) => /beneficiary|victim/i.test(e.label));
    expect(anyMention).toBe(false);
  });
});
