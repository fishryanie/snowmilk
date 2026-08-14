import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError, requirePermission } from "@/lib/auth/dal";
import { assertAuthEnvironment, isAuthEnforced } from "@/lib/auth/config";
import { permissionForRequest } from "@/lib/auth/permissions";

const PUBLIC_PREFIXES = [
  "/api/auth",
  "/api/v2/auth/bootstrap-owner",
  "/sign-in",
] as const;

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function apiFailure(message: string, status: number) {
  return NextResponse.json(
    { success: false, message },
    { status },
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isAuthEnforced() || isPublicPath(pathname)) return NextResponse.next();

  try {
    assertAuthEnvironment();
    await requirePermission(
      request.headers,
      permissionForRequest(pathname, request.method),
    );
    return NextResponse.next();
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 503;
    const message =
      error instanceof Error ? error.message : "Không thể xác thực phiên làm việc.";

    if (pathname.startsWith("/api/")) return apiFailure(message, status);

    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(signInUrl);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.png|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
