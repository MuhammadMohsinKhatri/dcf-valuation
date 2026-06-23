import type ExcelJS from "exceljs";
import { headerStyle, labelStyle, formulaStyle, inputStyle } from "../styles";
import type { DCFModel } from "@/types/model";

export function buildCoverSheet(wb: ExcelJS.Workbook, model: DCFModel) {
  const ws = wb.addWorksheet("Cover", { properties: { tabColor: { argb: "FF1F3864" } } });

  ws.getColumn("A").width = 30;
  ws.getColumn("B").width = 40;

  // Title block
  ws.mergeCells("A1:B1");
  const title = ws.getCell("A1");
  title.value = `${model.companyName} (${model.ticker}) — DCF Valuation Model`;
  Object.assign(title, headerStyle());
  title.font = { ...headerStyle().font, size: 14, bold: true };
  ws.getRow(1).height = 30;

  const rows: [string, string | number | { formula: string }][] = [
    ["Company", model.companyName],
    ["Ticker", model.ticker],
    ["Currency", model.currency],
    ["Valuation Date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ["Model Version", "1.0"],
    ["Prepared by", ""],
    ["", ""],
    ["Active Scenario", { formula: "Assumptions!B2" }],
    ["Intrinsic Value / Share", { formula: "DCF!B45" }],
    ["Current Price", ""],
    ["Upside / Downside", { formula: 'IF(Cover!B11="","",Cover!B10/Cover!B11-1)' }],
  ];

  rows.forEach(([label, value], i) => {
    const row = i + 3;
    const a = ws.getCell(`A${row}`);
    const b = ws.getCell(`B${row}`);
    a.value = label;
    Object.assign(a, labelStyle());
    if (label) a.font = { ...labelStyle().font, bold: true };

    if (typeof value === "object" && "formula" in value) {
      b.value = value;
      if (label === "Intrinsic Value / Share") {
        Object.assign(b, formulaStyle(`${model.currency === "USD" ? "$" : ""}#,##0.00`));
        b.font = { ...formulaStyle().font, bold: true, size: 12 };
      } else if (label === "Upside / Downside") {
        Object.assign(b, formulaStyle("0.0%"));
      } else {
        Object.assign(b, formulaStyle());
      }
    } else {
      b.value = value;
      if (label === "Current Price" || label === "Prepared by") {
        Object.assign(b, inputStyle("#,##0.00"));
      } else {
        Object.assign(b, labelStyle());
      }
    }
  });

  // Disclaimer
  ws.mergeCells("A16:B18");
  const disc = ws.getCell("A16");
  disc.value =
    "DISCLAIMER: This model is for informational purposes only and does not constitute investment advice. " +
    "All projections are estimates and actual results may differ materially.";
  disc.font = { italic: true, size: 9, color: { argb: "FF808080" }, name: "Calibri" };
  disc.alignment = { wrapText: true, vertical: "top" };
}
