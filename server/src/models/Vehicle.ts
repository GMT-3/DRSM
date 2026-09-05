import { Schema, model, Types } from 'mongoose';

export interface IVehicle {
  _id: Types.ObjectId;
  transporterOrganizationId?: Types.ObjectId | null;
  type: 'truck' | 'helicopter' | 'boat' | 'other';
  capacity?: string;
  registrationNumber: string;
  active: boolean;
}

const vehicleSchema = new Schema<IVehicle>({
  transporterOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  type: { type: String, enum: ['truck', 'helicopter', 'boat', 'other'], required: true },
  capacity: { type: String },
  registrationNumber: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true },
});

export const Vehicle = model<IVehicle>('Vehicle', vehicleSchema);
