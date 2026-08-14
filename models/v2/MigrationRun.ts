import mongoose, { Schema } from "mongoose";
import {
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const MigrationCountSchema = new Schema(
  {
    collectionName: { type: String, required: true, trim: true },
    before: { type: Number, required: true, min: 0 },
    read: { type: Number, required: true, min: 0, default: 0 },
    inserted: { type: Number, required: true, min: 0, default: 0 },
    updated: { type: Number, required: true, min: 0, default: 0 },
    skipped: { type: Number, required: true, min: 0, default: 0 },
    exceptions: { type: Number, required: true, min: 0, default: 0 },
    after: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const MigrationExceptionSchema = new Schema(
  {
    collectionName: { type: String, required: true, trim: true },
    sourceId: { type: String, trim: true },
    code: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ReconciliationSchema = new Schema(
  {
    metric: { type: String, required: true, trim: true },
    expected: { type: String, required: true, trim: true },
    actual: { type: String, required: true, trim: true },
    matches: { type: Boolean, required: true },
  },
  { _id: false },
);

export const MIGRATION_SOURCE_DISPOSITIONS = [
  "migrate",
  "preserve_read_only",
  "aggregate_only",
  "preserve_for_physical_opening_reference",
  "skip",
] as const;

const MigrationSourceManifestSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, immutable: true },
    collectionName: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    count: { type: Number, required: true, min: 0, immutable: true },
    checksum: { type: String, required: true, trim: true, immutable: true },
    disposition: {
      type: String,
      enum: MIGRATION_SOURCE_DISPOSITIONS,
      required: true,
      immutable: true,
    },
    canonicalTargets: {
      type: [{ type: String, required: true, trim: true, immutable: true }],
      required: true,
      default: [],
      immutable: true,
    },
  },
  { _id: false },
);

const MigrationRunSchema = new Schema(
  {
    migrationVersion: { type: String, required: true, trim: true, immutable: true },
    runId: { type: String, required: true, trim: true, immutable: true },
    mode: { type: String, enum: ["dry_run", "apply"], required: true, immutable: true },
    status: {
      type: String,
      enum: ["running", "succeeded", "failed", "blocked"],
      required: true,
      default: "running",
    },
    connectionFingerprint: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    connectionSource: {
      type: String,
      enum: ["online"],
      required: true,
      default: "online",
      immutable: true,
    },
    scheme: {
      type: String,
      enum: ["mongodb+srv"],
      required: true,
      default: "mongodb+srv",
      immutable: true,
    },
    dbName: { type: String, enum: ["snowmilk"], required: true, immutable: true },
    inputChecksum: { type: String, required: true, trim: true, immutable: true },
    mappingChecksum: { type: String, required: true, trim: true, immutable: true },
    sourceManifest: {
      type: [MigrationSourceManifestSchema],
      required: true,
      default: [],
      immutable: true,
    },
    confirmationTokenHash: { type: String, trim: true, immutable: true },
    dryRunId: { type: String, trim: true, immutable: true },
    counts: { type: [MigrationCountSchema], required: true, default: [] },
    exceptions: { type: [MigrationExceptionSchema], required: true, default: [] },
    reconciliation: { type: [ReconciliationSchema], required: true, default: [] },
    startedAt: { type: Date, required: true, immutable: true },
    finishedAt: { type: Date, default: null },
    errorMessage: { type: String, trim: true },
    executedBy: { type: String, required: true, trim: true, immutable: true },
    version: versionField,
  },
  v2SchemaOptions(V2_COLLECTIONS.migrationRuns),
);

MigrationRunSchema.index(
  { migrationVersion: 1, runId: 1 },
  { unique: true, name: "uq_migration_version_run" },
);
MigrationRunSchema.index(
  { connectionFingerprint: 1, mode: 1, startedAt: -1 },
  { name: "ix_migration_target_history" },
);
MigrationRunSchema.index(
  { migrationVersion: 1, inputChecksum: 1, mappingChecksum: 1, mode: 1 },
  { name: "ix_migration_replay" },
);

MigrationRunSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.sourceManifest.length === 0) {
    doc.invalidate(
      "sourceManifest",
      "Migration run phải lưu manifest của mọi nguồn dữ liệu.",
    );
  }
  const sourceKeys = doc.sourceManifest.map((item: { key: string }) => item.key);
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    doc.invalidate("sourceManifest", "Mỗi nguồn migration phải có key duy nhất.");
  }
  if (doc.mode === "apply" && (!doc.confirmationTokenHash || !doc.dryRunId)) {
    doc.invalidate(
      "confirmationTokenHash",
      "Apply yêu cầu confirmation token và dry-run nguồn.",
    );
  }
  if (doc.status !== "running" && !doc.finishedAt) {
    doc.invalidate("finishedAt", "Migration đã kết thúc phải có finishedAt.");
  }
  if (doc.status === "succeeded") {
    const hasMismatch = doc.reconciliation.some(
      (item: { matches: boolean }) => !item.matches,
    );
    if (hasMismatch || doc.exceptions.length > 0) {
      doc.invalidate(
        "status",
        "Migration không thể thành công khi còn exception hoặc đối soát lệch.",
      );
    }
  }
});

export const MigrationRun =
  mongoose.models.V2MigrationRun ??
  mongoose.model("V2MigrationRun", MigrationRunSchema);
