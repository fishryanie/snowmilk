import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
const inputPath = path.resolve(fileArg?.slice(7) || "data/source.xlsx");
const outputPath = path.resolve("docs/excel-profile.json");

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(inputPath);

const sheets = workbook.worksheets.map((sheet) => {
  const formulas: { cell: string; formula: string }[] = [];
  const numberFormats = new Map<string, number>();
  let nonEmptyCells = 0;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      nonEmptyCells += 1;
      if (cell.type === ExcelJS.ValueType.Formula) {
        const value = cell.value as ExcelJS.CellFormulaValue;
        formulas.push({ cell: cell.address, formula: value.formula });
      }
      if (cell.numFmt && cell.numFmt !== "General") {
        numberFormats.set(cell.numFmt, (numberFormats.get(cell.numFmt) ?? 0) + 1);
      }
    });
  });

  const mergeRanges = Array.isArray(sheet.model.merges) ? sheet.model.merges : [];
  const dataValidationModel = (
    sheet as unknown as {
      dataValidations: { model: Record<string, unknown> };
    }
  ).dataValidations.model;
  const validations = Object.entries(dataValidationModel).map(
    ([range, validation]) => ({ range, validation }),
  );

  return {
    name: sheet.name,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    actualRowCount: sheet.actualRowCount,
    actualColumnCount: sheet.actualColumnCount,
    nonEmptyCells,
    formulaCount: formulas.length,
    formulas,
    mergeRanges,
    validations,
    tables: sheet.getTables().map(([table]) => ({
      name: table.name,
      ref: table.ref,
    })),
    numberFormats: Object.fromEntries(numberFormats),
    sampleRows: sheet
      .getRows(1, Math.min(12, sheet.rowCount))
      ?.map((row) => row.values) ?? [],
  };
});

const report = {
  inputPath,
  analyzedAt: new Date().toISOString(),
  sheetCount: sheets.length,
  sheets,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath,
      sheets: sheets.map((sheet) => ({
        name: sheet.name,
        rows: sheet.rowCount,
        columns: sheet.columnCount,
        formulas: sheet.formulaCount,
        merges: sheet.mergeRanges.length,
        validations: sheet.validations.length,
      })),
    },
    null,
    2,
  ),
);

await readFile(outputPath);
