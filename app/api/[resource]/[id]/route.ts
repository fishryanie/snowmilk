import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  isResourceName,
  resourceSchemas,
} from "@/lib/validators/resources";
import {
  deleteResource,
  updateResource,
} from "@/services/resource.service";
import { deleteDivestmentClaim } from "@/services/divestment.service";

type Context = { params: Promise<{ resource: string; id: string }> };

export async function PUT(request: Request, context: Context) {
  const { resource, id } = await context.params;
  if (!isResourceName(resource)) return apiError("Tài nguyên không tồn tại", 404);
  if (resource === "divestments") {
    return apiError(
      "Không thể sửa tay số tiền đã thu hồi. Hãy xóa và chọn lại các khoản lịch sử.",
      405,
    );
  }
  try {
    const parsed = resourceSchemas[resource].safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Dữ liệu không hợp lệ", 422, parsed.error.flatten());
    }
    const data = await updateResource(resource, id, parsed.data);
    if (!data) return apiError("Không tìm thấy dữ liệu", 404);
    return apiSuccess(data, "Đã cập nhật dữ liệu");
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { resource, id } = await context.params;
  if (!isResourceName(resource)) return apiError("Tài nguyên không tồn tại", 404);
  try {
    const data =
      resource === "divestments"
        ? await deleteDivestmentClaim(id)
        : await deleteResource(resource, id);
    if (!data) return apiError("Không tìm thấy dữ liệu", 404);
    return apiSuccess(
      { id },
      resource === "divestments"
        ? "Đã xóa claim và hoàn lại nguồn tiền Vốn chủ"
        : "Đã xóa dữ liệu",
    );
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
