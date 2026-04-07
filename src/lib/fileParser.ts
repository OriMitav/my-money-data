import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedRow {
  date: string;
  sourceRecipient: string;
  value: number;
  rawData: Record<string, unknown>;
}

interface ColumnMapping {
  date: string;
  sourceRecipient: string;
  value: string;
}

function cleanValue(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const str = String(raw ?? "")
    .replace(/[₪$€,\s]/g, "")
    .replace(/[^\d.\-]/g, "");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parseDate(raw: unknown): string {
  if (!raw) return "";
  const str = String(raw).trim();

  // Try DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    let year = ddmmyyyy[3];
    if (year.length === 2) year = "20" + year;
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
        const rows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, unknown>[];
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): ParsedRow[] {
  return rows
    .map((row) => ({
      date: parseDate(row[mapping.date]),
      sourceRecipient: String(row[mapping.sourceRecipient] ?? ""),
      value: cleanValue(row[mapping.value]),
      rawData: row,
    }))
    .filter((r) => r.date && r.value !== 0);
}