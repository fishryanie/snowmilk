import mongoose from "mongoose";
import { getMongoConfig } from "@/lib/mongodb-config";

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

  const { uri, dbName } = getMongoConfig();

  cache.promise ??= mongoose
    .connect(uri, {
      bufferCommands: false,
      dbName,
      serverSelectionTimeoutMS: 5000,
    })
    .catch((error) => {
      cache.promise = null;
      throw error;
    });
  cache.connection = await cache.promise;
  return cache.connection;
}
