import { Schema, model, Types } from 'mongoose';
import { Cluster } from './Requirement';

// Supply Assistance workflow (user requirement, 2026-09-04): when Central
// checks an approved/consolidated Requirement and finds the government's
// own stock falls short, it opens a SupplyAssistanceRequest describing the
// shortfall and reaches out to NGOs/INGOs. Any organization can pledge a
// quantity (an "offer"); Central decides which offers to accept, and an
// accepted offer converts into a confirmed Resource — the same
// pledge-then-verify pattern ResourceContribution/verifyContribution uses
// (see resourceContributionController.ts), reused here rather than
// reinvented.

export type SupplyAssistanceRequestStatus = 'open' | 'fulfilled' | 'cancelled';
export type SupplyOfferStatus = 'offered' | 'accepted' | 'declined';

export interface ISupplyOffer {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  offeredByUserId: Types.ObjectId;
  quantityOffered: number;
  note?: string;
  status: SupplyOfferStatus;
  offeredAt: Date;
  // Set once Central accepts the offer and converts it into inventory.
  resourceId?: Types.ObjectId | null;
}

export interface ISupplyAssistanceRequest {
  _id: Types.ObjectId;
  requirementId: Types.ObjectId;
  cluster: Cluster;
  category: string;
  unit: string;
  // The shortfall Central is asking NGOs/INGOs to help cover — not the
  // Requirement's full quantityRequested, since the government may already
  // be sending part of it itself (see quantityGovernmentCommitted).
  quantityNeeded: number;
  quantityGovernmentCommitted: number;
  note?: string;
  status: SupplyAssistanceRequestStatus;
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  offers: ISupplyOffer[];
}

const supplyOfferSchema = new Schema<ISupplyOffer>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  offeredByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  quantityOffered: { type: Number, required: true },
  note: { type: String },
  status: { type: String, enum: ['offered', 'accepted', 'declined'], default: 'offered' },
  offeredAt: { type: Date, default: Date.now },
  resourceId: { type: Schema.Types.ObjectId, ref: 'Resource', default: null },
});

const supplyAssistanceRequestSchema = new Schema<ISupplyAssistanceRequest>({
  requirementId: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true, index: true },
  cluster: {
    type: String,
    enum: ['health', 'wash', 'nutrition', 'shelter', 'food_security', 'protection', 'logistics', 'other'],
    required: true,
  },
  category: { type: String, required: true },
  unit: { type: String, required: true },
  quantityNeeded: { type: Number, required: true },
  quantityGovernmentCommitted: { type: Number, default: 0 },
  note: { type: String },
  status: { type: String, enum: ['open', 'fulfilled', 'cancelled'], default: 'open', index: true },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  offers: { type: [supplyOfferSchema], default: [] },
});

export const SupplyAssistanceRequest = model<ISupplyAssistanceRequest>(
  'SupplyAssistanceRequest',
  supplyAssistanceRequestSchema,
);
