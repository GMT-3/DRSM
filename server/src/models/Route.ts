import { Schema, model, Types } from 'mongoose';

export type RouteCondition = 'open' | 'degraded' | 'blocked';

export interface IRoute {
  _id: Types.ObjectId;
  name: string;
  fromLocation: string;
  toLocation: string;
  geometry?: unknown;
  currentCondition: RouteCondition;
  conditionUpdatedAt?: Date | null;
  conditionUpdatedByUserId?: Types.ObjectId | null;
  conditionNote?: string;
}

const routeSchema = new Schema<IRoute>({
  name: { type: String, required: true },
  fromLocation: { type: String, required: true },
  toLocation: { type: String, required: true },
  geometry: { type: Schema.Types.Mixed },
  currentCondition: { type: String, enum: ['open', 'degraded', 'blocked'], default: 'open', index: true },
  conditionUpdatedAt: { type: Date, default: null },
  conditionUpdatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  conditionNote: { type: String },
});

export const Route = model<IRoute>('Route', routeSchema);
