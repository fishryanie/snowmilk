const DEFAULT_MONGODB_DB_NAME = "snowmilk";

type MongoEnvironment = Readonly<Record<string, string | undefined>>;

export type MongoConfig = {
  uri: string;
  dbName: string;
};

function injectCredentials(
  uri: string,
  username: string,
  password: string,
): string {
  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(.*)$/);
  if (!match) {
    throw new Error(
      "MONGODB_URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://.",
    );
  }

  const [, protocol, authority, suffix] = match;
  const hosts = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;
  const credentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;

  return `${protocol}${credentials}@${hosts}${suffix}`;
}

export function getMongoConfig(
  env: MongoEnvironment = process.env,
): MongoConfig {
  const rawUri = env.MONGODB_URI?.trim();
  const username = env.MONGODB_USERNAME?.trim();
  const password = env.MONGODB_PASSWORD?.trim();
  const dbName = env.MONGODB_DB_NAME?.trim() || DEFAULT_MONGODB_DB_NAME;

  if (!rawUri) {
    throw new Error(
      "Thiếu MONGODB_URI. Hãy sao chép .env.example thành .env.local và cấu hình MongoDB.",
    );
  }

  if (Boolean(username) !== Boolean(password)) {
    throw new Error(
      "MONGODB_USERNAME và MONGODB_PASSWORD phải được khai báo cùng nhau.",
    );
  }

  return {
    uri:
      username && password
        ? injectCredentials(rawUri, username, password)
        : rawUri,
    dbName,
  };
}
