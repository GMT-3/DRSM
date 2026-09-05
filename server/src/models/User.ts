import { Schema, model, Types } from 'mongoose';
import { ROLES, Role, FIELD_CATEGORIES, FieldCategory } from '../types/roles';

export type LoginType = 'gov_admin' | 'gov_email' | 'own_email' | 'departmental_email' | 'org_email';

export interface IUserScope {
  provinceId?: Types.ObjectId | null;
  districtId?: Types.ObjectId | null;
  municipalityId?: Types.ObjectId | null;
  wardId?: Types.ObjectId | null;
  organizationId?: Types.ObjectId | null;
}

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  phone?: string;
  email: string;
  passwordHash: string;
  role: Role;
  loginType: LoginType;
  scope: IUserScope;
  assignedSiteIds: Types.ObjectId[];
  category?: FieldCategory | null;
  appointedBy?: Types.ObjectId | null;
  active: boolean;
  refreshTokenVersion: number;
  createdAt: Date;
}

const scopeSchema = new Schema<IUserScope>(
  {
    provinceId: { type: Schema.Types.ObjectId, ref: 'Province', default: null },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    municipalityId: { type: Schema.Types.ObjectId, ref: 'Municipality', default: null },
    wardId: { type: Schema.Types.ObjectId, ref: 'Ward', default: null },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true, index: true },
  loginType: {
    type: String,
    enum: ['gov_admin', 'gov_email', 'own_email', 'departmental_email', 'org_email'],
    required: true,
  },
  scope: { type: scopeSchema, default: () => ({}) },
  assignedSiteIds: [{ type: Schema.Types.ObjectId, ref: 'Site' }],
  category: { type: String, enum: FIELD_CATEGORIES, default: null },
  appointedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  active: { type: Boolean, default: true },
  refreshTokenVersion: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ role: 1, 'scope.municipalityId': 1 });
userSchema.index({ role: 1, 'scope.districtId': 1 });
userSchema.index({ role: 1, 'scope.organizationId': 1 });

export const User = model<IUser>('User', userSchema);
