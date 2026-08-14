import "server-only";

import { apiError } from "@/lib/api-response";
import { AuthorizationError } from "@/lib/auth/dal";

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return apiError(error.message, error.status);
  }
  return null;
}
