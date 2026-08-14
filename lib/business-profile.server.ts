import "server-only";

import { ObjectId } from "mongodb";
import { cache } from "react";
import {
  normalizeBusinessProfile,
  type BusinessProfile,
} from "@/lib/business-profile";
import { getAuthMongo } from "@/lib/auth/mongo";

export const loadBusinessProfile = cache(async function loadBusinessProfile(
  organizationId?: string,
): Promise<BusinessProfile> {
  try {
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
  } catch {
    // Branding must not make error pages or PDFs unavailable during rollout.
    return normalizeBusinessProfile();
  }
});
