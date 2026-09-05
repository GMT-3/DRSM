import { Schema, model, Types } from 'mongoose';

export interface IDistrict {
  _id: Types.ObjectId;
  provinceId: Types.ObjectId;
  name: string;
  code: string;
  cdoUserId?: Types.ObjectId | null;
  createdAt: Date;
}

const districtSchema = new Schema<IDistrict>({
  provinceId: { type: Schema.Types.ObjectId, ref: 'Province', required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true },
  cdoUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
});

export const District = model<IDistrict>('District', districtSchema);
