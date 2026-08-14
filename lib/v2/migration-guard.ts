import { createHash } from "node:crypto";

export type MigrationCliOptions = {
  mode: "dry-run" | "apply";
  confirmation: string | null;
  dryRunChecksum: string | null;
  catalogMapPath: string | null;
  inlineCatalogMappings: unknown[];
};

function valueAfter(arg: string, prefix: string) {
  return arg.startsWith(prefix) ? arg.slice(prefix.length) : null;
}

export function parseMigrationCliArgs(args: readonly string[]): MigrationCliOptions {
  let apply = false;
  let explicitDryRun = false;
  let confirmation: string | null = null;
  let dryRunChecksum: string | null = null;
  let catalogMapPath: string | null = null;
  const inlineCatalogMappings: unknown[] = [];

  for (const arg of args) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      explicitDryRun = true;
      continue;
    }
    const confirmValue = valueAfter(arg, "--confirm=");
    if (confirmValue !== null) {
      confirmation = confirmValue;
      continue;
    }
    const checksumValue = valueAfter(arg, "--dry-run-checksum=");
    if (checksumValue !== null) {
      dryRunChecksum = checksumValue.toLowerCase();
      continue;
    }
    const catalogMapValue = valueAfter(arg, "--catalog-map=");
    if (catalogMapValue !== null) {
      catalogMapPath = catalogMapValue;
      continue;
    }
    const inlineMapValue = valueAfter(arg, "--map-json=");
    if (inlineMapValue !== null) {
      try {
        inlineCatalogMappings.push(JSON.parse(inlineMapValue));
      } catch {
        throw new Error("--map-json phải chứa một JSON object hợp lệ.");
      }
      continue;
    }
    throw new Error(`Tham số migration không được hỗ trợ: ${arg}`);
  }

  if (apply && explicitDryRun) {
    throw new Error("Không thể dùng đồng thời --apply và --dry-run.");
  }
  return {
    mode: apply ? "apply" : "dry-run",
    confirmation,
    dryRunChecksum,
    catalogMapPath,
    inlineCatalogMappings,
  };
}

export type MongoTargetFingerprint = {
  connectionSource: "online" | "local";
  scheme: "mongodb" | "mongodb+srv";
  dbName: string;
  targetDigest: string;
  isLocal: boolean;
};

function authorityHosts(uri: string, scheme: string) {
  const remainder = uri.slice(`${scheme}://`.length);
  const authority = remainder.split(/[/?#]/, 1)[0] ?? "";
  const withoutCredentials = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;
  return withoutCredentials
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameWithoutPort(host: string) {
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":", 1)[0];
}

function isLocalHostname(host: string) {
  const hostname = hostnameWithoutPort(host);
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("127.") ||
    hostname.endsWith(".localhost")
  );
}

export function buildMongoTargetFingerprint(
  uri: string,
  dbName: string,
): MongoTargetFingerprint {
  const schemeMatch = uri.match(/^(mongodb(?:\+srv)?):\/\//i);
  if (!schemeMatch) {
    throw new Error("MONGODB_URI phải dùng mongodb:// hoặc mongodb+srv://.");
  }
  const scheme = schemeMatch[1].toLowerCase() as MongoTargetFingerprint["scheme"];
  const hosts = authorityHosts(uri, scheme);
  if (hosts.length === 0) throw new Error("MONGODB_URI không chứa host hợp lệ.");
  const normalizedDbName = dbName.trim();
  if (!normalizedDbName) throw new Error("Database name không được trống.");
  const isLocal = hosts.some(isLocalHostname);
  const targetDigest = createHash("sha256")
    .update(
      JSON.stringify({
        scheme,
        hosts: [...hosts].sort(),
        dbName: normalizedDbName,
      }),
    )
    .digest("hex");

  // Hostnames, usernames, passwords and the URI are intentionally not exposed.
  return {
    connectionSource: isLocal ? "local" : "online",
    scheme,
    dbName: normalizedDbName,
    targetDigest,
    isLocal,
  };
}

export function assertApplyTargetGuard(
  options: MigrationCliOptions,
  fingerprint: MongoTargetFingerprint,
) {
  if (options.mode !== "apply") return;
  const expectedConfirmation = `ONLINE-${fingerprint.dbName}`;
  if (
    fingerprint.isLocal ||
    fingerprint.connectionSource !== "online" ||
    fingerprint.scheme !== "mongodb+srv"
  ) {
    throw new Error(
      "--apply chỉ được phép với MongoDB Atlas mongodb+srv; localhost bị từ chối.",
    );
  }
  if (
    fingerprint.dbName !== "snowmilk" ||
    options.confirmation !== "ONLINE-snowmilk" ||
    options.confirmation !== expectedConfirmation
  ) {
    throw new Error(
      "Sai confirmation token. Cần đúng --confirm=ONLINE-snowmilk cho database snowmilk.",
    );
  }
  if (!options.dryRunChecksum?.match(/^[a-f\d]{64}$/)) {
    throw new Error(
      "--apply cần --dry-run-checksum=<sha256> lấy từ dry-run cùng target và dữ liệu.",
    );
  }
}

export function assertMatchingDryRunChecksum(
  options: MigrationCliOptions,
  actualChecksum: string,
) {
  if (options.mode !== "apply") return;
  if (options.dryRunChecksum !== actualChecksum.toLowerCase()) {
    throw new Error(
      "Dry-run checksum không khớp. Dữ liệu, mapping hoặc target đã đổi; phải dry-run lại.",
    );
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function buildSuggestedApplyCommand(
  options: Pick<
    MigrationCliOptions,
    "catalogMapPath" | "inlineCatalogMappings"
  >,
  checksum: string,
) {
  const mappingArguments = [
    ...(options.catalogMapPath
      ? [`--catalog-map=${shellQuote(options.catalogMapPath)}`]
      : []),
    ...options.inlineCatalogMappings.map(
      (mapping) => `--map-json=${shellQuote(JSON.stringify(mapping))}`,
    ),
  ];
  return [
    "bun scripts/migrate-v2.ts",
    ...mappingArguments,
    "--apply",
    "--confirm=ONLINE-snowmilk",
    `--dry-run-checksum=${checksum}`,
  ].join(" ");
}

export function sanitizeMigrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "[REDACTED_MONGODB_URI]")
    .replace(/(password|username)=([^&\s]+)/gi, "$1=[REDACTED]");
}
