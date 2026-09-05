import { Schema, model, Types } from 'mongoose';

// The spending side of the cash & fund ledger (see CashDonation for the
// intake side). Central government decides how the verified fund balance
// gets used (Rule.md: Central "decides allocation") and this is the
// record of that decision — it never touches inventory/Resource records,
// since a fund allocation is a financial commitment, not a physical item.
export interface IFundAllocation {
  _id: Types.ObjectId;
  amount: number;
  currency: string;
  purpose: string;
  allocatedByUserId: Types.ObjectId;
  allocatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const fundAllocationSchema = new Schema<IFundAllocation>(
  {
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    purpose: { type: String, required: true, trim: true },
    allocatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    allocatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const FundAllocation = model<IFundAllocation>('FundAllocation', fundAllocationSchema);
