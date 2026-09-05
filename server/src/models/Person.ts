import { Schema, model, Types } from 'mongoose';

export type PersonStatus = 'normal' | 'stranded' | 'displaced' | 'missing' | 'rescued' | 'evacuated';
export type VulnerabilityFlag =
  | 'pregnant'
  | 'recently_delivered'
  | 'child_under_5'
  | 'elderly'
  | 'disabled'
  | 'chronic_illness';

export interface IPerson {
  _id: Types.ObjectId;
  householdId: Types.ObjectId;
  name: string;
  age?: number;
  sex?: 'male' | 'female' | 'other';
  status: PersonStatus;
  lastKnownLocation?: string | null;
  vulnerabilityFlags: VulnerabilityFlag[];
  createdAt: Date;
  updatedAt: Date;
}

const personSchema = new Schema<IPerson>(
  {
    householdId: { type: Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number },
    sex: { type: String, enum: ['male', 'female', 'other'] },
    status: {
      type: String,
      enum: ['normal', 'stranded', 'displaced', 'missing', 'rescued', 'evacuated'],
      default: 'normal',
    },
    lastKnownLocation: { type: String, default: null },
    vulnerabilityFlags: [
      {
        type: String,
        enum: ['pregnant', 'recently_delivered', 'child_under_5', 'elderly', 'disabled', 'chronic_illness'],
      },
    ],
  },
  { timestamps: true },
);

export const Person = model<IPerson>('Person', personSchema);
