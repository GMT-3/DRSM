import { Schema, model, Types } from 'mongoose';

export interface IWard {
  _id: Types.ObjectId;
  municipalityId: Types.ObjectId;
  wardNumber: number;
  createdAt: Date;
}

const wardSchema = new Schema<IWard>({
  municipalityId: { type: Schema.Types.ObjectId, ref: 'Municipality', required: true, index: true },
  wardNumber: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

wardSchema.index({ municipalityId: 1, wardNumber: 1 }, { unique: true });

export const Ward = model<IWard>('Ward', wardSchema);
