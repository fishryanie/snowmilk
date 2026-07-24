import dayjs, { type ConfigType } from "dayjs";

export const formatVnd = (value: number | null | undefined) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value ?? 0);

export const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat("vi-VN").format(value ?? 0);

export const formatVndInput = (
  value: string | number | null | undefined,
) => {
  if (value == null || value === "") return "";
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? `${new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 0,
      }).format(numericValue)} ₫`
    : "";
};

export const parseVndInput = (value: string | undefined) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
};

export const formatDate = (value: ConfigType) =>
  value ? dayjs(value).format("DD/MM/YYYY") : "—";

export const toDateInput = (value: ConfigType) =>
  value ? dayjs(value).format("YYYY-MM-DD") : "";
