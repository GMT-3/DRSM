import { Schema, model, Types } from 'mongoose';

// Modules.md module 9 "Resource Categories" / "Requirement Categories":
// standardized, admin-configurable category lists. Not in Schema.md's
// original collection list (that document fixes Cluster/FieldCategory as
// code-level enums), so this is a deliberate, documented, minimal
// extension — the same pattern as Household.clientUuid (Phase 2) and
// Requirement.priorityInputs (Phase 3) — letting Administration manage
// categories operationally without a code deploy, while the original
// enums remain the values used elsewhere until this list-driven UI grows
// to replace them.
export type CategoryKind = 'resource' | 'requirement';

export interface ICategory {
  _id: Types.ObjectId;
  kind: CategoryKind;
  name: string;
  active: boolean;
  createdByUserId: Types.ObjectId;
  createdAt: Date;
}

const categorySchema = new Schema<ICategory>({
  kind: { type: String, enum: ['resource', 'requirement'], required: true, index: true },
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

categorySchema.index({ kind: 1, name: 1 }, { unique: true });

export const Category = model<ICategory>('Category', categorySchema);
