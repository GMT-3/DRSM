import mongoose from 'mongoose';
import { env } from './env';

let connected = false;

export async function connectDB(uri: string = env.mongodbUri): Promise<typeof mongoose> {
  if (connected) return mongoose;
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri);
  connected = true;
  // eslint-disable-next-line no-console
  console.log(`[db] connected -> ${conn.connection.name}`);
  return mongoose;
}

export async function disconnectDB(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
