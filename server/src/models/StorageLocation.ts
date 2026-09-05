import { Schema, model, Types } from 'mongoose';

export interface IStorageLocation {
  _id: Types.ObjectId;
  name: string;
  type: 'warehouse' | 'store' | 'collection_center' | 'other';
  provinceId?: Types.ObjectId | null;
  districtId?: Types.ObjectId | null;
  municipalityId?: Types.ObjectId | null;
  gpsLocation?: { lat: number; lng: number } | null;
}

const storageLocationSchema = new Schema<IStorageLocation>({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['warehouse', 'store', 'collection_center', 'other'], default: 'warehouse' },
  provinceId: { type: Schema.Types.ObjectId, ref: 'Province', default: null },
  districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
  municipalityId: { type: Schema.Types.ObjectId, ref: 'Municipality', default: null },
  gpsLocation: { lat: Number, lng: Number, _id: false },
});

export const StorageLocation = model<IStorageLocation>('StorageLocation', storageLocationSchema);
