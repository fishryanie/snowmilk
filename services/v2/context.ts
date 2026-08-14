import { Types } from "mongoose";
import type { AccessContext } from "@/lib/auth/dal";
import { DomainError } from "@/services/v2/errors";

export type V2Actor = {
  userId: string;
  displayName: string;
  source: "user" | "system";
  requestId?: string;
};

export type V2Context = {
  organizationId: Types.ObjectId;
  locationId: Types.ObjectId;
  actor: V2Actor;
  role: AccessContext["role"];
};

function toObjectId(value: string, label: string) {
  if (!Types.ObjectId.isValid(value)) {
    throw new DomainError(`${label} không hợp lệ.`, 422, "INVALID_OBJECT_ID");
  }
  return new Types.ObjectId(value);
}

export function toV2Context(access: AccessContext): V2Context {
  return {
    organizationId: toObjectId(access.organizationId, "organizationId"),
    locationId: toObjectId(access.locationId, "locationId"),
    role: access.role,
    actor: {
      userId: access.userId,
      displayName: access.userName,
      source: access.authMode === "session" ? "user" : "system",
    },
  };
}

export function id(value: string, label = "id") {
  return toObjectId(value, label);
}

export function parseBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainError(
      "Ngày kinh doanh phải có định dạng YYYY-MM-DD.",
      422,
      "INVALID_BUSINESS_DATE",
    );
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new DomainError(
      "Ngày kinh doanh không tồn tại.",
      422,
      "INVALID_BUSINESS_DATE",
    );
  }
  return value;
}
