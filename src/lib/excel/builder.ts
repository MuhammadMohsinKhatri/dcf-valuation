import ExcelJS from "exceljs";
import type { DCFModel } from "@/types/model";
import { buildCoverSheet } from "./sheets/cover";
import { buildAssumptionsSheet } from "./sheets/assumptions";
import { buildThreeStatementSheets } from "./sheets/threestatement";
import { buildDCFSheet } from "./sheets/dcf";
import { buildCompsSheet } from "./sheets/comps";

function calcIVPS(model: DCFModel, scenario: "bear" | "base" | "bull"): number {
  const a = model.assumptions;
  const hist = model.historicalPeriods;
  if (!hist.length) return 0;
  const growthKey = `revenueGrowth${scenario.charAt(0).toUpperCase() + scenario.slice(1)}` as keyof typeof a;
  const ebitMargin = scenario === "bear" ? a.ebitMarginBear : scenario === "bull" ? a.ebitMarginBull : a.ebitMarginBase;
  const wacc = scenario === "bear" ? a.waccBear : scenario === "bull" ? a.waccBull : a.waccBase;
  const growthRates = a[growthKey] as number[];
  let rev = hist[0].revenue / 1e6;
  const fcfs: number[] = [];
  const pvFcfs: number[] = [];
  for (let yr = 1; yr <= a.projectionYears; yr++) {
    rev *= (1 + growthRates[yr - 1]);
    const ebit = rev * ebitMargin;
    const nopat = ebit * (1 - a.taxRate);
    const fcf = nopat + rev * a.depreciationPct - rev * a.capexPct;
    fcfs.push(fcf);
    pvFcfs.push(fcf / Math.pow(1 + wacc, yr - 0.5));
  }
  if (wacc <= a.terminalGrowthRate) return 0;
  const tv = (fcfs[a.projectionYears - 1] * (1 + a.terminalGrowthRate)) / (wacc - a.terminalGrowthRate);
  const pvTV = tv / Math.pow(1 + wacc, a.projectionYears);
  const ev = pvFcfs.reduce((s, v) => s + v, 0) + pvTV;
  return (ev - a.netDebt - a.minorityInterest) / a.sharesOutstanding;
}

export async function buildDCFExcel(model: DCFModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BOE DCF Platform";
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

  // 5. Comps & Football Field
  const bearIVPS = calcIVPS(model, "bear");
  const baseIVPS = calcIVPS(model, "base");
  const bullIVPS = calcIVPS(model, "bull");
  buildCompsSheet(wb, model, bearIVPS, baseIVPS, bullIVPS);

  // 6. Formula error check sheet
  buildErrorCheckSheet(wb);

  // ── PRINT-READY FORMATTING (all sheets) ──────────────────────────────────
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  wb.worksheets.forEach((ws) => {
    // Freeze header rows + label column
    ws.views = [{
      state: "frozen",
      xSplit: 1,
      ySplit: 2,
      showGridLines: true,
      zoomScale: 85,
    }];

    // Page setup — landscape, Letter size, fit to 1 page wide
    ws.pageSetup = {
      paperSize: 1 as ExcelJS.PaperSize,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3,
      },
    };

    // Print header/footer — GS style
    ws.headerFooter = {
      oddHeader: `&L&"Calibri,Bold"&10${model.companyName} (${model.ticker}) — DCF Valuation Model&C&"Calibri,Regular"&9${ws.name}&R&"Calibri,Regular"&9Confidential — ${today}`,
      oddFooter: `&L&"Calibri,Italic"&8For internal use only. Not for distribution.&R&"Calibri,Regular"&8Page &P of &N`,
      evenHeader: `&L&"Calibri,Bold"&10${model.companyName} (${model.ticker}) — DCF Valuation Model&R&"Calibri,Regular"&9${today}`,
      evenFooter: `&L&"Calibri,Italic"&8Confidential&R&"Calibri,Regular"&8Page &P of &N`,
    };

    // Repeat first 2 rows on every printed page (title + header row)
    try {
      ws.pageSetup.printTitlesRow = "1:2";
    } catch { /* some sheets may not support this */ }

    // Row heights — default
    ws.properties.defaultRowHeight = 16;

    // Default font for entire sheet
    ws.properties.defaultColWidth = 14;
  });

  // Per-sheet overrides
  const coverWs = wb.getWorksheet("Cover");
  if (coverWs) {
    coverWs.pageSetup.fitToWidth = 1;
    coverWs.pageSetup.fitToHeight = 1; // cover fits on 1 page
  }

  const compsWs = wb.getWorksheet("Comps & Football Field");
  if (compsWs) {
    compsWs.pageSetup.orientation = "landscape";
    compsWs.pageSetup.fitToWidth = 2; // football field is wide — allow 2 pages wide
    compsWs.views = [{ state: "frozen", xSplit: 1, ySplit: 3, showGridLines: true, zoomScale: 75 }];
  }

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
