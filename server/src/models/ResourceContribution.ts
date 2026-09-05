import { Schema, model, Types } from 'mongoose';

export type ContributionVerificationStatus = 'unverified' | 'pending' | 'verified';

export interface IResourceContribution {
  _id: Types.ObjectId;
  contributedByOrganizationId?: Types.ObjectId | null;
  contributedByUserId?: Types.ObjectId | null;
  resourceType: string;
  quantity: number;
  unit: string;
  fundAmount?: number | null;
  currency?: string | null;
  sourceCountry?: string | null;
  verificationStatus: ContributionVerificationStatus;
  verifiedByUserId?: Types.ObjectId | null;
  verifiedAt?: Date | null;
  convertedToResourceId?: Types.ObjectId | null;
  receivedAt: Date;
}

const resourceContributionSchema = new Schema<IResourceContribution>({
  contributedByOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  contributedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  resourceType: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  fundAmount: { type: Number, default: null },
  currency: { type: String, default: null },
  sourceCountry: { type: String, default: null },
  verificationStatus: { type: String, enum: ['unverified', 'pending', 'verified'], default: 'unverified', index: true },
  verifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  convertedToResourceId: { type: Schema.Types.ObjectId, ref: 'Resource', default: null },
  receivedAt: { type: Date, default: Date.now },
});

export const ResourceContribution = model<IResourceContribution>('ResourceContribution', resourceContributionSchema);
