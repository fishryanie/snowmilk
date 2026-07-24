import { NextResponse } from "next/server";

export type ApiEnvelope<T = unknown> = {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
};

export function apiSuccess<T>(
  data: T,
  message = "Thao tác thành công",
  status = 200,
) {
  return NextResponse.json<ApiEnvelope<T>>(
    { success: true, message, data },
    { status },
  );
}

export function apiError(
  message: string,
  status = 400,
  errors?: unknown,
) {
  return NextResponse.json<ApiEnvelope>(
    { success: false, message, errors },
    { status },
  );
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định";
}
