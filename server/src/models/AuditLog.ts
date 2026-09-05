import { Schema, model, Types } from 'mongoose';
import { ROLES, Role } from '../types/roles';

// Immutable audit trail (Rule.md, Schema.md, Tech.md): written only by
// server-side middleware (see middleware/auditLog.ts). No update/delete
// route is ever registered for this collection — enforced by omission in
// routes/auditLogRoutes.ts (read-only) and by convention here.

export const AUDIT_ACTIONS = [
  'allocate',
  'assign_user',
  'register_household',
  'register_person',
  'distribute',
  'status_change',
  'escalate',
  'deactivate_user',
  'activate_user',
  'create_user',
  'verify_organization',
  'verify_contribution',
  'verify_donation',
  'dispatch',
  'confirm_delivery',
  'create',
  'update',
  'login',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface IAuditLog {
  _id: Types.ObjectId;
  actorUserId: Types.ObjectId | null;
  actorRole: Role | 'system';
  action: AuditAction;
  targetType: string;
  targetId?: Types.ObjectId | string | null;
  beforeState?: unknown;
  afterState?: unknown;
  requestMeta?: { method: string; path: string; ip?: string };
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: [...ROLES, 'system'], required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.Mixed, default: null },
    beforeState: { type: Schema.Types.Mixed, default: null },
    afterState: { type: Schema.Types.Mixed, default: null },
    requestMeta: {
      method: { type: String },
      path: { type: String },
      ip: { type: String },
      _id: false,
    },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { capped: false },
);

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
