import { Schema, model, Types } from 'mongoose';

export type ResourceState = 'available' | 'allocated' | 'reserved';

export interface IResource {
  _id: Types.ObjectId;
  ownerType: 'government' | 'organization';
  ownerId: Types.ObjectId;
  // Broad classification (food, shelter, medicine, electronics, ...),
  // drawn from the admin-configurable Category list (kind: 'resource') —
  // see models/Category.ts. resourceType stays the specific item name
  // (e.g. "rice") within that category; defaults to 'other' so existing
  // callers that don't send one still get a valid, filterable value.
  category: string;
  resourceType: string;
  unit: string;
  quantity: number;
  storageLocationId?: Types.ObjectId | null;
  state: ResourceState;
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<IResource>(
  {
    ownerType: { type: String, enum: ['government', 'organization'], required: true },
    // ownerId points to a User (ownerType: 'government') or an Organization
    // (ownerType: 'organization'). Populate manually per ownerType at query
    // time — Mongoose's refPath needs the field to literally hold a model
    // name, and 'government'/'organization' are domain values, not that.
    ownerId: { type: Schema.Types.ObjectId, required: true },
    category: { type: String, required: true, default: 'other', index: true },
    resourceType: { type: String, required: true, index: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, default: 0 },
    storageLocationId: { type: Schema.Types.ObjectId, ref: 'StorageLocation', default: null },
    state: { type: String, enum: ['available', 'allocated', 'reserved'], default: 'available', index: true },
  },
  { timestamps: true },
);

export const Resource = model<IResource>('Resource', resourceSchema);
