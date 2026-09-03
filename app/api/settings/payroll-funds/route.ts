import { z } from "zod";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import {
  advancePayrollReserveFunds,
  DEFAULT_PAYROLL_RESERVE_FUNDS,
  normalizePayrollReserveFunds,
  PAYROLL_RESERVE_FUND_MODES,
  PAYROLL_RESERVE_SETTING_PREFIX,
  payrollReserveSettingKey,
  totalPayrollReserveFunds,
} from "@/lib/payroll";
import { Setting } from "@/models/Setting";
import { PayrollWithdrawal } from "@/models/PayrollWithdrawal";
import { getPayrollPeriodSummaries } from "@/services/payroll-period.service";

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const payrollFundsSchema = z
  .object({
    period: periodSchema,
    funds: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(100),
            name: z.string().trim().min(1).max(100),
            mode: z.enum(PAYROLL_RESERVE_FUND_MODES),
            amount: z.coerce.number().finite().min(0).max(1_000_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine(({ funds }, context) => {
    const names = new Set<string>();
    const ids = new Set<string>();
    funds.forEach((fund, index) => {
      const normalizedName = fund.name.toLocaleLowerCase("vi");
      if (names.has(normalizedName)) {
        context.addIssue({
          code: "custom",
          path: ["funds", index, "name"],
          message: "Tên quỹ không được trùng nhau",
        });
      }
      names.add(normalizedName);
      if (ids.has(fund.id)) {
        context.addIssue({
          code: "custom",
          path: ["funds", index, "id"],
          message: "Mã quỹ không được trùng nhau",
        });
      }
      ids.add(fund.id);
    });
  });

function periodReferenceDate(period: string) {
  return new Date(`${period}-15T12:00:00+07:00`);
}

async function responseData(period: string) {
  const settingKey = payrollReserveSettingKey(period);
  const [exactSetting, inheritedSetting, summaries, locked] = await Promise.all([
    Setting.findOne({ key: settingKey })
      .select("key value")
      .lean<{ key: string; value?: unknown }>(),
    Setting.findOne({
      key: {
        $gte: PAYROLL_RESERVE_SETTING_PREFIX,
        $lte: settingKey,
        $regex: `^${PAYROLL_RESERVE_SETTING_PREFIX}\\d{4}-(0[1-9]|1[0-2])$`,
      },
    })
      .sort({ key: -1 })
      .select("key value")
      .lean<{ key: string; value?: unknown }>(),
    getPayrollPeriodSummaries(periodReferenceDate(period)),
    PayrollWithdrawal.exists({ period }),
  ]);
  const funds = normalizePayrollReserveFunds(
    exactSetting?.value ?? inheritedSetting?.value ?? DEFAULT_PAYROLL_RESERVE_FUNDS,
  );
  const selectedIndex = summaries.findIndex((summary) => summary.period === period);
  const previousBalances =
    selectedIndex > 0 ? summaries[selectedIndex - 1].reserveFunds : [];
  const balances =
    selectedIndex >= 0
      ? summaries[selectedIndex].reserveFunds
      : advancePayrollReserveFunds(previousBalances, funds);
  const previousTotal = totalPayrollReserveFunds(previousBalances);
  const total = totalPayrollReserveFunds(balances);

  return {
    period,
    funds,
    previousBalances,
    balances,
    previousTotal,
    periodChange: total - previousTotal,
    total,
    customized: Boolean(exactSetting),
    inheritedFrom:
      !exactSetting && inheritedSetting
        ? inheritedSetting.key.slice(PAYROLL_RESERVE_SETTING_PREFIX.length)
        : null,
    locked: Boolean(locked),
  };
}

export async function GET(request: Request) {
  try {
    const period = new URL(request.url).searchParams.get("period");
    const parsedPeriod = periodSchema.safeParse(period);
    if (!parsedPeriod.success) {
      return apiError("Tháng cấu hình không hợp lệ", 422);
    }

    await connectMongo();
    return apiSuccess(await responseData(parsedPeriod.data));
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = payrollFundsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Cấu hình quỹ lương không hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }

    const funds = normalizePayrollReserveFunds(parsed.data.funds);
    await connectMongo();
    const hasWithdrawals = await PayrollWithdrawal.exists({
      period: parsed.data.period,
    });
    if (hasWithdrawals) {
      return apiError(
        "Tháng này đã phát sinh phiếu rút lương nên cấu hình quỹ đã được khóa.",
        409,
      );
    }
    await Setting.findOneAndUpdate(
      { key: payrollReserveSettingKey(parsed.data.period) },
      {
        $set: {
          key: payrollReserveSettingKey(parsed.data.period),
          label: `Các quỹ giữ lại trước khi chi lương ${parsed.data.period}`,
          value: funds,
          unit: "đ",
        },
      },
      { upsert: true, runValidators: true },
    );

    return apiSuccess(
      await responseData(parsed.data.period),
      "Đã lưu khoản trích tháng và cập nhật số dư quỹ lũy kế",
    );
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
