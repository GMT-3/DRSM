import { Schema, model, Types } from 'mongoose';

export type OrganizationType = 'ngo' | 'ingo' | 'private' | 'donor_institutional';
export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export interface IOrganization {
  _id: Types.ObjectId;
  name: string;
  type: OrganizationType;
  registrationDetails?: {
    registrationNumber?: string;
    country?: string;
    contact?: string;
  };
  verificationStatus: VerificationStatus;
  verifiedBy?: Types.ObjectId | null;
  verifiedAt?: Date | null;
  createdAt: Date;
}

const organizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['ngo', 'ingo', 'private', 'donor_institutional'], required: true },
  registrationDetails: {
    registrationNumber: { type: String },
    country: { type: String },
    contact: { type: String },
    _id: false,
  },
  verificationStatus: { type: String, enum: ['unverified', 'pending', 'verified'], default: 'unverified' },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Organization = model<IOrganization>('Organization', organizationSchema);
