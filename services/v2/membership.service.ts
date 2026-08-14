import "server-only";

import { ObjectId, UUID } from "mongodb";
import { bootstrapAuth } from "@/lib/auth";
import { getAuthMongo } from "@/lib/auth/mongo";
import { connectMongo } from "@/lib/mongodb";
import type {
  CreateMembershipInput,
  UpdateMembershipInput,
} from "@/lib/validators/v2/memberships";
import { Location } from "@/models/v2/Location";
import { Membership } from "@/models/v2/Membership";
import { id, type V2Context } from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";

// Mongoose lean documents are structurally dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;
type AuthUserDocument = {
  _id: ObjectId | UUID | string;
  email?: string;
  name?: string;
};

function authDatabaseId(value: string): ObjectId | UUID | string {
  try {
    return new UUID(value);
  } catch {
    return ObjectId.isValid(value) ? new ObjectId(value) : value;
  }
}

async function validateLocations(
  context: V2Context,
  locationIds: readonly string[],
) {
  const uniqueIds = [...new Set(locationIds)].map((value) => id(value, "locationId"));
  if (uniqueIds.length !== locationIds.length) {
    throw new DomainError("Danh sách điểm bán bị trùng.", 422, "DUPLICATE_LOCATION");
  }
  if (uniqueIds.length === 0) return [];
  const count = await Location.countDocuments({
    organizationId: context.organizationId,
    _id: { $in: uniqueIds },
    isActive: true,
  });
  if (count !== uniqueIds.length) {
    throw new DomainError(
      "Có điểm bán không thuộc tổ chức hoặc đã ngừng hoạt động.",
      422,
      "INVALID_LOCATION_SCOPE",
    );
  }
  return uniqueIds;
}

async function serializeMemberships(rows: Plain[]) {
  const { db } = getAuthMongo();
  const userIds = [...new Set(rows.map((row) => String(row.userId)))];
  const users = await db
    .collection<AuthUserDocument>("auth_users")
    .find({ _id: { $in: userIds.map(authDatabaseId) } })
    .project({ _id: 1, email: 1, name: 1 })
    .toArray();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  return rows.map((row) => {
    const user = userById.get(String(row.userId));
    return {
      id: String(row._id),
      userId: String(row.userId),
      email: String(user?.email ?? ""),
      name: String(user?.name ?? row.actor?.displayName ?? "Nhân viên"),
      role: String(row.role),
      status: String(row.status),
      locationIds: (row.locationIds ?? []).map(String),
      version: Number(row.version),
      isCurrentUser: false,
    };
  });
}

export async function listMemberships(context: V2Context) {
  await connectMongo();
  const rows = (await Membership.find({
    organizationId: context.organizationId,
  })
    .sort({ role: 1, createdAt: 1 })
    .lean()) as Plain[];
  const memberships = await serializeMemberships(rows);
  return {
    memberships: memberships.map((membership) => ({
      ...membership,
      isCurrentUser: membership.userId === context.actor.userId,
    })),
  };
}

export async function createMembership(
  context: V2Context,
  requestHeaders: Headers,
  input: CreateMembershipInput,
) {
  await connectMongo();
  const locationIds = await validateLocations(context, input.locationIds);
  const { db } = getAuthMongo();
  const authUsers = db.collection<AuthUserDocument>("auth_users");
  const existingUser = await authUsers.findOne({ email: input.email });
  let userId = existingUser ? String(existingUser._id) : "";
  if (!userId) {
    const created = await bootstrapAuth.api.signUpEmail({
      headers: requestHeaders,
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
      },
    });
    userId = created.user.id;
  }
  const existing = await Membership.findOne({
    organizationId: context.organizationId,
    userId,
  }).lean();
  if (existing) {
    throw new DomainError(
      "Email này đã có membership trong tổ chức. Hãy cập nhật bản ghi hiện tại.",
      409,
      "MEMBERSHIP_EXISTS",
    );
  }
  try {
    const membership = await Membership.create({
      organizationId: context.organizationId,
      userId,
      locationIds,
      role: input.role,
      status: "active",
      isActive: true,
      version: 1,
      actor: context.actor,
    });
    const [serialized] = await serializeMemberships([membership.toObject()]);
    return { ...serialized, isCurrentUser: false };
  } catch (error) {
    if (duplicateKey(error)) {
      throw new DomainError("Membership đã tồn tại.", 409, "MEMBERSHIP_EXISTS");
    }
    throw error;
  }
}

export async function updateMembership(
  context: V2Context,
  membershipId: string,
  input: UpdateMembershipInput,
) {
  await connectMongo();
  const locationIds = await validateLocations(context, input.locationIds);
  const membership = (await Membership.findOne({
    _id: id(membershipId, "membershipId"),
    organizationId: context.organizationId,
  })) as Plain | null;
  if (!membership) throw new DomainError("Không tìm thấy nhân viên.", 404, "NOT_FOUND");
  if (Number(membership.version) !== input.version) {
    throw new DomainError(
      "Thông tin nhân viên đã thay đổi. Hãy tải lại.",
      409,
      "VERSION_CONFLICT",
    );
  }
  const changingCurrentOwner =
    String(membership.userId) === context.actor.userId &&
    membership.role === "owner" &&
    (input.role !== "owner" || input.status !== "active");
  if (changingCurrentOwner) {
    throw new DomainError(
      "Owner đang đăng nhập không thể tự hạ quyền hoặc khóa chính mình.",
      422,
      "CANNOT_DISABLE_SELF",
    );
  }
  if (
    membership.role === "owner" &&
    membership.status === "active" &&
    (input.role !== "owner" || input.status !== "active")
  ) {
    const otherOwners = await Membership.countDocuments({
      organizationId: context.organizationId,
      _id: { $ne: membership._id },
      role: "owner",
      status: "active",
      isActive: true,
    });
    if (otherOwners === 0) {
      throw new DomainError(
        "Tổ chức phải còn ít nhất một owner đang hoạt động.",
        422,
        "LAST_OWNER",
      );
    }
  }
  membership.role = input.role;
  membership.status = input.status;
  membership.isActive = input.status === "active";
  membership.locationIds = locationIds;
  membership.version = input.version + 1;
  membership.actor = context.actor;
  await membership.save();
  const [serialized] = await serializeMemberships([membership.toObject()]);
  return {
    ...serialized,
    isCurrentUser: serialized.userId === context.actor.userId,
  };
}
