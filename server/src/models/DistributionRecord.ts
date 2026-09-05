import { Schema, model, Types } from 'mongoose';

export interface IDistributionRecord {
  _id: Types.ObjectId;
  householdId: Types.ObjectId;
  transportDispatchId?: Types.ObjectId | null;
  distributedByUserId: Types.ObjectId;
  qrScanTimestamp: Date;
  resourceType: string;
  quantity: number;
  duplicateFlag: boolean;
  distributedAt: Date;
}

const distributionRecordSchema = new Schema<IDistributionRecord>({
  householdId: { type: Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
  transportDispatchId: { type: Schema.Types.ObjectId, ref: 'TransportDispatch', default: null },
  distributedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  qrScanTimestamp: { type: Date, default: Date.now },
  resourceType: { type: String, required: true },
  quantity: { type: Number, required: true },
  duplicateFlag: { type: Boolean, default: false, index: true },
  distributedAt: { type: Date, default: Date.now },
});

export const DistributionRecord = model<IDistributionRecord>('DistributionRecord', distributionRecordSchema);
