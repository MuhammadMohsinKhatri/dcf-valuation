import type ExcelJS from "exceljs";
import {
  headerStyle,
  subheaderStyle,
  labelStyle,
  formulaStyle,
  currencyFmt,
  HEADER_BG,
  BLACK_FORMULA,
  SENSITIVITY_CENTER,
  BEAR_BG,
  BASE_BG,
  BULL_BG,
} from "../styles";
import type { DCFModel } from "@/types/model";

function col(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function buildCompsSheet(
  wb: ExcelJS.Workbook,
  model: DCFModel,
  bearIVPS: number,
  baseIVPS: number,
  bullIVPS: number
) {
  const ws = wb.addWorksheet("Comps", {
    properties: { tabColor: { argb: "FFED7D31" } },
  });

  ws.getColumn("A").width = 36;
  for (let c = 2; c <= 6; c++) ws.getColumn(c).width = 18;

  const hist = model.historicalPeriods;
  const latest = hist[0];
  const a = model.assumptions;
  const currentPrice = model.currentPrice ?? 0;
  const shares = a.sharesOutstanding;

  // Latest D&A and EBIT for EBITDA
  const latestDA = latest.depreciationAmortization / 1e6;
  const latestEBIT = latest.ebit / 1e6;
  const latestEBITDA = latestEBIT + latestDA;
  const latestRev = latest.revenue / 1e6;
  const latestNI = latest.netIncome / 1e6;
  const latestFCF = (latest.freeCashFlow ?? 0) / 1e6;

  // Helper: compute EV for a scenario
  function scenarioEV(ivps: number): number {
    return ivps * shares + a.netDebt + a.minorityInterest;
  }

  const bearEV = scenarioEV(bearIVPS);
  const baseEV = scenarioEV(baseIVPS);
  const bullEV = scenarioEV(bullIVPS);

  let row = 1;

  // ── TITLE ──────────────────────────────────────────────────────────────────
  ws.mergeCells(`A${row}:F${row}`);
  ws.getCell(`A${row}`).value = `${model.companyName} (${model.ticker}) — Trading Comparables & Valuation Summary`;
  Object.assign(ws.getCell(`A${row}`), headerStyle());
  ws.getRow(row).height = 22;
  row++;

  // ── SECTION 1: DCF Valuation Summary ──────────────────────────────────────
  row++;
  ws.mergeCells(`A${row}:F${row}`);
  ws.getCell(`A${row}`).value = "DCF Valuation Summary";
  ws.getCell(`A${row}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
  ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  row++;

  // Headers
  const dcfHdrRow = ws.getRow(row);
  ["Metric", "Bear", "Base", "Bull"].forEach((h, i) => {
    const c = dcfHdrRow.getCell(i + 1);
    c.value = h;
    Object.assign(c, subheaderStyle());
    if (i === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BEAR_BG } };
    if (i === 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BASE_BG } };
    if (i === 3) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BULL_BG } };
  });
  ws.getRow(row).height = 18;
  row++;

  function dcfRow(label: string, bear: number, base: number, bull: number, fmt = "#,##0.00") {
    ws.getCell(`A${row}`).value = label;
    Object.assign(ws.getCell(`A${row}`), labelStyle());
    [bear, base, bull].forEach((v, i) => {
      const cell = ws.getCell(`${col(i + 2)}${row}`);
      cell.value = v;
      Object.assign(cell, formulaStyle(fmt));
    });
    row++;
  }

  dcfRow("Intrinsic Value per Share ($)", bearIVPS, baseIVPS, bullIVPS);
  if (currentPrice > 0) {
    dcfRow("Current Market Price ($)", currentPrice, currentPrice, currentPrice);
    dcfRow("Upside / (Downside) %",
      (bearIVPS - currentPrice) / currentPrice,
      (baseIVPS - currentPrice) / currentPrice,
      (bullIVPS - currentPrice) / currentPrice,
      "0.0%"
    );
  }
  dcfRow("Enterprise Value ($M)", bearEV, baseEV, bullEV, currencyFmt(1));

  // ── SECTION 2: Implied Trading Multiples ──────────────────────────────────
  row++;
  ws.mergeCells(`A${row}:F${row}`);
  ws.getCell(`A${row}`).value = "Implied Trading Multiples (Trailing)";
  ws.getCell(`A${row}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
  ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  row++;

  // Headers
  const mHdrRow = ws.getRow(row);
  ["Multiple", "Bear", "Base", "Bull"].forEach((h, i) => {
    const c = mHdrRow.getCell(i + 1);
    c.value = h;
    Object.assign(c, subheaderStyle());
    if (i === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BEAR_BG } };
    if (i === 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BASE_BG } };
    if (i === 3) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BULL_BG } };
  });
  ws.getRow(row).height = 18;
  row++;

  function multRow(label: string, bear: number, base: number, bull: number, fmt = "#,##0.0x") {
    ws.getCell(`A${row}`).value = label;
    Object.assign(ws.getCell(`A${row}`), labelStyle());
    [bear, base, bull].forEach((v, i) => {
      const cell = ws.getCell(`${col(i + 2)}${row}`);
      cell.value = isFinite(v) && !isNaN(v) ? v : 0;
      Object.assign(cell, formulaStyle(fmt));
    });
    row++;
  }

  const safe = (n: number, d: number) => d !== 0 ? n / d : 0;

  multRow("EV / Revenue (LTM)",
    safe(bearEV, latestRev), safe(baseEV, latestRev), safe(bullEV, latestRev));
  multRow("EV / EBITDA (LTM)",
    safe(bearEV, latestEBITDA), safe(baseEV, latestEBITDA), safe(bullEV, latestEBITDA));
  multRow("P / E (LTM)",
    safe(bearIVPS, safe(latestNI, shares)), safe(baseIVPS, safe(latestNI, shares)), safe(bullIVPS, safe(latestNI, shares)));
  multRow("P / FCF (LTM)",
    safe(bearIVPS, safe(latestFCF, shares)), safe(baseIVPS, safe(latestFCF, shares)), safe(bullIVPS, safe(latestFCF, shares)));

  // ── SECTION 3: Football Field (data table for reference) ──────────────────
  row++;
  ws.mergeCells(`A${row}:F${row}`);
  ws.getCell(`A${row}`).value = `Valuation Football Field — ${model.ticker}`;
  ws.getCell(`A${row}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
  ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  row++;

  // Football field data
  ["Scenario", "Bear IVPS", "Base IVPS", "Bull IVPS", "Current Price"].forEach((h, i) => {
    const c = ws.getCell(`${col(i + 1)}${row}`);
    c.value = h;
    Object.assign(c, subheaderStyle());
  });
  ws.getRow(row).height = 18;
  row++;

  ws.getCell(`A${row}`).value = "Intrinsic Value per Share";
  Object.assign(ws.getCell(`A${row}`), labelStyle());
  [bearIVPS, baseIVPS, bullIVPS, currentPrice || 0].forEach((v, i) => {
    const cell = ws.getCell(`${col(i + 2)}${row}`);
    cell.value = v;
    Object.assign(cell, formulaStyle("#,##0.00"));
    if (i === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BEAR_BG } };
    if (i === 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SENSITIVITY_CENTER } };
      cell.font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };
    }
    if (i === 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BULL_BG } };
    if (i === 3) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
      cell.font = { bold: true, color: { argb: "FF9C0006" }, size: 10, name: "Calibri" };
    }
  });
}
