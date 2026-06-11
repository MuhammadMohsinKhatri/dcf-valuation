import ExcelJS from "exceljs";
import type { DCFModel } from "@/types/model";
import { buildCoverSheet } from "./sheets/cover";
import { buildAssumptionsSheet } from "./sheets/assumptions";
import { buildThreeStatementSheets } from "./sheets/threestatement";
import { buildDCFSheet } from "./sheets/dcf";

export async function buildDCFExcel(model: DCFModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fable DCF Platform";
  wb.created = new Date();
  wb.modified = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  // 1. Cover sheet
  buildCoverSheet(wb, model);

  // 2. Assumptions sheet — returns cell address map for cross-sheet formulas
  const amap = buildAssumptionsSheet(wb, model);

  // 3. Three-statement model — IS, BS, CF
  const projCells = buildThreeStatementSheets(wb, model, amap);

  // 4. DCF output + sensitivity table
  buildDCFSheet(wb, model, amap, projCells);

  // 5. Formula error check sheet
  buildErrorCheckSheet(wb);

  // Freeze panes, print settings
  wb.worksheets.forEach((ws) => {
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2, showGridLines: true }];
    ws.pageSetup = {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    ws.headerFooter = {
      oddHeader: `&L${model.companyName} DCF Model&R&D`,
      oddFooter: "&LConfidential — Internal Use Only&RPage &P of &N",
    };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildErrorCheckSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("QC", {
    properties: { tabColor: { argb: "FFFF0000" } },
  });
  ws.getColumn("A").width = 40;
  ws.getColumn("B").width = 20;
  ws.getColumn("C").width = 30;

  ws.mergeCells("A1:C1");
  ws.getCell("A1").value = "Quality Control — Formula Error Check";
  ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  ws.getRow(1).height = 22;

  const checks = [
    ["Cover!B10", "Intrinsic Value / Share"],
    ["DCF!B45", "DCF IV/Share (cross-check)"],
    ["Assumptions!B2", "Active Scenario"],
    ["'Income Statement'!B20", "Latest Revenue"],
    ["'Cash Flow'!B3", "Latest FCF"],
  ];

  ws.getCell("A2").value = "Cell Reference";
  ws.getCell("B2").value = "Value";
  ws.getCell("C2").value = "Status";
  ["A2", "B2", "C2"].forEach((a) => {
    ws.getCell(a).font = { bold: true, name: "Calibri", size: 10 };
    ws.getCell(a).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  });

  checks.forEach(([ref, label], i) => {
    const row = i + 3;
    ws.getCell(`A${row}`).value = `${label} (${ref})`;
    ws.getCell(`A${row}`).font = { name: "Calibri", size: 10 };
    ws.getCell(`B${row}`).value = { formula: `=${ref}` };
    ws.getCell(`B${row}`).font = { name: "Calibri", size: 10 };
    ws.getCell(`C${row}`).value = {
      formula: `=IF(ISERROR(${ref}),"⚠ ERROR","✓ OK")`,
    };
    ws.getCell(`C${row}`).font = { name: "Calibri", size: 10 };
  });

  // Master pass/fail
  ws.getCell("A9").value = "OVERALL MODEL STATUS";
  ws.getCell("A9").font = { bold: true, size: 11, name: "Calibri" };
  ws.getCell("B9").value = {
    formula: `=IF(SUMPRODUCT((C3:C7="⚠ ERROR")*1)>0,"ERRORS FOUND — DO NOT DISTRIBUTE","✓ ZERO FORMULA ERRORS")`,
  };
  ws.getCell("B9").font = { bold: true, size: 11, name: "Calibri" };
}
