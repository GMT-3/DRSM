import { Schema, model, Types } from 'mongoose';

export interface IDisasterEvent {
  _id: Types.ObjectId;
  name: string;
  type: string;
  startDate: Date;
  endDate?: Date | null;
  affectedProvinceIds: Types.ObjectId[];
  affectedDistrictIds: Types.ObjectId[];
  affectedMunicipalityIds: Types.ObjectId[];
  status: 'active' | 'closed';
}

const disasterEventSchema = new Schema<IDisasterEvent>({
  name: { type: String, required: true },
  type: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
  affectedProvinceIds: [{ type: Schema.Types.ObjectId, ref: 'Province' }],
  affectedDistrictIds: [{ type: Schema.Types.ObjectId, ref: 'District' }],
  affectedMunicipalityIds: [{ type: Schema.Types.ObjectId, ref: 'Municipality' }],
  status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
});

export const DisasterEvent = model<IDisasterEvent>('DisasterEvent', disasterEventSchema);
