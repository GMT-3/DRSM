import { Schema, model, Types } from 'mongoose';

export type ResourceAllocationStatus = 'allocated' | 'dispatched' | 'delivered';

export interface IResourceAllocation {
  _id: Types.ObjectId;
  requirementId: Types.ObjectId;
  resourceId: Types.ObjectId;
  fromLevel: string;
  fromUserId: Types.ObjectId;
  toLevel: string;
  toEntityId: Types.ObjectId;
  quantityAllocated: number;
  allocatedAt: Date;
  status: ResourceAllocationStatus;
  // Set when the allocated Resource originated from an accepted Supply
  // Assistance offer, so the NGO contribution stays traceable through to
  // the site it ultimately reaches.
  linkedSupplyAssistanceRequestId?: Types.ObjectId | null;
}

const resourceAllocationSchema = new Schema<IResourceAllocation>({
  requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true, index: true },
  resourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true },
  fromLevel: { type: String, required: true },
  fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  toLevel: { type: String, required: true },
  toEntityId: { type: Schema.Types.ObjectId, required: true },
  quantityAllocated: { type: Number, required: true },
  allocatedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['allocated', 'dispatched', 'delivered'], default: 'allocated', index: true },
  linkedSupplyAssistanceRequestId: { type: Schema.Types.ObjectId, ref: 'SupplyAssistanceRequest', default: null },
});

export const ResourceAllocation = model<IResourceAllocation>('ResourceAllocation', resourceAllocationSchema);
