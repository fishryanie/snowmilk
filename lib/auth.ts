import "server-only";

import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { isAuthEnforced } from "@/lib/auth/config";
import { getAuthMongo } from "@/lib/auth/mongo";
import { DEFAULT_BUSINESS_PROFILE } from "@/lib/business-profile";

const { client, db } = getAuthMongo();
const authDisabledForRollout = !isAuthEnforced();

// Better Auth validates these options while Next.js collects route metadata.
// During rollout the legacy proxy can be disabled, but v2 APIs still require a
// real session. Never use a published/deterministic fallback secret: when the
// operator has not configured one, use a process-local random value that fails
// closed across restarts/instances. Production cutover requires the stable env
// secret and proxy.ts validates it before enforcing auth globally.
const rolloutBaseUrl = authDisabledForRollout ? "http://localhost:3000" : undefined;
const rolloutSecret = authDisabledForRollout
  ? randomBytes(32).toString("hex")
  : undefined;

function authOptions(disableSignUp: boolean) {
  return {
    appName: DEFAULT_BUSINESS_PROFILE.displayName,
    baseURL: process.env.BETTER_AUTH_URL ?? rolloutBaseUrl,
    secret: process.env.BETTER_AUTH_SECRET ?? rolloutSecret,
    database: mongodbAdapter(db, { client, transaction: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    advanced: {
      database: { generateId: "uuid" as const },
      cookiePrefix: "bep-nha-ne",
    },
    user: { modelName: "auth_users" },
    session: { modelName: "auth_sessions" },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
  };
}

/** Publicly mounted auth instance. Account creation is deliberately disabled. */
export const auth = betterAuth(authOptions(true));

/**
 * Internal-only instance used by the token-protected, one-shot owner bootstrap.
 * It is never mounted as an HTTP handler.
 */
export const bootstrapAuth = betterAuth(authOptions(false));
