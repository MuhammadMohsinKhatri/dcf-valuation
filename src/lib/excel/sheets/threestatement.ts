import type ExcelJS from "exceljs";
import {
  headerStyle,
  subheaderStyle,
  labelStyle,
  formulaStyle,
  inputStyle,
  currencyFmt,
  BLACK_FORMULA,
  BLUE_INPUT,
} from "../styles";
import type { DCFModel } from "@/types/model";
import type { AssumptionCellMap } from "./assumptions";

// Builds IS, BS, CF on separate worksheets and returns projection column references for DCF sheet
export interface ProjectionCells {
  revenue: string[];       // Revenue row cells for years 1-5, e.g. ["IS!C20", ...]
  ebit: string[];
  nopat: string[];
  da: string[];
  capex: string[];
  deltaWC: string[];
  fcf: string[];           // Free Cash Flow cells
}

function colLetter(n: number): string {
  // n=1 → A, n=2 → B, ...
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function buildThreeStatementSheets(
  wb: ExcelJS.Workbook,
  model: DCFModel,
  amap: AssumptionCellMap
): ProjectionCells {
  const hist = model.historicalPeriods;
  const years = model.assumptions.projectionYears;
  const latestYear = hist[0]?.year ?? new Date().getFullYear() - 1;

  // Column layout: A=label, B...(B+hist-1)=historical, then proj years
  const histCols = hist.length; // e.g. 5
  const projStartCol = histCols + 2; // +1 for label col, +1 for 1-index

  function projCol(yr: number) {
    return colLetter(projStartCol + yr - 1);
  }
  function histCol(i: number) {
    // i=0 → most recent, histCols-1 → oldest. Display oldest left.
    return colLetter(histCols - i + 1);
  }

  // ─── INCOME STATEMENT ───────────────────────────────────────────────────────
  const is = wb.addWorksheet("Income Statement", {
    properties: { tabColor: { argb: "FF70AD47" } },
  });

  is.getColumn("A").width = 32;
  for (let c = 2; c <= histCols + years + 2; c++) {
    is.getColumn(c).width = 14;
  }

  // Title
  is.mergeCells(`A1:${colLetter(histCols + years + 1)}1`);
  const isTitle = is.getCell("A1");
  isTitle.value = `${model.companyName} — Income Statement ($${model.currency}M)`;
  Object.assign(isTitle, headerStyle());
  is.getRow(1).height = 22;

  // Year headers
  const hdr = is.getRow(2);
  hdr.getCell(1).value = "";
  // Historical headers
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    hdr.getCell(col).value = `FY${hist[i].year}A`;
    Object.assign(hdr.getCell(col), subheaderStyle());
  }
  // Projection headers
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    hdr.getCell(col).value = `FY${latestYear + yr}E`;
    Object.assign(hdr.getCell(col), subheaderStyle());
    hdr.getCell(col).font = { ...subheaderStyle().font, color: { argb: BLUE_INPUT } };
  }
  is.getRow(2).height = 18;

  let isRow = 3;

  // Revenue — historical inputs, projected formulas
  is.getCell(`A${isRow}`).value = "Revenue";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  is.getCell(`A${isRow}`).font = { ...labelStyle().font, bold: true };

  // Historical revenues (inputs)
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    const c = is.getCell(`${colLetter(col)}${isRow}`);
    c.value = hist[i].revenue / 1e6;
    Object.assign(c, inputStyle(currencyFmt(1)));
    c.note = { texts: [{ font: { size: 9 }, text: `Source: Company financial statements FY${hist[i].year}` }] };
  }

  // Projected revenues — each references prior year * (1 + growth rate)
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    const addr = `${colLetter(col)}${isRow}`;
    const prevAddr = yr === 1
      ? `${colLetter(histCols + 1)}${isRow}` // most recent historical
      : `${colLetter(col - 1)}${isRow}`;
    is.getCell(addr).value = {
      formula: `=${prevAddr}*(1+Assumptions!${amap.revenueGrowth(yr)})`,
    };
    Object.assign(is.getCell(addr), formulaStyle(currencyFmt(1)));
  }

  const revenueRow = isRow;
  isRow++;

  // COGS
  is.getCell(`A${isRow}`).value = "  Cost of Revenue";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    is.getCell(`${colLetter(col)}${isRow}`).value = hist[i].cogs / 1e6;
    Object.assign(is.getCell(`${colLetter(col)}${isRow}`), inputStyle(currencyFmt(1)));
  }
  // Projected COGS use gross margin implied by EBIT margin proxy (simplified: derive from EBIT margin)
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    const revAddr = `${colLetter(col)}${revenueRow}`;
    // Use last historical gross margin % as stable (could be enhanced)
    const lastGM = hist[0].grossProfit / hist[0].revenue;
    is.getCell(`${colLetter(col)}${isRow}`).value = {
      formula: `=${revAddr}*(1-${lastGM.toFixed(4)})`,
    };
    Object.assign(is.getCell(`${colLetter(col)}${isRow}`), formulaStyle(currencyFmt(1)));
  }
  const cogsRow = isRow++;

  // Gross Profit
  is.getCell(`A${isRow}`).value = "Gross Profit";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  is.getCell(`A${isRow}`).font = { ...labelStyle().font, bold: true };
  for (let c = 2; c <= histCols + years + 1; c++) {
    const addr = `${colLetter(c)}${isRow}`;
    is.getCell(addr).value = {
      formula: `=${colLetter(c)}${revenueRow}-${colLetter(c)}${cogsRow}`,
    };
    Object.assign(is.getCell(addr), formulaStyle(currencyFmt(1)));
  }
  const gpRow = isRow++;

  // OpEx
  is.getCell(`A${isRow}`).value = "  Operating Expenses";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    is.getCell(`${colLetter(col)}${isRow}`).value = hist[i].operatingExpenses / 1e6;
    Object.assign(is.getCell(`${colLetter(col)}${isRow}`), inputStyle(currencyFmt(1)));
  }
  // Projected OpEx = Revenue - (Revenue * EBIT margin) - COGS
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    const revAddr = `${colLetter(col)}${revenueRow}`;
    is.getCell(`${colLetter(col)}${isRow}`).value = {
      formula: `=${colLetter(col)}${gpRow}-${revAddr}*Assumptions!${amap.ebitMargin}`,
    };
    Object.assign(is.getCell(`${colLetter(col)}${isRow}`), formulaStyle(currencyFmt(1)));
  }
  const opexRow = isRow++;

  // EBIT
  is.getCell(`A${isRow}`).value = "EBIT";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  is.getCell(`A${isRow}`).font = { ...labelStyle().font, bold: true };
  for (let c = 2; c <= histCols + years + 1; c++) {
    is.getCell(`${colLetter(c)}${isRow}`).value = {
      formula: `=${colLetter(c)}${gpRow}-${colLetter(c)}${opexRow}`,
    };
    Object.assign(is.getCell(`${colLetter(c)}${isRow}`), formulaStyle(currencyFmt(1)));
  }
  const ebitRow = isRow++;

  // EBIT margin %
  is.getCell(`A${isRow}`).value = "  EBIT Margin %";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  for (let c = 2; c <= histCols + years + 1; c++) {
    is.getCell(`${colLetter(c)}${isRow}`).value = {
      formula: `=${colLetter(c)}${ebitRow}/${colLetter(c)}${revenueRow}`,
    };
    Object.assign(is.getCell(`${colLetter(c)}${isRow}`), formulaStyle("0.0%"));
  }
  isRow++;

  // EBITDA = EBIT + D&A
  is.getCell(`A${isRow}`).value = "EBITDA";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  is.getCell(`A${isRow}`).font = { ...labelStyle().font, bold: true };
  for (let c = 2; c <= histCols + years + 1; c++) {
    is.getCell(`${colLetter(c)}${isRow}`).value = {
      formula: `=${colLetter(c)}${ebitRow}+'Cash Flow'!${colLetter(c)}4`,
    };
    Object.assign(is.getCell(`${colLetter(c)}${isRow}`), formulaStyle(currencyFmt(1)));
    is.getCell(`${colLetter(c)}${isRow}`).font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };
  }
  const ebitdaRow = isRow++;

  // EBITDA Margin %
  is.getCell(`A${isRow}`).value = "  EBITDA Margin %";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  for (let c = 2; c <= histCols + years + 1; c++) {
    is.getCell(`${colLetter(c)}${isRow}`).value = {
      formula: `=${colLetter(c)}${ebitdaRow}/${colLetter(c)}${revenueRow}`,
    };
    Object.assign(is.getCell(`${colLetter(c)}${isRow}`), formulaStyle("0.0%"));
  }
  isRow++;

  // Net Income (simplified: EBIT - Interest - Tax)
  is.getCell(`A${isRow}`).value = "  Interest Expense";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    is.getCell(`${colLetter(col)}${isRow}`).value = hist[i].interestExpense / 1e6;
    Object.assign(is.getCell(`${colLetter(col)}${isRow}`), inputStyle(currencyFmt(1)));
  }
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    const histAvgInterest = hist.reduce((s, p) => s + p.interestExpense, 0) / hist.length / 1e6;
    is.getCell(`${colLetter(col)}${isRow}`).value = histAvgInterest;
    Object.assign(is.getCell(`${colLetter(col)}${isRow}`), inputStyle(currencyFmt(1)));
  }
  const intRow = isRow++;

  is.getCell(`A${isRow}`).value = "  Tax Expense";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  for (let c = 2; c <= histCols + years + 1; c++) {
    is.getCell(`${colLetter(c)}${isRow}`).value = {
      formula: `=MAX(0,(${colLetter(c)}${ebitRow}-${colLetter(c)}${intRow})*Assumptions!${amap.taxRate})`,
    };
    Object.assign(is.getCell(`${colLetter(c)}${isRow}`), formulaStyle(currencyFmt(1)));
  }
  const taxRow = isRow++;

  is.getCell(`A${isRow}`).value = "Net Income";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  is.getCell(`A${isRow}`).font = { ...labelStyle().font, bold: true };
  for (let c = 2; c <= histCols + years + 1; c++) {
    is.getCell(`${colLetter(c)}${isRow}`).value = {
      formula: `=${colLetter(c)}${ebitRow}-${colLetter(c)}${intRow}-${colLetter(c)}${taxRow}`,
    };
    Object.assign(is.getCell(`${colLetter(c)}${isRow}`), formulaStyle(currencyFmt(1)));
  }
  const netIncomeRow = isRow;
  isRow++;

  // EPS = Net Income / Shares Outstanding
  is.getCell(`A${isRow}`).value = "  EPS (Diluted)";
  Object.assign(is.getCell(`A${isRow}`), labelStyle());
  for (let c = 2; c <= histCols + years + 1; c++) {
    is.getCell(`${colLetter(c)}${isRow}`).value = {
      formula: `=${colLetter(c)}${netIncomeRow}/Assumptions!${amap.sharesOut}`,
    };
    Object.assign(is.getCell(`${colLetter(c)}${isRow}`), formulaStyle("#,##0.00"));
  }
  isRow++;

  // ─── CASH FLOW STATEMENT ────────────────────────────────────────────────────
  const cf = wb.addWorksheet("Cash Flow", {
    properties: { tabColor: { argb: "FFED7D31" } },
  });
  cf.getColumn("A").width = 32;
  for (let c = 2; c <= histCols + years + 2; c++) cf.getColumn(c).width = 14;

  cf.mergeCells(`A1:${colLetter(histCols + years + 1)}1`);
  const cfTitle = cf.getCell("A1");
  cfTitle.value = `${model.companyName} — Cash Flow Statement ($${model.currency}M)`;
  Object.assign(cfTitle, headerStyle());
  cf.getRow(1).height = 22;

  // Copy year headers
  const cfHdr = cf.getRow(2);
  for (let i = hist.length - 1; i >= 0; i--) {
    cfHdr.getCell(histCols - i + 1).value = `FY${hist[i].year}A`;
    Object.assign(cfHdr.getCell(histCols - i + 1), subheaderStyle());
  }
  for (let yr = 1; yr <= years; yr++) {
    cfHdr.getCell(projStartCol + yr - 1).value = `FY${latestYear + yr}E`;
    Object.assign(cfHdr.getCell(projStartCol + yr - 1), subheaderStyle());
  }
  cf.getRow(2).height = 18;

  let cfRow = 3;

  // NOPAT = EBIT * (1 - tax rate)
  cf.getCell(`A${cfRow}`).value = "NOPAT (EBIT × (1 - Tax Rate))";
  Object.assign(cf.getCell(`A${cfRow}`), labelStyle());
  cf.getCell(`A${cfRow}`).font = { ...labelStyle().font, bold: true };
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = {
      formula: `='Income Statement'!${colLetter(col)}${ebitRow}*(1-Assumptions!${amap.taxRate})`,
    };
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), formulaStyle(currencyFmt(1)));
  }
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = {
      formula: `='Income Statement'!${colLetter(col)}${ebitRow}*(1-Assumptions!${amap.taxRate})`,
    };
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), formulaStyle(currencyFmt(1)));
  }
  const nopatRow = cfRow++;

  // D&A
  cf.getCell(`A${cfRow}`).value = "  + Depreciation & Amortization";
  Object.assign(cf.getCell(`A${cfRow}`), labelStyle());
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = hist[i].depreciationAmortization / 1e6;
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), inputStyle(currencyFmt(1)));
  }
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = {
      formula: `='Income Statement'!${colLetter(col)}${revenueRow}*Assumptions!${amap.depPct}`,
    };
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), formulaStyle(currencyFmt(1)));
  }
  const daRow = cfRow++;

  // Capex
  cf.getCell(`A${cfRow}`).value = "  - Capital Expenditures";
  Object.assign(cf.getCell(`A${cfRow}`), labelStyle());
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = Math.abs(hist[i].capex) / 1e6;
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), inputStyle(currencyFmt(1)));
  }
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = {
      formula: `='Income Statement'!${colLetter(col)}${revenueRow}*Assumptions!${amap.capexPct}`,
    };
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), formulaStyle(currencyFmt(1)));
  }
  const capexRow = cfRow++;

  // Δ NWC
  cf.getCell(`A${cfRow}`).value = "  - Change in Net Working Capital";
  Object.assign(cf.getCell(`A${cfRow}`), labelStyle());
  for (let i = hist.length - 1; i >= 0; i--) {
    const col = histCols - i + 1;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = hist[i].changeInWorkingCapital / 1e6;
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), inputStyle(currencyFmt(1)));
  }
  for (let yr = 1; yr <= years; yr++) {
    const col = projStartCol + yr - 1;
    const prevRevAddr = yr === 1
      ? `'Income Statement'!${colLetter(projStartCol - 1)}${revenueRow}`
      : `'Income Statement'!${colLetter(projStartCol + yr - 2)}${revenueRow}`;
    cf.getCell(`${colLetter(col)}${cfRow}`).value = {
      formula: `=('Income Statement'!${colLetter(col)}${revenueRow}-${prevRevAddr})*Assumptions!${amap.nwcPct}`,
    };
    Object.assign(cf.getCell(`${colLetter(col)}${cfRow}`), formulaStyle(currencyFmt(1)));
  }
  const nwcRow = cfRow++;

  // FCF
  cf.getCell(`A${cfRow}`).value = "Free Cash Flow to Firm (FCFF)";
  Object.assign(cf.getCell(`A${cfRow}`), labelStyle());
  cf.getCell(`A${cfRow}`).font = { ...labelStyle().font, bold: true };
  for (let c = 2; c <= histCols + years + 1; c++) {
    cf.getCell(`${colLetter(c)}${cfRow}`).value = {
      formula: `=${colLetter(c)}${nopatRow}+${colLetter(c)}${daRow}-${colLetter(c)}${capexRow}-${colLetter(c)}${nwcRow}`,
    };
    Object.assign(cf.getCell(`${colLetter(c)}${cfRow}`), formulaStyle(currencyFmt(1)));
    cf.getCell(`${colLetter(c)}${cfRow}`).font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };
  }
  const fcfRow = cfRow++;

  // ─── BALANCE SHEET ──────────────────────────────────────────────────────────
  const bs = wb.addWorksheet("Balance Sheet", {
    properties: { tabColor: { argb: "FF4472C4" } },
  });
  bs.getColumn("A").width = 32;
  for (let c = 2; c <= histCols + years + 2; c++) bs.getColumn(c).width = 14;

  bs.mergeCells(`A1:${colLetter(histCols + years + 1)}1`);
  const bsTitle = bs.getCell("A1");
  bsTitle.value = `${model.companyName} — Balance Sheet ($${model.currency}M)`;
  Object.assign(bsTitle, headerStyle());
  bs.getRow(1).height = 22;

  // Year headers
  const bsHdr = bs.getRow(2);
  for (let i = hist.length - 1; i >= 0; i--) {
    bsHdr.getCell(histCols - i + 1).value = `FY${hist[i].year}A`;
    Object.assign(bsHdr.getCell(histCols - i + 1), subheaderStyle());
  }
  for (let yr = 1; yr <= years; yr++) {
    bsHdr.getCell(projStartCol + yr - 1).value = `FY${latestYear + yr}E`;
    Object.assign(bsHdr.getCell(projStartCol + yr - 1), subheaderStyle());
  }
  bs.getRow(2).height = 18;

  let bsRow = 3;

  function bsSection(title: string, argb: string) {
    bs.mergeCells(`A${bsRow}:${colLetter(histCols + years + 1)}${bsRow}`);
    const c = bs.getCell(`A${bsRow}`);
    c.value = title;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb } };
    bsRow++;
  }

  function bsLine(
    label: string,
    getValue: (p: typeof hist[0]) => number,
    bold = false,
    whiteText = false
  ) {
    bs.getCell(`A${bsRow}`).value = bold ? label : `  ${label}`;
    Object.assign(bs.getCell(`A${bsRow}`), labelStyle());
    if (bold) bs.getCell(`A${bsRow}`).font = { ...labelStyle().font, bold: true };
    if (whiteText) {
      bs.getCell(`A${bsRow}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
      bs.getCell(`A${bsRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    }

    // Historical columns
    for (let i = hist.length - 1; i >= 0; i--) {
      const col = histCols - i + 1;
      const cell = bs.getCell(`${colLetter(col)}${bsRow}`);
      cell.value = getValue(hist[i]) / 1e6;
      Object.assign(cell, formulaStyle(currencyFmt(1)));
      if (bold) cell.font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };
      if (whiteText) {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
      }
    }

    // Projected columns — empty (balance sheet not projected)
    for (let yr = 1; yr <= years; yr++) {
      const col = projStartCol + yr - 1;
      const cell = bs.getCell(`${colLetter(col)}${bsRow}`);
      cell.value = "—";
      Object.assign(cell, labelStyle());
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }

    bsRow++;
  }

  // ASSETS
  bsSection("ASSETS", "FF375623");
  bsLine("Cash & Equivalents", (p) => p.cash);
  bsLine("Accounts Receivable", (p) => p.accountsReceivable);
  bsLine("Inventory", (p) => p.inventory);
  bsLine("Total Current Assets", (p) => p.totalCurrentAssets, true);
  bsLine("PP&E (Net)", (p) => p.ppe);
  bsLine("Total Assets", (p) => p.totalAssets, true);

  // LIABILITIES
  bsSection("LIABILITIES", "FFC00000");
  bsLine("Accounts Payable", (p) => p.accountsPayable);
  bsLine("Short-Term Debt", (p) => p.shortTermDebt);
  bsLine("Total Current Liabilities", (p) => p.totalCurrentLiabilities, true);
  bsLine("Long-Term Debt", (p) => p.longTermDebt);
  bsLine("Total Liabilities", (p) => p.totalLiabilities, true);

  // EQUITY
  bsSection("EQUITY", "FF1F3864");
  bsLine("Total Shareholders' Equity", (p) => p.equity, true, true);

  // Build return value — projection-year cross-sheet references
  const projFcfCells = Array.from({ length: years }, (_, i) =>
    `'Cash Flow'!${colLetter(projStartCol + i)}${fcfRow}`
  );
  const projRevCells = Array.from({ length: years }, (_, i) =>
    `'Income Statement'!${colLetter(projStartCol + i)}${revenueRow}`
  );
  const projEbitCells = Array.from({ length: years }, (_, i) =>
    `'Income Statement'!${colLetter(projStartCol + i)}${ebitRow}`
  );
  const projNopat = Array.from({ length: years }, (_, i) =>
    `'Cash Flow'!${colLetter(projStartCol + i)}${nopatRow}`
  );
  const projDa = Array.from({ length: years }, (_, i) =>
    `'Cash Flow'!${colLetter(projStartCol + i)}${daRow}`
  );
  const projCapex = Array.from({ length: years }, (_, i) =>
    `'Cash Flow'!${colLetter(projStartCol + i)}${capexRow}`
  );
  const projDeltaWC = Array.from({ length: years }, (_, i) =>
    `'Cash Flow'!${colLetter(projStartCol + i)}${nwcRow}`
  );

  return {
    revenue: projRevCells,
    ebit: projEbitCells,
    nopat: projNopat,
    da: projDa,
    capex: projCapex,
    deltaWC: projDeltaWC,
    fcf: projFcfCells,
  };
}
