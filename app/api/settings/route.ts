import { z } from "zod";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { editableSettingDefinitions } from "@/lib/settings";
import { Equipment } from "@/models/Equipment";
import { Setting } from "@/models/Setting";
import { recalculateProductCosts } from "@/services/resource.service";

const settingKey = z.enum(
  editableSettingDefinitions.map((setting) => setting.key) as [
    (typeof editableSettingDefinitions)[number]["key"],
    ...(typeof editableSettingDefinitions)[number]["key"][],
  ],
);
const settingsSchema = z.array(
  z
    .object({
      key: settingKey,
      value: z.coerce.number().min(0),
    })
    .strict(),
);

async function calculatedSettings(
  incoming: Array<{ key: string; value: number }> = [],
) {
  const [stored, depreciation] = await Promise.all([
    Setting.find({
      key: {
        $in: editableSettingDefinitions.map((setting) => setting.key),
      },
    }).lean(),
    Equipment.aggregate<{ value: number }>([
      { $match: { isActive: true } },
      { $group: { _id: null, value: { $sum: "$monthlyDepreciation" } } },
    ]),
  ]);
  const values = new Map<string, number>(
    editableSettingDefinitions.map((setting) => [
      setting.key,
      setting.defaultValue,
    ]),
  );
  for (const setting of stored) {
    values.set(setting.key, Number(setting.value ?? 0));
  }
  for (const setting of incoming) {
    values.set(setting.key, setting.value);
  }

  const monthlyDepreciation = depreciation[0]?.value ?? 0;
  const expectedCups = values.get("so_ly_du_kien_thang") ?? 0;
  const fixedCost = values.get("chi_phi_co_dinh_thang_d") ?? 0;
  const allocation =
    expectedCups > 0
      ? (fixedCost + monthlyDepreciation) / expectedCups
      : 0;

  return [
    ...editableSettingDefinitions.map((setting) => ({
      key: setting.key,
      label: setting.label,
      value: values.get(setting.key) ?? setting.defaultValue,
      unit: setting.unit,
      editable: true,
    })),
    {
      key: "khau_hao_thang_tu_tai_san_d",
      label: "Khấu hao/tháng từ tài sản",
      value: monthlyDepreciation,
      unit: "đ",
      editable: false,
    },
    {
      key: "phan_bo_co_dinh_khau_hao_ly_d",
      label: "Phân bổ cố định + khấu hao/ly",
      value: allocation,
      unit: "đ/ly",
      editable: false,
    },
  ];
}

export async function GET() {
  try {
    await connectMongo();
    return apiSuccess(await calculatedSettings());
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Cấu hình không hợp lệ", 422, parsed.error.flatten());
    }
    await connectMongo();
    const settings = await calculatedSettings(parsed.data);
    await Setting.bulkWrite(
      settings.map((setting) => ({
        updateOne: {
          filter: { key: setting.key },
          update: {
            $set: {
              key: setting.key,
              label: setting.label,
              value: setting.value,
              unit: setting.unit,
            },
          },
          upsert: true,
        },
      })),
    );
    await recalculateProductCosts();
    return apiSuccess(settings, "Đã lưu và tính lại cấu hình");
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
