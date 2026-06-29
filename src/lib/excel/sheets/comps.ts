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
import { generateFootballFieldPNG } from "../pngChart";

function col(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function mergeStyle(ws: ExcelJS.Worksheet, addr: string, value: string, bgArgb: string, fgArgb = "FFFFFFFF", fontSize = 10) {
  const c = ws.getCell(addr);
  c.value = value;
  c.font = { bold: true, color: { argb: fgArgb }, size: fontSize, name: "Calibri" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
  c.alignment = { horizontal: "left", vertical: "middle" };
}

export function buildCompsSheet(
  wb: ExcelJS.Workbook,
  model: DCFModel,
  bearIVPS: number,
  baseIVPS: number,
  bullIVPS: number
) {
  const ws = wb.addWorksheet("Comps & Football Field", {
    properties: { tabColor: { argb: "FFED7D31" } },
  });

  // Column widths — A=label, B=Bear, C=Base, D=Bull, E=market, F-Z=football field
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;
  // Football field columns: 40 narrow columns
  for (let c = 6; c <= 46; c++) ws.getColumn(c).width = 1.8;

  const hist = model.historicalPeriods;
  const latest = hist[0];
  const a = model.assumptions;
  const currentPrice = model.currentPrice ?? 0;
  const shares = a.sharesOutstanding;

  const latestDA = latest.depreciationAmortization / 1e6;
  const latestEBIT = latest.ebit / 1e6;
  const latestEBITDA = latestEBIT + latestDA;
  const latestRev = latest.revenue / 1e6;
  const latestNI = latest.netIncome / 1e6;
  const latestFCF = (latest.freeCashFlow ?? 0) / 1e6;

  function scenarioEV(ivps: number): number {
    return ivps * shares + a.netDebt + a.minorityInterest;
  }

  const bearEV = scenarioEV(bearIVPS);
  const baseEV = scenarioEV(baseIVPS);
  const bullEV = scenarioEV(bullIVPS);
  const safe = (n: number, d: number) => (d !== 0 ? n / d : 0);

  let row = 1;

  // ── TITLE ──────────────────────────────────────────────────────────────────
  ws.mergeCells(`A${row}:E${row}`);
  mergeStyle(ws, `A${row}`, `${model.companyName} (${model.ticker}) — Valuation Summary & Football Field`, HEADER_BG, "FFFFFFFF", 13);
  ws.getRow(row).height = 26;
  row++;

  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value = `Confidential — Internal Use Only  |  $ in millions, per share data as shown  |  Base Year: FY${latest.year}A`;
  ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: "FF808080" }, name: "Calibri" };
  ws.getRow(row).height = 14;
  row += 2;

  // ── SECTION 1: DCF VALUATION SUMMARY ──────────────────────────────────────
  ws.mergeCells(`A${row}:E${row}`);
  mergeStyle(ws, `A${row}`, "DCF Valuation Summary", HEADER_BG);
  ws.getRow(row).height = 20;
  row++;

  const dcfHdr = ws.getRow(row);
  ["Metric", "Bear Case", "Base Case", "Bull Case", "Current Price"].forEach((h, i) => {
    const c = dcfHdr.getCell(i + 1);
    c.value = h;
    Object.assign(c, subheaderStyle());
    if (i === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD7D7" } };
    if (i === 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SENSITIVITY_CENTER } };
    if (i === 3) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  });
  ws.getRow(row).height = 18;
  row++;

  function valRow(label: string, bear: number, base: number, bull: number, mkt: number | string, fmt = "#,##0.00", bold = false) {
    ws.getCell(`A${row}`).value = label;
    Object.assign(ws.getCell(`A${row}`), labelStyle());
    if (bold) ws.getCell(`A${row}`).font = { bold: true, size: 10, name: "Calibri", color: { argb: BLACK_FORMULA } };
    [[bear, "FFFFD7D7"], [base, SENSITIVITY_CENTER], [bull, "FFE2EFDA"]].forEach(([v, bg], i) => {
      const cell = ws.getCell(`${col(i + 2)}${row}`);
      cell.value = typeof v === "number" ? v : 0;
      Object.assign(cell, formulaStyle(fmt));
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg as string } };
      if (bold) cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: BLACK_FORMULA } };
    });
    const mktCell = ws.getCell(`E${row}`);
    mktCell.value = typeof mkt === "number" ? mkt : mkt;
    if (typeof mkt === "number") Object.assign(mktCell, formulaStyle(fmt));
    else Object.assign(mktCell, labelStyle());
    row++;
  }

  valRow("Intrinsic Value per Share ($)", bearIVPS, baseIVPS, bullIVPS, currentPrice > 0 ? currentPrice : "—", "#,##0.00", true);
  if (currentPrice > 0) {
    valRow("Upside / (Downside) to Market",
      (bearIVPS - currentPrice) / currentPrice,
      (baseIVPS - currentPrice) / currentPrice,
      (bullIVPS - currentPrice) / currentPrice,
      0, "0.0%");
  }
  valRow("Enterprise Value ($M)", bearEV, baseEV, bullEV, "—", currencyFmt(0));
  valRow("Equity Value ($M)", bearIVPS * shares, baseIVPS * shares, bullIVPS * shares, "—", currencyFmt(0));
  row++;

  // ── SECTION 2: IMPLIED TRADING MULTIPLES ──────────────────────────────────
  ws.mergeCells(`A${row}:E${row}`);
  mergeStyle(ws, `A${row}`, `Implied Trading Multiples — Trailing Twelve Months (FY${latest.year}A)`, HEADER_BG);
  ws.getRow(row).height = 20;
  row++;

  const mHdr = ws.getRow(row);
  ["Multiple", "Bear Case", "Base Case", "Bull Case", "Latest Metric ($M)"].forEach((h, i) => {
    const c = mHdr.getCell(i + 1);
    c.value = h;
    Object.assign(c, subheaderStyle());
    if (i === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD7D7" } };
    if (i === 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SENSITIVITY_CENTER } };
    if (i === 3) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  });
  ws.getRow(row).height = 18;
  row++;

  function multRow(label: string, bear: number, base: number, bull: number, metric: number, metricFmt = currencyFmt(1)) {
    ws.getCell(`A${row}`).value = label;
    Object.assign(ws.getCell(`A${row}`), labelStyle());
    [[bear, "FFFFD7D7"], [base, SENSITIVITY_CENTER], [bull, "FFE2EFDA"]].forEach(([v, bg], i) => {
      const cell = ws.getCell(`${col(i + 2)}${row}`);
      cell.value = isFinite(v as number) && !isNaN(v as number) ? v : 0;
      Object.assign(cell, formulaStyle("0.0x"));
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg as string } };
    });
    const mCell = ws.getCell(`E${row}`);
    mCell.value = metric;
    Object.assign(mCell, formulaStyle(metricFmt));
    row++;
  }

  multRow("EV / Revenue (LTM)", safe(bearEV, latestRev), safe(baseEV, latestRev), safe(bullEV, latestRev), latestRev);
  multRow("EV / EBITDA (LTM)", safe(bearEV, latestEBITDA), safe(baseEV, latestEBITDA), safe(bullEV, latestEBITDA), latestEBITDA);
  multRow("EV / EBIT (LTM)", safe(bearEV, latestEBIT), safe(baseEV, latestEBIT), safe(bullEV, latestEBIT), latestEBIT);
  multRow("Price / Earnings (P/E)", safe(bearIVPS, safe(latestNI, shares)), safe(baseIVPS, safe(latestNI, shares)), safe(bullIVPS, safe(latestNI, shares)), latestNI);
  multRow("Price / FCF", safe(bearIVPS, safe(latestFCF, shares)), safe(baseIVPS, safe(latestFCF, shares)), safe(bullIVPS, safe(latestFCF, shares)), latestFCF);
  row += 2;

  // ── SECTION 3: FOOTBALL FIELD CHART (cell-based, GS style) ────────────────
  ws.mergeCells(`A${row}:AV${row}`);
  mergeStyle(ws, `A${row}`, `Valuation Football Field — ${model.ticker} (Intrinsic Value per Share, $)`, HEADER_BG);
  ws.getRow(row).height = 22;
  row++;

  // Sub-header explaining chart
  ws.mergeCells(`A${row}:AV${row}`);
  ws.getCell(`A${row}`).value = "Each bar shows the Bear–Base–Bull valuation range. Red line = current market price.";
  ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: "FF606060" }, name: "Calibri" };
  ws.getRow(row).height = 14;
  row++;

  // Football field parameters
  const allValues = [bearIVPS, baseIVPS, bullIVPS, currentPrice].filter(v => v > 0);
  const minVal = Math.min(...allValues) * 0.85;
  const maxVal = Math.max(...allValues) * 1.15;
  const CHART_COLS = 40; // columns 6..45
  const CHART_START_COL = 6;

  function valueToCol(v: number): number {
    return CHART_START_COL + Math.round(((v - minVal) / (maxVal - minVal)) * (CHART_COLS - 1));
  }

  // X-axis labels row
  ws.getRow(row).height = 16;
  const xAxisRow = row;
  // Place 5 scale labels across the chart
  for (let i = 0; i <= 4; i++) {
    const v = minVal + (i / 4) * (maxVal - minVal);
    const c = CHART_START_COL + Math.round((i / 4) * (CHART_COLS - 1));
    const cell = ws.getCell(`${col(c)}${xAxisRow}`);
    cell.value = Math.round(v * 100) / 100;
    cell.numFmt = "$#,##0.00";
    cell.font = { size: 8, name: "Calibri", color: { argb: "FF404040" } };
    cell.alignment = { horizontal: "center" };
  }
  row++;

  // Helper to draw a football field bar row
  function drawBar(
    label: string,
    lowVal: number,
    midVal: number,
    highVal: number,
    barColor: string,
    midColor: string,
    rowLabel: string
  ) {
    ws.getRow(row).height = 22;

    // Label column
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold: true, size: 10, name: "Calibri", color: { argb: BLACK_FORMULA } };
    ws.getCell(`A${row}`).alignment = { horizontal: "right", vertical: "middle" };

    // Value labels B-E
    ws.getCell(`B${row}`).value = lowVal;
    ws.getCell(`B${row}`).numFmt = "$#,##0.00";
    ws.getCell(`B${row}`).font = { size: 9, name: "Calibri", color: { argb: "FFCC0000" } };
    ws.getCell(`B${row}`).alignment = { horizontal: "center", vertical: "middle" };

    ws.getCell(`C${row}`).value = midVal;
    ws.getCell(`C${row}`).numFmt = "$#,##0.00";
    ws.getCell(`C${row}`).font = { bold: true, size: 9, name: "Calibri", color: { argb: "FF1F3864" } };
    ws.getCell(`C${row}`).alignment = { horizontal: "center", vertical: "middle" };

    ws.getCell(`D${row}`).value = highVal;
    ws.getCell(`D${row}`).numFmt = "$#,##0.00";
    ws.getCell(`D${row}`).font = { size: 9, name: "Calibri", color: { argb: "FF00703C" } };
    ws.getCell(`D${row}`).alignment = { horizontal: "center", vertical: "middle" };

    ws.getCell(`E${row}`).value = rowLabel;
    ws.getCell(`E${row}`).font = { size: 8, italic: true, name: "Calibri", color: { argb: "FF808080" } };
    ws.getCell(`E${row}`).alignment = { vertical: "middle" };

    const lowCol = valueToCol(lowVal);
    const midCol = valueToCol(midVal);
    const highCol = valueToCol(highVal);

    // Fill background (light gray for entire chart area)
    for (let c = CHART_START_COL; c < CHART_START_COL + CHART_COLS; c++) {
      ws.getCell(`${col(c)}${row}`).fill = {
        type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" }
      };
    }

    // Fill the range bar (bear to bull)
    for (let c = lowCol; c <= highCol; c++) {
      ws.getCell(`${col(c)}${row}`).fill = {
        type: "pattern", pattern: "solid", fgColor: { argb: barColor }
      };
    }

    // Highlight the base/mid value cell
    if (midCol >= CHART_START_COL && midCol < CHART_START_COL + CHART_COLS) {
      ws.getCell(`${col(midCol)}${row}`).fill = {
        type: "pattern", pattern: "solid", fgColor: { argb: midColor }
      };
      // Add base value as note on mid cell
      ws.getCell(`${col(midCol)}${row}`).value = "◆";
      ws.getCell(`${col(midCol)}${row}`).font = { bold: true, size: 9, color: { argb: "FF1F3864" }, name: "Calibri" };
      ws.getCell(`${col(midCol)}${row}`).alignment = { horizontal: "center", vertical: "middle" };
    }

    // Draw current price line (red vertical marker)
    if (currentPrice > 0) {
      const priceCol = valueToCol(currentPrice);
      if (priceCol >= CHART_START_COL && priceCol < CHART_START_COL + CHART_COLS) {
        const priceCell = ws.getCell(`${col(priceCol)}${row}`);
        priceCell.border = {
          left: { style: "medium", color: { argb: "FFFF0000" } },
          right: { style: "medium", color: { argb: "FFFF0000" } },
        };
      }
    }

    row++;
  }

  // Draw spacer row
  function spacerRow() {
    ws.getRow(row).height = 6;
    row++;
  }

  // Draw football field bars
  drawBar(
    "DCF — Bear Case",
    bearIVPS * 0.95, bearIVPS, bearIVPS * 1.05,
    "FFFFC7CE", "FFFF6B6B",
    `Bear: $${bearIVPS.toFixed(2)}`
  );
  spacerRow();

  drawBar(
    "DCF — Base Case",
    baseIVPS * 0.97, baseIVPS, baseIVPS * 1.03,
    "FFFFEB9C", SENSITIVITY_CENTER,
    `Base: $${baseIVPS.toFixed(2)}`
  );
  spacerRow();

  drawBar(
    "DCF — Bull Case",
    bullIVPS * 0.95, bullIVPS, bullIVPS * 1.05,
    "FFC6EFCE", "FF00B050",
    `Bull: $${bullIVPS.toFixed(2)}`
  );
  spacerRow();

  // Combined range bar (Bear low → Bull high)
  drawBar(
    "Full DCF Range",
    bearIVPS, baseIVPS, bullIVPS,
    "FFD9E1F2", "FF4472C4",
    `Range: $${bearIVPS.toFixed(2)}–$${bullIVPS.toFixed(2)}`
  );

  // Current price marker row
  if (currentPrice > 0) {
    spacerRow();
    ws.getRow(row).height = 18;
    ws.getCell(`A${row}`).value = "Current Market Price";
    ws.getCell(`A${row}`).font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF9C0006" } };
    ws.getCell(`A${row}`).alignment = { horizontal: "right", vertical: "middle" };
    ws.getCell(`B${row}`).value = currentPrice;
    ws.getCell(`B${row}`).numFmt = "$#,##0.00";
    ws.getCell(`B${row}`).font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF9C0006" } };
    ws.getCell(`B${row}`).alignment = { horizontal: "center", vertical: "middle" };

    // Red price line across entire chart
    for (let c = CHART_START_COL; c < CHART_START_COL + CHART_COLS; c++) {
      ws.getCell(`${col(c)}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
    }
    const priceCol = valueToCol(currentPrice);
    if (priceCol >= CHART_START_COL && priceCol < CHART_START_COL + CHART_COLS) {
      ws.getCell(`${col(priceCol)}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
      ws.getCell(`${col(priceCol)}${row}`).value = "▼";
      ws.getCell(`${col(priceCol)}${row}`).font = { bold: true, size: 9, color: { argb: "FFFFFFFF" }, name: "Calibri" };
      ws.getCell(`${col(priceCol)}${row}`).alignment = { horizontal: "center", vertical: "middle" };
    }
    row++;
  }

  row += 2;

  // ── LEGEND ─────────────────────────────────────────────────────────────────
  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value = "Chart Legend";
  ws.getCell(`A${row}`).font = { bold: true, size: 9, name: "Calibri", color: { argb: BLACK_FORMULA } };
  row++;

  const legendItems = [
    ["FFC7CE", "Bear Case range"],
    ["FFEB9C", "Base Case range"],
    ["C6EFCE", "Bull Case range"],
    ["4472C4", "Full valuation range (◆ = Base)"],
    ["FF0000", "Current market price (▼)"],
  ];

  legendItems.forEach(([color, label]) => {
    const cell = ws.getCell(`A${row}`);
    cell.value = `  ■  ${label}`;
    cell.font = { size: 9, name: "Calibri", color: { argb: "FF" + color } };
    row++;
  });

  row += 2;
  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value =
    `Source: BOE Group DCF Model. Note: Football field shows per-share intrinsic value ranges derived from DCF analysis. ` +
    `Bear/Base/Bull reflect scenario assumptions. Current price as of model date. For internal use only.`;
  ws.getCell(`A${row}`).font = { italic: true, size: 8, color: { argb: "FF808080" }, name: "Calibri" };
  ws.getCell(`A${row}`).alignment = { wrapText: true };
  ws.getRow(row).height = 28;
  row += 3;

  // ── SECTION 4: EMBEDDED PNG FOOTBALL FIELD CHART ──────────────────────────
  ws.mergeCells(`A${row}:AV${row}`);
  mergeStyle(ws, `A${row}`, "Valuation Football Field — Embedded Chart (Bear / Base / Bull IVPS)", HEADER_BG);
  ws.getRow(row).height = 22;
  row++;

  try {
    const chartBuf = generateFootballFieldPNG(
      [
        { label: "Bear Case", lo: bearIVPS * 0.95, mid: bearIVPS, hi: bearIVPS * 1.05, r: 192, g: 80, b: 77 },
        { label: "Base Case", lo: baseIVPS * 0.97, mid: baseIVPS, hi: baseIVPS * 1.03, r: 68, g: 114, b: 196 },
        { label: "Bull Case", lo: bullIVPS * 0.95, mid: bullIVPS, hi: bullIVPS * 1.05, r: 112, g: 173, b: 71 },
      ],
      currentPrice
    );
    const imageId = wb.addImage({ buffer: chartBuf, extension: "png" });
    const imgH = 40 + 3 * (30 + 18) + 46; // matches PNG height
    ws.addImage(imageId, {
      tl: { col: 0, row: row - 1 },
      ext: { width: 780, height: imgH },
    });
    // Reserve rows for the image
    for (let r = 0; r < 18; r++) {
      ws.getRow(row + r).height = 16;
    }
    row += 18;
  } catch {
    ws.getCell(`A${row}`).value = "Chart image generation failed — see cell-based chart above.";
    ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: "FFCC0000" }, name: "Calibri" };
    row++;
  }
}
