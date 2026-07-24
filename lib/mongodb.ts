import mongoose from "mongoose";

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cache = global.mongooseCache ?? { connection: null, promise: null };
global.mongooseCache = cache;

export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.connection) return cache.connection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Thiếu MONGODB_URI. Hãy sao chép .env.example thành .env.local và cấu hình MongoDB.",
    );
  }

  cache.promise ??= mongoose
    .connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    })
    .catch((error) => {
      cache.promise = null;
      throw error;
    });
  cache.connection = await cache.promise;
  return cache.connection;
}
