import ExcelJS from "exceljs";

export async function readWorkbook(input: Buffer | ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  const bytes =
    input instanceof Buffer
      ? input
      : Buffer.from(new Uint8Array(input));
  await workbook.xlsx.load(bytes as never);
  return workbook;
}
