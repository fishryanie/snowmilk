const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const vietnamDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function vietnamDateKey(value: Date) {
  const parts = vietnamDateFormatter.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function vietnamDayBoundary(date: string, endOfDay = false) {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${date}T${time}+07:00`);
}

export function isVietnamDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const boundary = vietnamDayBoundary(value);
  return (
    !Number.isNaN(boundary.valueOf()) && vietnamDateKey(boundary) === value
  );
}
