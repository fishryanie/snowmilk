import "server-only";

import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getAuthMongo } from "@/lib/auth/mongo";
import {
  isRole,
  roleCan,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";

export type AccessContext = {
  userId: string;
  userName: string;
  organizationId: string;
  locationId: string;
  role: Role;
  authMode: "session" | "feature-flag-disabled";
};

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 503,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

function objectId(value: unknown) {
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

async function resolveLocationId(
  organizationId: ObjectId,
  requestedLocationId?: string | null,
  allowedLocationIds: ObjectId[] = [],
) {
  const { db } = getAuthMongo();
  const requested = objectId(requestedLocationId);
  const location = await db.collection("v2_locations").findOne(
    {
      organizationId,
      ...(requested ? { _id: requested } : {}),
      ...(allowedLocationIds.length > 0
        ? { _id: { $in: allowedLocationIds, ...(requested ? { $eq: requested } : {}) } }
        : {}),
      isActive: { $ne: false },
    },
    { projection: { _id: 1 }, sort: { isDefault: -1, createdAt: 1 } },
  );
  if (!location) {
    throw new AuthorizationError(
      requested
        ? "Điểm bán không thuộc tổ chức hoặc đã ngừng hoạt động."
        : "Chưa có điểm bán v2 đang hoạt động.",
      403,
    );
  }
  return String(location._id);
}

export async function getAccessContext(
  headers: Headers,
): Promise<AccessContext | null> {
  const requestedLocationId = headers.get("x-location-id");
  // V2 Route Handlers always require a real session. AUTH_ENFORCEMENT only
  // controls the rollout proxy for legacy pages/routes; it must never turn an
  // unauthenticated v2 request into an implicit owner.
  const session = await auth.api.getSession({ headers });
  if (!session) return null;

  const { db } = getAuthMongo();
  const membership = await db.collection("v2_memberships").findOne(
    {
      userId: session.user.id,
      status: "active",
      isActive: { $ne: false },
    },
    { sort: { createdAt: 1 } },
  );
  const organizationId = objectId(membership?.organizationId);
  if (!organizationId || !isRole(membership?.role)) {
    throw new AuthorizationError(
      "Tài khoản chưa có quyền trong tổ chức hoặc đã bị khóa.",
      403,
    );
  }

  return {
    userId: session.user.id,
    userName: session.user.name,
    organizationId: String(organizationId),
    locationId: await resolveLocationId(
      organizationId,
      requestedLocationId,
      membership.role === "owner"
        ? []
        : ((membership.locationIds as unknown[] | undefined) ?? [])
            .map(objectId)
            .filter((value): value is ObjectId => value != null),
    ),
    role: membership.role,
    authMode: "session",
  };
}

export async function requirePermission(
  headers: Headers,
  permission: Permission,
) {
  const access = await getAccessContext(headers);
  if (!access) {
    throw new AuthorizationError("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.", 401);
  }
  if (!roleCan(access.role, permission)) {
    throw new AuthorizationError(
      `Vai trò ${access.role} không có quyền ${permission}.`,
      403,
    );
  }
  return access;
}
