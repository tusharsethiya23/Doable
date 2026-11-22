// Opens the MongoDB connection through Mongoose.
import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true); // ignore query filters on fields not in the schema
  await mongoose.connect(env.MONGO_URI);
  console.log(`✅ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}
