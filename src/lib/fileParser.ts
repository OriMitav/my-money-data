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

function parseDate(raw: unknown): string {
  if (!raw) return "";
  const str = String(raw).trim();

  // Match patterns like DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const parts = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    const a = parseInt(parts[1]);
    const b = parseInt(parts[2]);
    let year = parts[3];
    if (year.length === 2) year = "20" + year;

    let day: string, month: string;
    if (a > 12) {
      // First number > 12 → must be day (DD/MM/YYYY)
      day = parts[1].padStart(2, "0");
      month = parts[2].padStart(2, "0");
    } else if (b > 12) {
      // Second number > 12 → must be day (MM/DD/YYYY)
      month = parts[1].padStart(2, "0");
      day = parts[2].padStart(2, "0");
    } else {
      // Ambiguous (both ≤ 12) — use DD/MM/YYYY as default for Israeli format
      day = parts[1].padStart(2, "0");
      month = parts[2].padStart(2, "0");
    }
    return `${year}-${month}-${day}`;
  }

  // Try ISO or other standard formats
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  // Excel serial date number
  if (/^\d{5}$/.test(str)) {
    const excelEpoch = new Date(1899, 11, 30);
    const d2 = new Date(excelEpoch.getTime() + parseInt(str) * 86400000);
    return d2.toISOString().split("T")[0];
  }

  return str;
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
 * Look up a value in a row, trying both the exact key and trimmed keys
 * to handle column mapping or header whitespace mismatches.
 */
function getCol(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const trimmed = key.trim();
  if (trimmed in row) return row[trimmed];
  // Try matching trimmed row keys against trimmed mapping key
  for (const k of Object.keys(row)) {
    if (k.trim() === trimmed) return row[k];
  }
  return undefined;
}

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): ParsedRow[] {
  return rows
    .map((row) => {
      let value: number;
      if (mapping.credit && mapping.debit) {
        const creditVal = cleanValue(getCol(row, mapping.credit));
        const debitVal = cleanValue(getCol(row, mapping.debit));
        value = creditVal > 0 ? creditVal : debitVal > 0 ? -debitVal : 0;
      } else if (mapping.value) {
        value = cleanValue(getCol(row, mapping.value));
      } else {
        value = 0;
      }

      return {
        date: parseDate(getCol(row, mapping.date)),
        sourceRecipient: String(getCol(row, mapping.sourceRecipient) ?? ""),
        value,
        rawData: row,
      };
    })
    .filter((r) => r.date && r.value !== 0);
}
