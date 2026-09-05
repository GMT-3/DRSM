export interface OfferLike {
  quantityOffered: number;
  status: 'offered' | 'accepted' | 'declined';
}

/** Sum of quantities from offers Central has actually accepted (declined/pending offers don't count toward the gap being covered). */
export function sumAcceptedOfferQuantity(offers: OfferLike[]): number {
  return offers.filter((o) => o.status === 'accepted').reduce((sum, o) => sum + o.quantityOffered, 0);
}

/** A Supply Assistance Request is fulfilled once accepted offers cover the full gap Central asked NGOs/INGOs to help with. */
export function isRequestFulfilled(offers: OfferLike[], quantityNeeded: number): boolean {
  return sumAcceptedOfferQuantity(offers) >= quantityNeeded;
}
