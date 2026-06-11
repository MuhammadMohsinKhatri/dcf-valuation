import type { Style, Alignment, Font, Fill, Border } from "exceljs";

export const BLUE_INPUT = "FF0070C0";   // blue — hardcoded input cells
export const BLACK_FORMULA = "FF000000"; // black — formula-derived cells
export const HEADER_BG = "FF1F3864";    // dark navy header background
export const SUBHEADER_BG = "FFD6E4BC"; // light green subheader
export const BEAR_BG = "FFFFD7D7";      // bear scenario tint
export const BASE_BG = "FFFFFBE6";      // base scenario tint
export const BULL_BG = "FFE2EFDA";      // bull scenario tint
export const SENSITIVITY_CENTER = "FFFFE699"; // center cell of sensitivity table
export const ERROR_RED = "FFFF0000";

export function inputStyle(numFmt = "#,##0.0"): Partial<Style> {
  return {
    font: { bold: false, color: { argb: BLUE_INPUT }, size: 10, name: "Calibri" },
    alignment: { horizontal: "right", vertical: "middle" },
    numFmt,
  };
}

export function formulaStyle(numFmt = "#,##0.0"): Partial<Style> {
  return {
    font: { bold: false, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" },
    alignment: { horizontal: "right", vertical: "middle" },
    numFmt,
  };
}

export function headerStyle(): Partial<Style> {
  return {
    font: { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } },
    alignment: { horizontal: "left", vertical: "middle" },
  };
}

export function subheaderStyle(): Partial<Style> {
  return {
    font: { bold: true, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_BG } },
    alignment: { horizontal: "left", vertical: "middle" },
  };
}

export function labelStyle(): Partial<Style> {
  return {
    font: { bold: false, color: { argb: BLACK_FORMULA }, size: 10, name: "Calibri" },
    alignment: { horizontal: "left", vertical: "middle" },
  };
}

export function scenarioBg(scenario: "bear" | "base" | "bull"): Partial<Style> {
  const bgMap = { bear: BEAR_BG, base: BASE_BG, bull: BULL_BG };
  return {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: bgMap[scenario] } },
  };
}

export function pctFmt(decimals = 1): string {
  return `0.${"0".repeat(decimals)}%`;
}

export function currencyFmt(decimals = 1): string {
  return `#,##0.${"0".repeat(decimals)}`;
}

export function thinBorder(): Partial<Style> {
  const s: Partial<Border> = { style: "thin", color: { argb: "FFD0D0D0" } };
  return { border: { top: s, bottom: s, left: s, right: s } };
}

export function thickBottomBorder(): Partial<Style> {
  return {
    border: {
      bottom: { style: "medium", color: { argb: BLACK_FORMULA } },
    },
  };
}
