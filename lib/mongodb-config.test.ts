import { describe, expect, test } from "bun:test";
import { getMongoConfig } from "@/lib/mongodb-config";

describe("MongoDB environment config", () => {
  test("keeps a local URI without credentials", () => {
    expect(
      getMongoConfig({
        MONGODB_URI: "mongodb://127.0.0.1:27017",
        MONGODB_DB_NAME: "snowmilk",
      }),
    ).toEqual({
      uri: "mongodb://127.0.0.1:27017",
      dbName: "snowmilk",
    });
  });

  test("injects and URL-encodes Atlas credentials", () => {
    expect(
      getMongoConfig({
        MONGODB_URI: "mongodb+srv://cluster.example.mongodb.net/?retryWrites=true",
        MONGODB_USERNAME: "snow milk",
        MONGODB_PASSWORD: "p@ss/word",
        MONGODB_DB_NAME: "snowmilk",
      }),
    ).toEqual({
      uri: "mongodb+srv://snow%20milk:p%40ss%2Fword@cluster.example.mongodb.net/?retryWrites=true",
      dbName: "snowmilk",
    });
  });

  test("replaces credentials already present in the URI", () => {
    expect(
      getMongoConfig({
        MONGODB_URI:
          "mongodb+srv://old-user:old-password@cluster.example.mongodb.net",
        MONGODB_USERNAME: "new-user",
        MONGODB_PASSWORD: "new-password",
      }).uri,
    ).toBe(
      "mongodb+srv://new-user:new-password@cluster.example.mongodb.net",
    );
  });

  test("uses snowmilk as the default database", () => {
    expect(
      getMongoConfig({
        MONGODB_URI: "mongodb://127.0.0.1:27017",
      }).dbName,
    ).toBe("snowmilk");
  });

  test("rejects partial credentials", () => {
    expect(() =>
      getMongoConfig({
        MONGODB_URI: "mongodb+srv://cluster.example.mongodb.net",
        MONGODB_USERNAME: "user",
      }),
    ).toThrow(
      "MONGODB_USERNAME và MONGODB_PASSWORD phải được khai báo cùng nhau.",
    );
  });
});
