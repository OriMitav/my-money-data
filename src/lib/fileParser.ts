import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedRow {
  date: string;
  sourceRecipient: string;
  value: number;
  rawData: Record<string, unknown>;
}

export interface ColumnMapping {
  date: string;
  sourceRecipient: string;
  value?: string;
  credit?: string;
  debit?: string;
  dateFormat?: "DMY" | "MDY";
}

function cleanValue(raw: unknown): number {
  if (typeof raw === "number") return raw;
  let str = String(raw ?? "")
    .replace(/[\u200F\u200E\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069]/g, "")
    .replace(/[₪$€,\s]/g, "")
    .trim();
  // Handle accounting-style negatives: (123.45) → -123.45
  const isNeg = /^\(.*\)$/.test(str);
  if (isNeg) str = str.replace(/[()]/g, "");
  str = str.replace(/[^\d.\-]/g, "");
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNeg ? -num : num;
}

function parseDate(raw: unknown, format: ColumnMapping["dateFormat"] = "DMY"): string {
  if (raw === null || raw === undefined || raw === "") return "";

  // Excel serial as a real number (e.g., 46059 → 2026-02-10)
  if (typeof raw === "number" && raw > 1000 && raw < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d2 = new Date(excelEpoch.getTime() + raw * 86400000);
    if (!isNaN(d2.getTime())) return d2.toISOString().split("T")[0];
  }

  // JS Date object (xlsx may return Date instances)
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().split("T")[0];
  }

  const str = String(raw).trim();

  // DD/MM/YYYY or MM/DD/YYYY (configurable)
  const parts = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    let year = parts[3];
    if (year.length === 2) year = "20" + year;

    const first = parts[1].padStart(2, "0");
    const second = parts[2].padStart(2, "0");
    const day = format === "MDY" ? second : first;
    const month = format === "MDY" ? first : second;

    return `${year}-${month}-${day}`;
  }

  // ISO yyyy-mm-dd (fast path, avoids Date weirdness)
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Excel serial as a string
  if (/^\d{4,5}$/.test(str)) {
    const n = parseInt(str, 10);
    if (n > 1000 && n < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d2 = new Date(excelEpoch.getTime() + n * 86400000);
      if (!isNaN(d2.getTime())) return d2.toISOString().split("T")[0];
    }
  }

  // Fallback: native Date parsing
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
    return d.toISOString().split("T")[0];
  }

  return "";
}


/**
 * Detect the header row in raw sheet data by searching for known column names.
 */
function findHeaderRow(
  rows: unknown[][],
  targetColumns: string[]
): number {
  const targets = targetColumns.map((c) => c.trim().toLowerCase());
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map((c) => String(c ?? "").trim().toLowerCase());
    const matchCount = targets.filter((t) => cells.includes(t)).length;
    if (matchCount >= 2) return i;
  }
  return -1;
}

export function parseCSV(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data as Record<string, unknown>[]),
      error: (err: Error) => reject(err),
    });
  });
}

