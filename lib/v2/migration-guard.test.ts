import { describe, expect, test } from "bun:test";
import {
  assertApplyTargetGuard,
  assertMatchingDryRunChecksum,
  buildMongoTargetFingerprint,
  buildSuggestedApplyCommand,
  parseMigrationCliArgs,
  sanitizeMigrationError,
} from "./migration-guard";

describe("v2 online migration guard", () => {
  test("is dry-run by default and exposes no target host", () => {
    expect(parseMigrationCliArgs([]).mode).toBe("dry-run");
    expect(
      buildMongoTargetFingerprint(
        "mongodb+srv://secret-user:secret-password@private.example.net/test",
        "snowmilk",
      ),
    ).toEqual({
      connectionSource: "online",
      scheme: "mongodb+srv",
      dbName: "snowmilk",
      targetDigest: expect.stringMatching(/^[a-f\d]{64}$/),
      isLocal: false,
    });
  });

  test("rejects local apply even with confirmation", () => {
    const options = parseMigrationCliArgs([
      "--apply",
      "--confirm=ONLINE-snowmilk",
      `--dry-run-checksum=${"a".repeat(64)}`,
    ]);
    expect(() =>
      assertApplyTargetGuard(
        options,
        buildMongoTargetFingerprint("mongodb://127.0.0.1:27017", "snowmilk"),
      ),
    ).toThrow("MongoDB Atlas");
  });

  test("requires exact database token and a matching dry-run checksum", () => {
    const fingerprint = buildMongoTargetFingerprint(
      "mongodb+srv://cluster.example.net",
      "snowmilk",
    );
    const checksum = "b".repeat(64);
    const options = parseMigrationCliArgs([
      "--apply",
      "--confirm=ONLINE-snowmilk",
      `--dry-run-checksum=${checksum}`,
    ]);
    expect(() => assertApplyTargetGuard(options, fingerprint)).not.toThrow();
    expect(() => assertMatchingDryRunChecksum(options, checksum)).not.toThrow();
    expect(() =>
      assertMatchingDryRunChecksum(options, "c".repeat(64)),
    ).toThrow("không khớp");
  });

  test("redacts a URI from thrown driver errors", () => {
    const result = sanitizeMigrationError(
      new Error(
        "failed mongodb+srv://admin:p%40ss@cluster.example.net/?retryWrites=true",
      ),
    );
    expect(result).not.toContain("admin");
    expect(result).not.toContain("p%40ss");
    expect(result).toContain("REDACTED_MONGODB_URI");
  });

  test("keeps the exact catalog map in the suggested apply command", () => {
    const command = buildSuggestedApplyCommand(
      {
        catalogMapPath: "config/v2 catalog map.json",
        inlineCatalogMappings: [],
      },
      "d".repeat(64),
    );
    expect(command).toContain(
      "--catalog-map='config/v2 catalog map.json' --apply",
    );
    expect(command).toContain(`--dry-run-checksum=${"d".repeat(64)}`);
  });
});
