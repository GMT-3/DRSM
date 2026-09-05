import { sumAcceptedOfferQuantity, isRequestFulfilled, OfferLike } from '../../src/utils/supplyAssistance';

function offer(quantityOffered: number, status: OfferLike['status']): OfferLike {
  return { quantityOffered, status };
}

describe('sumAcceptedOfferQuantity', () => {
  it('sums only accepted offers', () => {
    const offers = [offer(10, 'accepted'), offer(5, 'offered'), offer(20, 'declined'), offer(7, 'accepted')];
    expect(sumAcceptedOfferQuantity(offers)).toBe(17);
  });

  it('returns 0 when there are no offers', () => {
    expect(sumAcceptedOfferQuantity([])).toBe(0);
  });

  it('returns 0 when no offer has been accepted yet', () => {
    expect(sumAcceptedOfferQuantity([offer(10, 'offered'), offer(5, 'declined')])).toBe(0);
  });
});

describe('isRequestFulfilled', () => {
  it('is false while accepted offers fall short of the quantity needed', () => {
    expect(isRequestFulfilled([offer(10, 'accepted')], 25)).toBe(false);
  });

  it('is true once accepted offers meet the quantity needed exactly', () => {
    expect(isRequestFulfilled([offer(25, 'accepted')], 25)).toBe(true);
  });

  it('is true once accepted offers from multiple orgs together exceed the quantity needed', () => {
    expect(isRequestFulfilled([offer(15, 'accepted'), offer(15, 'accepted')], 25)).toBe(true);
  });
});
