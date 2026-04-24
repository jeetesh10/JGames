import mongoose from "mongoose";

export async function connectToDatabase(mongoUri: string): Promise<void> {
  await mongoose.connect(mongoUri, {
    // Conservative defaults for a standard long-running API service.
    maxPoolSize: 30,
    minPoolSize: 5,
    maxIdleTimeMS: 300000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    serverSelectionTimeoutMS: 5000
  });
}
