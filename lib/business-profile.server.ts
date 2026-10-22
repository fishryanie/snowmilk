import "server-only";

import { ObjectId } from "mongodb";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  normalizeBusinessProfile,
  type BusinessProfile,
} from "@/lib/business-profile";
import { getAuthMongo } from "@/lib/auth/mongo";

// This app uses Next's caching model without Cache Components. Cache only the
// public brand profile across requests/instances, never financial/session data.
const cachedBusinessProfile = unstable_cache(readBusinessProfile, ["business-profile-v1"], {
  revalidate: 60,
});

export const loadBusinessProfile = cache(async function loadBusinessProfile(
  organizationId?: string,
): Promise<BusinessProfile> {
  try {
    return await cachedBusinessProfile(organizationId);
  } catch {
    // Branding must not make error pages or PDFs unavailable during rollout.
    return normalizeBusinessProfile();
  }
});

async function readBusinessProfile(organizationId?: string): Promise<BusinessProfile> {
  const { db } = getAuthMongo();
  const requestedId =
    organizationId && ObjectId.isValid(organizationId)
      ? new ObjectId(organizationId)
      : null;
  const organization = await db.collection("v2_organizations").findOne(
    {
      ...(requestedId ? { _id: requestedId } : {}),
      isActive: { $ne: false },
    },
    { projection: { profile: 1 }, sort: { createdAt: 1 } },
  );
  return normalizeBusinessProfile(
    organization?.profile as Parameters<typeof normalizeBusinessProfile>[0],
  );
}
