import { Schema, model, Types } from 'mongoose';

export type DispatchStatus = 'dispatched' | 'in_transit' | 'arrived' | 'received' | 'distributed';

export interface ITransportDispatch {
  _id: Types.ObjectId;
  resourceAllocationId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  originLocationId: Types.ObjectId;
  destinationSiteId: Types.ObjectId;
  cargo: { resourceType: string; quantity: number };
  status: DispatchStatus;
  currentPosition?: { lat: number; lng: number } | null;
  lastPositionUpdateAt?: Date | null;
  expectedArrivalAt?: Date | null;
  routeId?: Types.ObjectId | null;
  dispatchedAt: Date;
  dispatchedByUserId: Types.ObjectId;
}

const transportDispatchSchema = new Schema<ITransportDispatch>({
  resourceAllocationId: { type: Schema.Types.ObjectId, ref: 'ResourceAllocation', required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  originLocationId: { type: Schema.Types.ObjectId, ref: 'StorageLocation', required: true },
  destinationSiteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
  cargo: {
    resourceType: { type: String, required: true },
    quantity: { type: Number, required: true },
    _id: false,
  },
  status: {
    type: String,
    enum: ['dispatched', 'in_transit', 'arrived', 'received', 'distributed'],
    default: 'dispatched',
    index: true,
  },
  currentPosition: { lat: Number, lng: Number, _id: false },
  lastPositionUpdateAt: { type: Date, default: null },
  expectedArrivalAt: { type: Date, default: null },
  routeId: { type: Schema.Types.ObjectId, ref: 'Route', default: null },
  dispatchedAt: { type: Date, default: Date.now },
  dispatchedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

export const TransportDispatch = model<ITransportDispatch>('TransportDispatch', transportDispatchSchema);
