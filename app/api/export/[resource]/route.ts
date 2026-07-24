import ExcelJS from "exceljs";
import { apiError, errorMessage } from "@/lib/api-response";
import { isResourceName } from "@/lib/validators/resources";
import { listResources } from "@/services/resource.service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params;
  if (!isResourceName(resource)) return apiError("Tài nguyên không tồn tại", 404);
  try {
    const records = JSON.parse(
      JSON.stringify(await listResources(resource, { limit: 500 })),
    ) as Record<string, unknown>[];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(resource);
    const keys = [...new Set(records.flatMap((record) => Object.keys(record)))]
      .filter((key) => !["_id", "__v"].includes(key));
    sheet.columns = keys.map((key) => ({
      header: key,
      key,
      width: Math.min(34, Math.max(14, key.length + 4)),
    }));
    records.forEach((record) => {
      sheet.addRow(
        Object.fromEntries(
          keys.map((key) => [
            key,
            typeof record[key] === "object"
              ? JSON.stringify(record[key])
              : record[key],
          ]),
        ),
      );
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF16645A" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(keys.length).address };
    const bytes = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${resource}.xlsx"`,
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
