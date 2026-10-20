type AuthEnvironment = Readonly<Record<string, string | undefined>>;

function origin(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Địa chỉ đăng nhập phải là URL HTTP hoặc HTTPS hợp lệ.');
  }
  return url.origin;
}

/** Only trust configured URLs and exact domains supplied by this Vercel project. */
export function authUrlConfig(env: AuthEnvironment = process.env): {
  baseURL: string | undefined;
  trustedOrigins: string[];
} {
  const configured = env.BETTER_AUTH_URL?.trim();
  const vercelOrigins = env.VERCEL === '1'
    ? [
        env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : undefined,
        env.VERCEL_BRANCH_URL,
        env.VERCEL_URL,
      ].filter((host): host is string => Boolean(host?.trim()))
        .map(host => origin(`https://${host.trim()}`))
    : [];
  const baseURL = configured
    ? origin(configured)
    : vercelOrigins[0] ?? (env.NODE_ENV !== 'production' ? 'http://localhost:3001' : undefined);

  return {
    baseURL,
    trustedOrigins: [...new Set([baseURL, ...vercelOrigins].filter((url): url is string => Boolean(url)))],
  };
}
