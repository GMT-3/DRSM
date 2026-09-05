import { Schema, model, Types } from 'mongoose';

export interface IProvince {
  _id: Types.ObjectId;
  name: string;
  code: string;
  createdAt: Date;
}

const provinceSchema = new Schema<IProvince>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

export const Province = model<IProvince>('Province', provinceSchema);
