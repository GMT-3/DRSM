import { Schema, model, Types } from 'mongoose';
import { Role, ROLES } from '../types/roles';

export type Cluster = 'health' | 'wash' | 'nutrition' | 'shelter' | 'food_security' | 'protection' | 'logistics' | 'other';
export type RequirementStatus =
  | 'submitted'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'allocated'
  | 'dispatched'
  | 'delivered'
  | 'partially_fulfilled'
  | 'fulfilled';

export interface IRequirementHistoryEntry {
  status: RequirementStatus;
  byUserId: Types.ObjectId;
  at: Date;
  note?: string;
}

export interface IPriorityInputs {
  populationAffected: number;
  vulnerableCount: number;
  availableSupplyRatio: number;
  hazardActive: boolean;
}

export interface IRequirement {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  cluster: Cluster;
  category: string;
  description?: string;
  quantityRequested: number;
  submittedByUserId: Types.ObjectId;
  // Snapshot of the submitter's role at submission time. The CDO-only
  // verification rule (utils/requirementVerification.ts) needs to know
  // who originally submitted a requirement even after it has moved
  // between statuses/reviewers.
  submittedByRole: Role;
  submittedAt: Date;
  status: RequirementStatus;
  approvedByUserId?: Types.ObjectId | null;
  approvedAt?: Date | null;
  priorityScore?: number;
  // Snapshot inputs the priority formula runs on (Schema.md names the
  // inputs — population/vulnerability/supply/hazard — but not their
  // storage shape; persisted here so the score is recomputable and
  // auditable rather than a one-off number with no traceable basis. See
  // utils/priorityScore.ts.
  priorityInputs?: IPriorityInputs;
  consolidatedIntoId?: Types.ObjectId | null;
  history: IRequirementHistoryEntry[];
}

const requirementSchema = new Schema<IRequirement>({
  siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
  cluster: {
    type: String,
    enum: ['health', 'wash', 'nutrition', 'shelter', 'food_security', 'protection', 'logistics', 'other'],
    required: true,
    index: true,
  },
  category: { type: String, required: true },
  description: { type: String },
  quantityRequested: { type: Number, required: true },
  submittedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  submittedByRole: { type: String, enum: ROLES, required: true },
  submittedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: [
      'submitted',
      'pending_approval',
      'approved',
      'rejected',
      'allocated',
      'dispatched',
      'delivered',
      'partially_fulfilled',
      'fulfilled',
    ],
    default: 'submitted',
    index: true,
  },
  approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  priorityScore: { type: Number, default: 0, index: true },
  priorityInputs: {
    populationAffected: { type: Number, default: 0 },
    vulnerableCount: { type: Number, default: 0 },
    availableSupplyRatio: { type: Number, default: 0 },
    hazardActive: { type: Boolean, default: false },
    _id: false,
  },
  consolidatedIntoId: { type: Schema.Types.ObjectId, ref: 'Requirement', default: null },
  history: [
    {
      status: { type: String, required: true },
      byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      at: { type: Date, default: Date.now },
      note: { type: String },
      _id: false,
    },
  ],
});

export const Requirement = model<IRequirement>('Requirement', requirementSchema);
