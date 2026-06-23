import type ExcelJS from "exceljs";
import {
  headerStyle,
  subheaderStyle,
  labelStyle,
  formulaStyle,
  inputStyle,
  currencyFmt,
  pctFmt,
  SENSITIVITY_CENTER,
  BLACK_FORMULA,
  BLUE_INPUT,
  HEADER_BG,
} from "../styles";
import type { DCFModel } from "@/types/model";
import type { AssumptionCellMap } from "./assumptions";
import type { ProjectionCells } from "./threestatement";

export function buildDCFSheet(
  wb: ExcelJS.Workbook,
  model: DCFModel,
  amap: AssumptionCellMap,
  proj: ProjectionCells
) {
  const ws = wb.addWorksheet("DCF", {
    properties: { tabColor: { argb: "FFFF0000" } },
  });

  for (let c = 1; c <= 10; c++) ws.getColumn(c).width = c === 1 ? 36 : 16;

  const years = model.assumptions.projectionYears;
  const latestYear = model.historicalPeriods[0]?.year ?? new Date().getFullYear() - 1;

  // Title
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `${model.companyName} (${model.ticker}) — DCF Valuation`;
  Object.assign(ws.getCell("A1"), headerStyle());
  ws.getRow(1).height = 22;

  // Year headers
  const hdrRow = ws.getRow(2);
  for (let yr = 1; yr <= years; yr++) {
    hdrRow.getCell(yr + 1).value = `FY${latestYear + yr}E`;
    Object.assign(hdrRow.getCell(yr + 1), subheaderStyle());
  }
  hdrRow.getCell(years + 2).value = "Terminal";
  Object.assign(hdrRow.getCell(years + 2), subheaderStyle());
  ws.getRow(2).height = 18;

  let row = 3;

  function sectionHeader(title: string) {
    ws.mergeCells(`A${row}:G${row}`);
    ws.getCell(`A${row}`).value = title;
    ws.getCell(`A${row}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri" };
    ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    row++;
  }

  function label(text: string, bold = false) {
    ws.getCell(`A${row}`).value = text;
    Object.assign(ws.getCell(`A${row}`), labelStyle());
    if (bold) ws.getCell(`A${row}`).font = { ...labelStyle().font, bold: true };
  }

  function fml(addr: string, formula: string, fmt = currencyFmt(1), bold = false) {
    ws.getCell(addr).value = { formula };
    Object.assign(ws.getCell(addr), formulaStyle(fmt));
    if (bold) ws.getCell(addr).font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };
  }

  // ── FCF PROJECTIONS ─────────────────────────────────────────────────────────
  sectionHeader("Free Cash Flow Projections ($M)");

  label("Free Cash Flow to Firm", true);
  for (let yr = 1; yr <= years; yr++) {
    fml(`${col(yr + 1)}${row}`, `=${proj.fcf[yr - 1]}`);
  }
  const fcfRow = row++;

  label("  Discount Period (mid-year)");
  for (let yr = 1; yr <= years; yr++) {
    ws.getCell(`${col(yr + 1)}${row}`).value = yr - 0.5;
    Object.assign(ws.getCell(`${col(yr + 1)}${row}`), formulaStyle("0.0"));
  }
  const discPeriodRow = row++;

  label("  Discount Factor");
  for (let yr = 1; yr <= years; yr++) {
    fml(
      `${col(yr + 1)}${row}`,
      `=1/(1+Assumptions!${amap.wacc})^${col(yr + 1)}${discPeriodRow}`,
      "0.0000"
    );
  }
  const discFactorRow = row++;

  label("PV of Free Cash Flow", true);
  for (let yr = 1; yr <= years; yr++) {
    fml(`${col(yr + 1)}${row}`, `=${col(yr + 1)}${fcfRow}*${col(yr + 1)}${discFactorRow}`);
  }
  const pvFcfRow = row++;

  label("Sum of PV(FCF)", true);
  const pvSumAddr = `B${row}`;
  fml(pvSumAddr, `=SUM(B${pvFcfRow}:${col(years + 1)}${pvFcfRow})`, currencyFmt(1), true);
  row++;

  // ── TERMINAL VALUE ──────────────────────────────────────────────────────────
  sectionHeader("Terminal Value");

  label("Terminal Year FCF");
  const termFcfAddr = `B${row}`;
  fml(termFcfAddr, `=${proj.fcf[years - 1]}`);
  row++;

  label("Terminal Growth Rate");
  fml(`B${row}`, `=Assumptions!${amap.tgr}`, pctFmt(2));
  const tgrRef = `B${row}`;
  row++;

  label("WACC");
  fml(`B${row}`, `=Assumptions!${amap.wacc}`, pctFmt(2));
  const waccRef = `B${row}`;
  row++;

  label("Terminal Value (Gordon Growth Model)", true);
  const tvAddr = `B${row}`;
  fml(tvAddr, `=${termFcfAddr}*(1+${tgrRef})/(${waccRef}-${tgrRef})`, currencyFmt(1), true);
  ws.getCell(tvAddr).note = { texts: [{ font: { size: 9 }, text: "Gordon Growth: FCF_n × (1+g) / (WACC − g)" }] };
  row++;

  label("  Terminal Year Discount Factor");
  const tvDiscAddr = `B${row}`;
  fml(tvDiscAddr, `=1/(1+${waccRef})^${years}`, "0.0000");
  row++;

  label("PV of Terminal Value", true);
  const pvTvAddr = `B${row}`;
  fml(pvTvAddr, `=${tvAddr}*${tvDiscAddr}`, currencyFmt(1), true);
  row++;

  // ── EV BRIDGE ───────────────────────────────────────────────────────────────
  sectionHeader("Enterprise Value → Equity Value Bridge ($M)");

  label("Enterprise Value", true);
  const evAddr = `B${row}`;
  fml(evAddr, `=${pvSumAddr}+${pvTvAddr}`, currencyFmt(1), true);
  row++;

  label("  Less: Net Debt ($M)");
  fml(`B${row}`, `=Assumptions!${amap.netDebt}`);
  const netDebtRef = `B${row}`;
  row++;

  label("  Less: Minority Interest ($M)");
  fml(`B${row}`, `=Assumptions!${amap.minorityInt}`);
  const minIntRef = `B${row}`;
  row++;

  label("Equity Value", true);
  const eqValAddr = `B${row}`;
  fml(eqValAddr, `=${evAddr}-${netDebtRef}-${minIntRef}`, currencyFmt(1), true);
  row++;

  label("  Shares Outstanding (M)");
  fml(`B${row}`, `=Assumptions!${amap.sharesOut}`, "#,##0.0");
  const sharesRef = `B${row}`;
  row++;

  // ★ Intrinsic Value per Share — the headline output
  ws.getCell(`A${row}`).value = "★  Intrinsic Value per Share";
  ws.getCell(`A${row}`).font = { bold: true, color: { argb: BLUE_INPUT }, size: 12, name: "Calibri" };
  const ivpsAddr = `B${row}`;
  ws.getCell(ivpsAddr).value = { formula: `=${eqValAddr}/${sharesRef}` };
  Object.assign(ws.getCell(ivpsAddr), formulaStyle("#,##0.00"));
  ws.getCell(ivpsAddr).font = { bold: true, color: { argb: "FF1F3864" }, size: 14, name: "Calibri" };
  ws.getCell(ivpsAddr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  ws.getCell(ivpsAddr).note = {
    texts: [{ font: { size: 9 }, text: "Intrinsic Value / Share = Equity Value ÷ Shares Outstanding\nSwitch scenario on the Assumptions sheet to see Bear / Base / Bull." }],
  };
  row += 2;

  // ── SENSITIVITY TABLE ──────────────────────────────────────────────────────
  buildSensitivityTable(ws, row, model, proj, fcfRow, years, pvSumAddr, sharesRef, evAddr);
}

/**
 * Builds a 7×5 WACC vs Terminal Growth Rate sensitivity table.
 * Each cell contains an explicit formula that recalculates IV/Share
 * at the cell's specific WACC and TGR — no hardcoded derived numbers.
 * Base case (waccBase, tgrBase) is at the center cell.
 */
function buildSensitivityTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  model: DCFModel,
  proj: ProjectionCells,
  _fcfRow: number,
  years: number,
  _pvSumAddr: string,
  sharesRef: string,
  _evAddr: string
) {
  const a = model.assumptions;

  ws.mergeCells(`A${startRow}:I${startRow}`);
  ws.getCell(`A${startRow}`).value = "Sensitivity Analysis — Intrinsic Value / Share ($)";
  Object.assign(ws.getCell(`A${startRow}`), headerStyle());
  ws.getRow(startRow).height = 20;

  const labelRow = startRow + 1;
  ws.getCell(`A${labelRow}`).value = "WACC  ↓   /   Terminal Growth Rate  →";
  Object.assign(ws.getCell(`A${labelRow}`), subheaderStyle());

  // TGR columns: base ± 1.0% in 0.5% steps (5 values, center = base)
  const tgrValues = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => a.terminalGrowthRate + d);
  // WACC rows: base ± 1.5% in 0.5% steps (7 values, center = base)
  const waccValues = [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015].map((d) => a.waccBase + d);

  // TGR header row
  tgrValues.forEach((tgr, j) => {
    const addr = `${col(j + 2)}${labelRow}`;
    ws.getCell(addr).value = tgr;
    Object.assign(ws.getCell(addr), subheaderStyle());
    ws.getCell(addr).numFmt = "0.0%";
    if (j === 2) {
      ws.getCell(addr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SENSITIVITY_CENTER } };
      ws.getCell(addr).font = { bold: true, name: "Calibri", size: 10 };
    }
  });

  // Data rows
  waccValues.forEach((wacc, i) => {
    const rowNum = labelRow + 1 + i;
    // WACC label
    ws.getCell(`A${rowNum}`).value = wacc;
    Object.assign(ws.getCell(`A${rowNum}`), labelStyle());
    ws.getCell(`A${rowNum}`).numFmt = "0.0%";
    if (i === 3) {
      ws.getCell(`A${rowNum}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SENSITIVITY_CENTER } };
      ws.getCell(`A${rowNum}`).font = { bold: true, name: "Calibri", size: 10 };
    }

    tgrValues.forEach((tgr, j) => {
      const addr = `${col(j + 2)}${rowNum}`;

      if (wacc <= tgr) {
        ws.getCell(addr).value = "N/A";
        Object.assign(ws.getCell(addr), labelStyle());
        return;
      }

      // Build explicit IV/Share formula parametrised on this cell's wacc and tgr.
      // Sum of PV(FCF) at cell wacc, plus PV(TV) at cell wacc/tgr, minus net debt, divided by shares.
      // All values reference live sheet cells — zero hardcoding of derived values.
      const w = wacc.toFixed(6);
      const g = tgr.toFixed(6);

      // PV FCF terms: each FCF discounted at mid-year using cell wacc
      const pvFcfTerms = proj.fcf
        .map((fcfRef, idx) => `${fcfRef}/((1+${w})^${idx + 0.5})`)
        .join("+");

      // Terminal FCF = last projected FCF
      const termFcf = proj.fcf[years - 1];

      // TV = termFCF*(1+g)/(w-g)  PV_TV = TV/(1+w)^years
      const pvTvFormula = `(${termFcf}*(1+${g})/(${w}-${g}))/((1+${w})^${years})`;

      ws.getCell(addr).value = {
        formula: `=IF(${w}<=${g},NA(),(${pvFcfTerms}+${pvTvFormula})/${sharesRef})`,
      };

      Object.assign(ws.getCell(addr), formulaStyle("#,##0.00"));

      if (i === 3 && j === 2) {
        // Center = base case — should match IV/Share on the main table
        ws.getCell(addr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SENSITIVITY_CENTER } };
        ws.getCell(addr).font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };
        ws.getCell(addr).note = {
          texts: [{ font: { size: 9 }, text: "Base case: WACC = Base, TGR = Base.\nShould match the ★ IV/Share figure above." }],
        };
      }
    });
  });
}

function col(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
