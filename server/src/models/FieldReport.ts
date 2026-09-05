import { Schema, model, Types } from 'mongoose';

export type FieldReportType =
  | 'site_update'
  | 'population_update'
  | 'resource_update'
  | 'delivery_confirmation'
  | 'hazard_route_report'
  | 'rescue_evacuation_report';

export type SyncStatus = 'pending_sync' | 'synced';

export interface IFieldReport {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  reportedByUserId: Types.ObjectId;
  reportType: FieldReportType;
  payload: Record<string, unknown>;
  clientUuid: string;
  capturedAt: Date;
  syncedAt?: Date | null;
  syncStatus: SyncStatus;
}

const fieldReportSchema = new Schema<IFieldReport>({
  siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
  reportedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reportType: {
    type: String,
    enum: [
      'site_update',
      'population_update',
      'resource_update',
      'delivery_confirmation',
      'hazard_route_report',
      'rescue_evacuation_report',
    ],
    required: true,
  },
  payload: { type: Schema.Types.Mixed, default: {} },
  clientUuid: { type: String, required: true, unique: true },
  capturedAt: { type: Date, required: true },
  syncedAt: { type: Date, default: null },
  syncStatus: { type: String, enum: ['pending_sync', 'synced'], default: 'pending_sync', index: true },
});

export const FieldReport = model<IFieldReport>('FieldReport', fieldReportSchema);
