import { Schema, model, Types } from 'mongoose';

export type NoticeCategory =
  | 'directive'
  | 'hazard_warning'
  | 'road_closure'
  | 'emergency_instruction'
  | 'priority_change'
  | 'coordination_message';

export interface INotice {
  _id: Types.ObjectId;
  title: string;
  body: string;
  category: NoticeCategory;
  issuedByUserId: Types.ObjectId;
  issuedAt: Date;
  scope: 'national' | Types.ObjectId; // provinceId/districtId/municipalityId when not national
}

const noticeSchema = new Schema<INotice>({
  title: { type: String, required: true },
  body: { type: String, required: true },
  category: {
    type: String,
    enum: ['directive', 'hazard_warning', 'road_closure', 'emergency_instruction', 'priority_change', 'coordination_message'],
    required: true,
  },
  issuedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  issuedAt: { type: Date, default: Date.now },
  scope: { type: Schema.Types.Mixed, default: 'national' },
});

export const Notice = model<INotice>('Notice', noticeSchema);
