import type ExcelJS from "exceljs";
import {
  headerStyle,
  subheaderStyle,
  labelStyle,
  inputStyle,
  scenarioBg,
  pctFmt,
  thinBorder,
  BLUE_INPUT,
  BLACK_FORMULA,
} from "../styles";
import type { DCFModel, AssumptionSource } from "@/types/model";

// Returns a map of named cells for cross-sheet formula references
export interface AssumptionCellMap {
  scenario: string;       // e.g. "B2"
  wacc: string;           // resolved WACC based on scenario
  ebitMargin: string;     // resolved EBIT margin
  tgr: string;            // terminal growth rate
  taxRate: string;
  depPct: string;
  capexPct: string;
  nwcPct: string;
  sharesOut: string;
  netDebt: string;
  minorityInt: string;
  revenueGrowth: (year: number) => string; // resolved per-year growth
}

export function buildAssumptionsSheet(
  wb: ExcelJS.Workbook,
  model: DCFModel
): AssumptionCellMap {
  const ws = wb.addWorksheet("Assumptions", {
    properties: { tabColor: { argb: "FF4472C4" } },
  });

  const a = model.assumptions;
  const sources: Map<string, AssumptionSource> = new Map(
    model.assumptionSources.map((s) => [s.field, s])
  );

  ws.getColumn("A").width = 35;
  ws.getColumn("B").width = 18;
  ws.getColumn("C").width = 18;
  ws.getColumn("D").width = 18;
  ws.getColumn("E").width = 18;
  ws.getColumn("F").width = 18;
  ws.getColumn("G").width = 18;

  // Title
  ws.mergeCells("A1:G1");
  const t = ws.getCell("A1");
  t.value = "Model Assumptions & Scenario Inputs";
  Object.assign(t, headerStyle());
  ws.getRow(1).height = 22;

  // Scenario selector
  ws.getCell("A2").value = "Active Scenario";
  Object.assign(ws.getCell("A2"), labelStyle());
  ws.getCell("A2").font = { ...labelStyle().font, bold: true };

  const scenCell = ws.getCell("B2");
  scenCell.value = model.activeScenario.charAt(0).toUpperCase() + model.activeScenario.slice(1);
  Object.assign(scenCell, inputStyle("@"));
  scenCell.font = { bold: true, color: { argb: BLUE_INPUT }, size: 11, name: "Calibri" };
  // Data validation for scenario dropdown
  ws.getCell("B2").dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Bear,Base,Bull"'],
    showErrorMessage: true,
    error: "Choose Bear, Base, or Bull",
    errorTitle: "Invalid Scenario",
  };
  addComment(ws, "B2", "Active Scenario", "Select Bear, Base, or Bull to switch all resolved cells");

  // Headers: col A = label, B = Bear, C = Base, D = Bull, E = Resolved
  const hRow = ws.getRow(4);
  ["Assumption", "Bear", "Base", "Bull", "Resolved (=Active Scenario)"].forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    Object.assign(c, subheaderStyle());
    if (i === 1) Object.assign(c, { ...subheaderStyle(), fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD7D7" } } });
    if (i === 2) Object.assign(c, { ...subheaderStyle(), fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBE6" } } });
    if (i === 3) Object.assign(c, { ...subheaderStyle(), fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } } });
  });
  ws.getRow(4).height = 18;

  let row = 5;

  function writeSection(title: string) {
    ws.mergeCells(`A${row}:G${row}`);
    const c = ws.getCell(`A${row}`);
    c.value = title;
    c.font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9EFF7" } };
    row++;
  }

  function writeTriple(
    label: string,
    bear: number,
    base: number,
    bull: number,
    fmt: string,
    fieldKey: string,
    comment?: string
  ): { bearCell: string; baseCell: string; bullCell: string; resolvedCell: string } {
    const r = row;
    ws.getCell(`A${r}`).value = label;
    Object.assign(ws.getCell(`A${r}`), labelStyle());

    const bearCell = `B${r}`;
    const baseCell = `C${r}`;
    const bullCell = `D${r}`;
    const resolvedCell = `E${r}`;

    ws.getCell(bearCell).value = bear;
    ws.getCell(baseCell).value = base;
    ws.getCell(bullCell).value = bull;

    [bearCell, baseCell, bullCell].forEach((addr, i) => {
      Object.assign(ws.getCell(addr), inputStyle(fmt));
      Object.assign(ws.getCell(addr), scenarioBg(["bear", "base", "bull"][i] as "bear" | "base" | "bull"));
    });

    // Resolved = IF(B2="Bear", bear, IF(B2="Bull", bull, base))
    ws.getCell(resolvedCell).value = {
      formula: `IF($B$2="Bear",${bearCell},IF($B$2="Bull",${bullCell},${baseCell}))`,
    };
    Object.assign(ws.getCell(resolvedCell), inputStyle(fmt));
    ws.getCell(resolvedCell).font = { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" };

    // Add source comment
    const src = sources.get(fieldKey);
    const commentText = src
      ? `Source: ${src.source}\nRationale: ${src.rationale}`
      : comment ?? `${label} — analyst input`;
    addComment(ws, baseCell, label, commentText);

    row++;
    return { bearCell, baseCell, bullCell, resolvedCell };
  }

  // Revenue growth section
  writeSection("Revenue Growth Rates (Year 1-5)");
  const growthCells: string[] = [];
  for (let yr = 0; yr < 5; yr++) {
    const result = writeTriple(
      `  Year ${yr + 1} Revenue Growth`,
      a.revenueGrowthBear[yr],
      a.revenueGrowthBase[yr],
      a.revenueGrowthBull[yr],
      pctFmt(1),
      `revenueGrowthYear${yr + 1}`
    );
    growthCells.push(result.resolvedCell);
  }

  writeSection("Profitability");
  const ebitResult = writeTriple(
    "EBIT Margin",
    a.ebitMarginBear,
    a.ebitMarginBase,
    a.ebitMarginBull,
    pctFmt(1),
    "ebitMargin",
    "EBIT as % of revenue — key profitability assumption"
  );

  writeSection("Discount Rate (WACC)");
  const waccResult = writeTriple(
    "WACC",
    a.waccBear,
    a.waccBase,
    a.waccBull,
    pctFmt(2),
    "wacc",
    "Weighted Average Cost of Capital"
  );

  writeSection("Other Assumptions (Single Value)");

  function writeSingle(label: string, value: number, fmt: string, fieldKey: string, comment?: string): string {
    const r = row;
    ws.getCell(`A${r}`).value = label;
    Object.assign(ws.getCell(`A${r}`), labelStyle());
    ws.getCell(`B${r}`).value = value;
    Object.assign(ws.getCell(`B${r}`), inputStyle(fmt));
    const src = sources.get(fieldKey);
    addComment(ws, `B${r}`, label, src ? `Source: ${src.source}\n${src.rationale}` : comment ?? label);
    row++;
    return `B${r - 1}`;
  }

  const taxCell = writeSingle("Tax Rate", a.taxRate, pctFmt(1), "taxRate", "Effective corporate tax rate");
  const depCell = writeSingle("D&A as % Revenue", a.depreciationPct, pctFmt(1), "depreciationPct");
  const capexCell = writeSingle("Capex as % Revenue", a.capexPct, pctFmt(1), "capexPct");
  const nwcCell = writeSingle("Δ NWC as % Revenue Change", a.nwcChangePct, pctFmt(1), "nwcChangePct");
  const tgrCell = writeSingle("Terminal Growth Rate", a.terminalGrowthRate, pctFmt(2), "terminalGrowthRate", "Perpetuity growth rate (≤ long-run GDP)");
  const sharesCell = writeSingle("Shares Outstanding (M)", a.sharesOutstanding, "#,##0.0", "sharesOutstanding", "Diluted shares in millions — from latest 10-K");
  const netDebtCell = writeSingle("Net Debt ($M)", a.netDebt, "#,##0.0", "netDebt", "Total debt minus cash — from latest balance sheet");
  const minIntCell = writeSingle("Minority Interest ($M)", a.minorityInterest, "#,##0.0", "minorityInterest");

  return {
    scenario: "B2",
    wacc: waccResult.resolvedCell,
    ebitMargin: ebitResult.resolvedCell,
    tgr: tgrCell,
    taxRate: taxCell,
    depPct: depCell,
    capexPct: capexCell,
    nwcPct: nwcCell,
    sharesOut: sharesCell,
    netDebt: netDebtCell,
    minorityInt: minIntCell,
    revenueGrowth: (year: number) => growthCells[year - 1],
  };
}

function addComment(ws: ExcelJS.Worksheet, addr: string, author: string, text: string) {
  ws.getCell(addr).note = { texts: [{ font: { size: 9, name: "Calibri" }, text: `${author}:\n${text}` }] };
}
