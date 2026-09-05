import { Schema, model, Types } from 'mongoose';

export type SiteType = 'settlement' | 'camp' | 'shelter' | 'health_post' | 'other';
export type AccessMode = 'road' | 'foot_only' | 'airlift_only';

export interface ISite {
  _id: Types.ObjectId;
  wardId: Types.ObjectId;
  name: string;
  siteType: SiteType;
  gpsLocation?: { lat: number; lng: number } | null;
  accessMode: AccessMode;
  accessModeUpdatedAt?: Date | null;
  accessModeUpdatedBy?: Types.ObjectId | null;
  lastUpdateAt: Date;
  createdAt: Date;
}

const siteSchema = new Schema<ISite>({
  wardId: { type: Schema.Types.ObjectId, ref: 'Ward', required: true, index: true },
  name: { type: String, required: true, trim: true },
  siteType: {
    type: String,
    enum: ['settlement', 'camp', 'shelter', 'health_post', 'other'],
    default: 'settlement',
  },
  gpsLocation: {
    lat: { type: Number },
    lng: { type: Number },
    _id: false,
  },
  accessMode: { type: String, enum: ['road', 'foot_only', 'airlift_only'], default: 'road' },
  accessModeUpdatedAt: { type: Date, default: null },
  accessModeUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastUpdateAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export const Site = model<ISite>('Site', siteSchema);
