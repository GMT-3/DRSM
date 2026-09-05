import { Schema, model, Types } from 'mongoose';

export type MunicipalityType = 'municipality' | 'rural_municipality' | 'vdc_legacy';

export interface IMunicipality {
  _id: Types.ObjectId;
  districtId: Types.ObjectId;
  name: string;
  type: MunicipalityType;
  createdAt: Date;
}

const municipalitySchema = new Schema<IMunicipality>({
  districtId: { type: Schema.Types.ObjectId, ref: 'District', required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['municipality', 'rural_municipality', 'vdc_legacy'],
    default: 'municipality',
  },
  createdAt: { type: Date, default: Date.now },
});

export const Municipality = model<IMunicipality>('Municipality', municipalitySchema);
