import { applyMovement, ResourceSnapshot } from '../../src/utils/inventoryMovement';

const BASE: ResourceSnapshot = { quantity: 100, state: 'available', storageLocationId: 'loc-a' };

describe('applyMovement — transfer', () => {
  it('relocates the resource when the full quantity is moved', () => {
    const result = applyMovement(BASE, { reason: 'transfer', quantity: 100, toLocationId: 'loc-b' });
    expect(result.error).toBeUndefined();
    expect(result.resource.storageLocationId).toBe('loc-b');
    expect(result.resource.quantity).toBe(100);
  });

  it('rejects a partial transfer (this schema cannot split a resource across two locations)', () => {
    const result = applyMovement(BASE, { reason: 'transfer', quantity: 40, toLocationId: 'loc-b' });
    expect(result.error).toMatch(/full quantity/);
    expect(result.resource).toEqual(BASE);
  });

  it('rejects a transfer with no destination', () => {
    const result = applyMovement(BASE, { reason: 'transfer', quantity: 100, toLocationId: null });
    expect(result.error).toMatch(/toLocationId is required/);
  });
});

describe('applyMovement — distribution', () => {
  it('reduces on-hand quantity by the distributed amount', () => {
    const result = applyMovement(BASE, { reason: 'distribution', quantity: 30 });
    expect(result.error).toBeUndefined();
    expect(result.resource.quantity).toBe(70);
    expect(result.resource.storageLocationId).toBe('loc-a'); // unchanged
  });

  it('rejects distributing more than is on hand', () => {
    const result = applyMovement(BASE, { reason: 'distribution', quantity: 150 });
    expect(result.error).toMatch(/cannot distribute more/);
    expect(result.resource.quantity).toBe(100);
  });
});

describe('applyMovement — adjustment', () => {
  it('applies a positive adjustment (stock found)', () => {
    const result = applyMovement(BASE, { reason: 'adjustment', quantity: 10 });
    expect(result.resource.quantity).toBe(110);
  });

  it('applies a negative adjustment (stock lost/damaged)', () => {
    const result = applyMovement(BASE, { reason: 'adjustment', quantity: -25 });
    expect(result.resource.quantity).toBe(75);
  });

  it('rejects an adjustment that would take quantity below zero', () => {
    const result = applyMovement(BASE, { reason: 'adjustment', quantity: -500 });
    expect(result.error).toMatch(/below zero/);
    expect(result.resource.quantity).toBe(100);
  });
});

describe('applyMovement — invalid quantity', () => {
  it('rejects a zero/negative quantity for transfer and distribution', () => {
    expect(applyMovement(BASE, { reason: 'transfer', quantity: 0, toLocationId: 'loc-b' }).error).toMatch(/positive/);
    expect(applyMovement(BASE, { reason: 'distribution', quantity: -5 }).error).toMatch(/positive/);
  });
});
