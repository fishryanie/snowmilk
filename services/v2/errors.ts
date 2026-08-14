export class DomainError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 503 = 422,
    readonly code = "DOMAIN_ERROR",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function duplicateKey(error: unknown) {
  return (error as { code?: number } | null)?.code === 11000;
}
