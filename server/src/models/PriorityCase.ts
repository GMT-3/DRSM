import { Schema, model, Types } from 'mongoose';

export type CaseType = 'maternal_emergency' | 'medical_emergency' | 'mass_casualty' | 'other';
export type Severity = 'high' | 'critical';
export type ReportedVia = 'field_app' | 'sms' | 'ivr';
export type PriorityCaseStatus = 'reported' | 'acknowledged' | 'dispatched' | 'resolved';

export interface IPriorityCase {
  _id: Types.ObjectId;
  personId?: Types.ObjectId | null;
  siteId: Types.ObjectId;
  caseType: CaseType;
  severity: Severity;
  reportedVia: ReportedVia;
  reportedAt: Date;
  notifiedLevels: string[];
  status: PriorityCaseStatus;
  resolutionNote?: string;
}

const priorityCaseSchema = new Schema<IPriorityCase>({
  personId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
  siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
  caseType: { type: String, enum: ['maternal_emergency', 'medical_emergency', 'mass_casualty', 'other'], required: true },
  severity: { type: String, enum: ['high', 'critical'], required: true, index: true },
  reportedVia: { type: String, enum: ['field_app', 'sms', 'ivr'], required: true },
  reportedAt: { type: Date, default: Date.now },
  notifiedLevels: [{ type: String }],
  status: { type: String, enum: ['reported', 'acknowledged', 'dispatched', 'resolved'], default: 'reported', index: true },
  resolutionNote: { type: String },
});

export const PriorityCase = model<IPriorityCase>('PriorityCase', priorityCaseSchema);
