import { ObjectId } from "mongodb";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { bootstrapAuth } from "@/lib/auth";
import { bootstrapTokenMatches } from "@/lib/auth/config";
import { getAuthMongo } from "@/lib/auth/mongo";
import { v2ErrorResponse } from "@/services/v2/route";

const inputSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(2).max(100),
  organizationId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
});

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return request.headers.get("x-bootstrap-token");
}

export async function POST(request: Request) {
  try {
    if (!bootstrapTokenMatches(bearerToken(request))) {
      return apiError("Bootstrap token không hợp lệ.", 401);
    }
    const input = inputSchema.parse(await request.json());
    const { db } = getAuthMongo();
    const organization = await db.collection("v2_organizations").findOne({
      ...(input.organizationId
        ? { _id: new ObjectId(input.organizationId) }
        : {}),
      isActive: { $ne: false },
    });
    if (!organization) {
      return apiError(
        "Chưa có organization v2 để gắn owner. Hãy hoàn tất migration seed trước.",
        409,
      );
    }

    const activeOwner = await db.collection("v2_memberships").findOne({
      organizationId: organization._id,
      role: "owner",
      status: "active",
      isActive: { $ne: false },
    });
    if (activeOwner) {
      return apiError(
        "Tổ chức đã có owner. Hãy quản lý nhân viên từ tài khoản owner hiện tại.",
        409,
      );
    }

    const existingUser = await db
      .collection("auth_users")
      .findOne({ email: input.email.toLowerCase() });
    let userId = existingUser?._id ? String(existingUser._id) : "";
    if (!userId) {
      const created = await bootstrapAuth.api.signUpEmail({
        headers: request.headers,
        body: {
          email: input.email,
          password: input.password,
          name: input.name,
        },
      });
      userId = created.user.id;
    }

    const now = new Date();
    await db.collection("v2_memberships").updateOne(
      { organizationId: organization._id, userId },
      {
        $setOnInsert: {
          organizationId: organization._id,
          userId,
          locationIds: [],
          role: "owner",
          status: "active",
          isActive: true,
          version: 1,
          actor: {
            userId,
            displayName: input.name,
            source: "user",
            requestId: "bootstrap-owner",
          },
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    return apiSuccess(
      {
        userId,
        organizationId: String(organization._id),
        role: "owner",
        next: "Đăng nhập thử, sau đó đặt AUTH_ENFORCEMENT=enabled và xóa AUTH_BOOTSTRAP_TOKEN.",
      },
      "Đã tạo owner đầu tiên.",
      201,
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
