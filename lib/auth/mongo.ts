import "server-only";

import { MongoClient } from "mongodb";
import { getMongoConfig } from "@/lib/mongodb-config";

type AuthMongoCache = {
  client: MongoClient | null;
};

declare global {
  var authMongoCache: AuthMongoCache | undefined;
}

const cache = global.authMongoCache ?? { client: null };
global.authMongoCache = cache;

export function getAuthMongo() {
  const { uri, dbName } = getMongoConfig();
  cache.client ??= new MongoClient(uri, {
    appName: "bep-nha-ne-auth",
    serverSelectionTimeoutMS: 5_000,
  });

  return {
    client: cache.client,
    db: cache.client.db(dbName),
  };
}
