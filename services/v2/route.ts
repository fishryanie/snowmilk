import "server-only";

import { ZodError } from "zod";
import { apiError, errorMessage } from "@/lib/api-response";
import { authErrorResponse } from "@/lib/auth/api";
import { DomainError } from "@/services/v2/errors";

export function v2ErrorResponse(error: unknown) {
  const authorization = authErrorResponse(error);
  if (authorization) return authorization;
  if (error instanceof DomainError) {
    return apiError(error.message, error.status, {
      code: error.code,
      details: error.details,
    });
  }
  if (error instanceof ZodError) {
    return apiError("Dữ liệu gửi lên chưa hợp lệ.", 422, {
      code: "VALIDATION_ERROR",
      fields: error.flatten(),
    });
  }
  const safeLogMessage = errorMessage(error)
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "[REDACTED_MONGODB_URI]")
    .replace(/(password|username)=([^&\s]+)/gi, "$1=[REDACTED]");
  console.error(`[v2] ${safeLogMessage}`);
  return apiError("Không thể xử lý yêu cầu do lỗi hệ thống.", 500, {
    code: "INTERNAL_ERROR",
  });
}
