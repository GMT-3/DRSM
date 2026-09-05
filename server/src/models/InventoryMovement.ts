import { Schema, model, Types } from 'mongoose';

export interface IInventoryMovement {
  _id: Types.ObjectId;
  resourceId: Types.ObjectId;
  fromLocationId?: Types.ObjectId | null;
  toLocationId?: Types.ObjectId | null;
  quantity: number;
  movedAt: Date;
  movedByUserId: Types.ObjectId;
  reason: 'transfer' | 'distribution' | 'adjustment';
}

const inventoryMovementSchema = new Schema<IInventoryMovement>({
  resourceId: { type: Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  fromLocationId: { type: Schema.Types.ObjectId, ref: 'StorageLocation', default: null },
  toLocationId: { type: Schema.Types.ObjectId, ref: 'StorageLocation', default: null },
  quantity: { type: Number, required: true },
  movedAt: { type: Date, default: Date.now },
  movedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['transfer', 'distribution', 'adjustment'], required: true },
});

export const InventoryMovement = model<IInventoryMovement>('InventoryMovement', inventoryMovementSchema);
