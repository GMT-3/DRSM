import { Schema, model, Types } from 'mongoose';

export type DonationVerificationStatus = 'unverified' | 'pending' | 'verified';

// Cash & Fund Donations — a dedicated ledger for money, split out from
// ResourceContribution (which stays as the in-kind goods intake path).
// Cash never sits in a StorageLocation the way rice or tents do, so
// forcing it through the same "convert to Resource" verification flow
// (resourceContributionController.verifyContribution) produced odd
// records — a 'cash' Resource with a unit of 'lump_sum' parked at a
// warehouse. Here, verifying a donation simply marks the money as
// confirmed and countable toward the fund balance (see FundAllocation for
// the spending side of that balance).
export interface ICashDonation {
  _id: Types.ObjectId;
  donatedByOrganizationId?: Types.ObjectId | null;
  donatedByUserId?: Types.ObjectId | null;
  // Free-text label for an external/offline donor a government role is
  // recording on their behalf (Roles.md: donor contributions may be
  // "recorded on their behalf") — not a system account.
  donorName?: string | null;
  amount: number;
  currency: string;
  purpose?: string | null;
  verificationStatus: DonationVerificationStatus;
  verifiedByUserId?: Types.ObjectId | null;
  verifiedAt?: Date | null;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cashDonationSchema = new Schema<ICashDonation>(
  {
    donatedByOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    donatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    donorName: { type: String, default: null, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, default: 'NPR', uppercase: true, trim: true },
    purpose: { type: String, default: null, trim: true },
    verificationStatus: { type: String, enum: ['unverified', 'pending', 'verified'], default: 'unverified', index: true },
    verifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const CashDonation = model<ICashDonation>('CashDonation', cashDonationSchema);
