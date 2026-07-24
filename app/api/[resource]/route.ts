import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  isResourceName,
  resourceSchemas,
} from "@/lib/validators/resources";
import {
  createResource,
  listResources,
} from "@/services/resource.service";

export async function GET(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;
  if (!isResourceName(resource)) return apiError("Tài nguyên không tồn tại", 404);

  try {
    const url = new URL(request.url);
    const data = await listResources(resource, {
      query: url.searchParams.get("q") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 250),
    });
    return apiSuccess(data);
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;
  if (!isResourceName(resource)) return apiError("Tài nguyên không tồn tại", 404);

  try {
    const parsed = resourceSchemas[resource].safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Dữ liệu không hợp lệ", 422, parsed.error.flatten());
    }
    const data = await createResource(resource, parsed.data);
    return apiSuccess(data, "Đã thêm dữ liệu", 201);
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