export function parseXLSX(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Get raw rows (no header) to detect header row
        const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          defval: "",
        }) as unknown[][];

        // Try to find a header row
        const allPossibleHeaders = rawRows
          .slice(0, 20)
          .flatMap((row) => (row as unknown[]).map((c) => String(c ?? "").trim()))
          .filter(Boolean);

        // Find the header row index
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
          const cells = (rawRows[i] as unknown[]).map((c) =>
            String(c ?? "").trim()
          ).filter(Boolean);
          // A header row should have at least 3 non-empty cells that look like column names
          if (cells.length >= 3) {
            const hasDate = cells.some((c) =>
              /תאריך|date/i.test(c)
            );
            if (hasDate) {
              headerIdx = i;
              break;
            }
          }
        }

        if (headerIdx >= 0) {
          // Use the detected header row
          const headers = (rawRows[headerIdx] as unknown[]).map((c) =>
            String(c ?? "").trim()
          );
          const dataRows = rawRows.slice(headerIdx + 1);
          const rows: Record<string, unknown>[] = dataRows
            .filter((row) => {
              // Filter out empty rows
              const nonEmpty = (row as unknown[]).filter(
                (c) => c !== "" && c !== null && c !== undefined && String(c).trim() !== ""
              );
              return nonEmpty.length >= 2;
            })
            .map((row) => {
              const obj: Record<string, unknown> = {};
              headers.forEach((h, idx) => {
                if (h) obj[h] = (row as unknown[])[idx];
              });
              return obj;
            });
          resolve(rows);
        } else {
          // Fallback: standard sheet_to_json
          const rows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, unknown>[];
          resolve(rows);
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Normalize a header/key for fuzzy matching:
 * - removes line breaks, BOM, RTL marks
 * - collapses whitespace
 * - lowercases
 */
function normalizeKey(s: string): string {
  return String(s ?? "")
    .replace(/[\u200F\u200E\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\uFEFF]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Hebrew/English aliases for common bank/credit-card columns
const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "תאריך", "תאריך עסקה", "תאריך חיוב", "תאריך הרכישה", "תאריך פעולה"],
  sourceRecipient: [
    "from/to", "description", "details", "merchant",
    "שם בית עסק", "תיאור", "תאור", "פרטים", "מוטב", "שם המוטב", "שם בית העסק", "שם בית-עסק",
  ],
  value: [
    "value", "amount", "charge", "charging value", "charged value", "סכום", "סכום חיוב", "סכום לחיוב", "סכום עסקה", "סכום בש״ח", 'סכום בש"ח', "סכום בשח",
  ],
  credit: ["credit", "זכות", "הכנסה"],
  debit: ["debit", "חובה", "הוצאה"],
};

/**
 * Look up a value in a row using fuzzy matching (line breaks, spaces, case insensitive).
 * Falls back to known Hebrew/English aliases if direct match fails.
 */
function getCol(row: Record<string, unknown>, key: string, aliasGroup?: keyof typeof HEADER_ALIASES): unknown {
  if (key in row) return row[key];
  const trimmed = key.trim();
  if (trimmed in row) return row[trimmed];

  const normTarget = normalizeKey(key);
  // Build a normalized lookup of row keys
  for (const k of Object.keys(row)) {
    if (normalizeKey(k) === normTarget) return row[k];
  }
  // Partial / contains match (e.g. "תאריך" matches "תאריך עסקה")
  for (const k of Object.keys(row)) {
    const nk = normalizeKey(k);
    if (nk.includes(normTarget) || normTarget.includes(nk)) return row[k];
  }
  // Try aliases for the field
  if (aliasGroup) {
    const aliases = HEADER_ALIASES[aliasGroup] || [];
    for (const alias of aliases) {
      const na = normalizeKey(alias);
      for (const k of Object.keys(row)) {
        const nk = normalizeKey(k);
        if (nk === na || nk.includes(na) || na.includes(nk)) return row[k];
      }
    }
  }
  return undefined;
}

// Detect "installment X of Y" in any cell of a row (generic, language-agnostic for Hebrew patterns)
const INSTALLMENT_PATTERNS = [
  /תשלום\s*\d+\s*מתוך\s*\d+/i,
  /תשלום\s*\d+\s*\/\s*\d+/i,
  /payment\s*\d+\s*of\s*\d+/i,
  /\b\d+\s*\/\s*\d+\s*תשלומים?/i,
];

function isInstallmentRow(row: Record<string, unknown>): boolean {
  for (const v of Object.values(row)) {
    if (v == null) continue;
    const s = String(v);
    if (!s) continue;
    for (const re of INSTALLMENT_PATTERNS) {
      if (re.test(s)) return true;
    }
  }
  return false;
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  context?: { uploadMonth?: number; uploadYear?: number }
): ParsedRow[] {
  return rows
    .map((row) => {
      let value: number;
      if (mapping.credit && mapping.debit) {
        const creditVal = cleanValue(getCol(row, mapping.credit, "credit"));
        const debitVal = cleanValue(getCol(row, mapping.debit, "debit"));
        value = creditVal > 0 ? creditVal : debitVal > 0 ? -debitVal : 0;
      } else if (mapping.value) {
        value = cleanValue(getCol(row, mapping.value, "value"));
      } else {
        value = 0;
      }

      let date = parseDate(getCol(row, mapping.date, "date"), mapping.dateFormat);
      if (isInstallmentRow(row) && context?.uploadMonth && context?.uploadYear) {
        date = firstOfMonth(context.uploadYear, context.uploadMonth);
      }

      return {
        date,
        sourceRecipient: String(getCol(row, mapping.sourceRecipient, "sourceRecipient") ?? ""),
        value,
        rawData: row,
      };
    })
    .filter((r) => r.date && r.value !== 0);
}

