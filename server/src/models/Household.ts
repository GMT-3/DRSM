import { Schema, model, Types } from 'mongoose';

export interface IHousehold {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  headOfHouseholdName: string;
  gpsLocation?: { lat: number; lng: number } | null;
  qrCode: string;
  // Tech.md's offline-sync requirement: "every queued record carries a
  // client-generated UUID (clientUuid) so re-sync after a partial failure
  // upserts rather than duplicates." Not in Schema.md's field list because
  // Schema.md predates the offline field-app spec being fleshed out in
  // Tech.md; added here so Household participates in the same upsert-by-
  // UUID pattern as FieldReport. Doubles as the QR code payload so a card
  // printed offline (before the record has a server _id) still resolves
  // correctly once synced.
  clientUuid: string;
  registeredByUserId: Types.ObjectId;
  registeredAt: Date;
}

const householdSchema = new Schema<IHousehold>({
  siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
  headOfHouseholdName: { type: String, required: true, trim: true },
  gpsLocation: { lat: Number, lng: Number, _id: false },
  qrCode: { type: String, required: true, unique: true },
  clientUuid: { type: String, required: true, unique: true, index: true },
  registeredByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  registeredAt: { type: Date, default: Date.now },
});

export const Household = model<IHousehold>('Household', householdSchema);
