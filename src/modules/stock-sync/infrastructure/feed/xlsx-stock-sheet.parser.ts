import { unzipSync } from 'fflate';
import * as sax from 'sax';

/**
 * Minimal SpreadsheetML reader for "a flat sheet of columns I care about".
 *
 * Deliberately not a general xlsx library. Rough Country's workbook is ~16 MB
 * compressed but ~148 MB of XML, almost all of it a `Vehicle Fitment` sheet we
 * never read. Every streaming reader we tried either spooled all four sheets to
 * disk first or depended on the order of entries inside the zip. Going straight
 * at the two entries we need (the sheet, plus the shared string table it points
 * into) is smaller, faster and order-independent.
 */

export interface SheetRow {
  /** Cell values by lower-cased header name. Absent cells are omitted. */
  cells: Map<string, string>;
  /** 1-based row number in the sheet, for error messages. */
  rowNumber: number;
}

export class XlsxParseError extends Error {}

const WORKBOOK_PATH = 'xl/workbook.xml';
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels';
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';

const decoder = new TextDecoder('utf-8');

/** "BC12" -> "BC" */
const columnOf = (ref: string): string => {
  let letters = '';
  for (const ch of ref) {
    if (ch >= 'A' && ch <= 'Z') letters += ch;
    else break;
  }
  return letters;
};

const readEntries = (
  buffer: Uint8Array,
  wanted: (path: string) => boolean,
): Map<string, string> => {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, { filter: (file) => wanted(file.name) });
  } catch (e) {
    throw new XlsxParseError(
      `not a readable xlsx file: ${e instanceof Error ? e.message : e}`,
    );
  }
  const out = new Map<string, string>();
  for (const [path, bytes] of Object.entries(files))
    out.set(path, decoder.decode(bytes));
  return out;
};

/**
 * Resolves which `xl/worksheets/sheetN.xml` backs the first sheet in the
 * workbook's own tab order — which is not necessarily `sheet1.xml`.
 */
const resolveFirstSheetPath = (buffer: Uint8Array): string => {
  const meta = readEntries(
    buffer,
    (path) => path === WORKBOOK_PATH || path === WORKBOOK_RELS_PATH,
  );
  const workbookXml = meta.get(WORKBOOK_PATH);
  if (!workbookXml) throw new XlsxParseError('xl/workbook.xml is missing');

  const firstSheet = /<sheet\b[^>]*>/i.exec(workbookXml)?.[0];
  if (!firstSheet) throw new XlsxParseError('the workbook declares no sheets');

  const relId = /r:id="([^"]+)"/i.exec(firstSheet)?.[1];
  const relsXml = meta.get(WORKBOOK_RELS_PATH);
  if (relId && relsXml) {
    const escaped = relId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rel = new RegExp(
      `<Relationship\\b[^>]*Id="${escaped}"[^>]*>`,
      'i',
    ).exec(relsXml)?.[0];
    const target = rel && /Target="([^"]+)"/i.exec(rel)?.[1];
    if (target) {
      const normalized = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      return `xl/${normalized}`;
    }
  }
  return 'xl/worksheets/sheet1.xml';
};

const parseSharedStrings = (xml: string | undefined): string[] => {
  if (!xml) return [];
  const strings: string[] = [];
  const parser = sax.parser(true, { trim: false, normalize: false });

  let inItem = false;
  let inText = false;
  let current = '';

  parser.onopentag = (node) => {
    if (node.name === 'si') {
      inItem = true;
      current = '';
    } else if (node.name === 't' && inItem) {
      inText = true;
    }
  };
  parser.ontext = (text) => {
    if (inText) current += text;
  };
  parser.oncdata = (text) => {
    if (inText) current += text;
  };
  parser.onclosetag = (name) => {
    if (name === 't') inText = false;
    else if (name === 'si') {
      strings.push(current);
      inItem = false;
    }
  };

  parser.write(xml).close();
  return strings;
};

/**
 * Reads the first worksheet of an xlsx, returning only the columns named in
 * `headers` (matched case-insensitively against the first row).
 *
 * @throws XlsxParseError when the file is unreadable or a header is missing.
 */
export const parseFirstSheet = (
  buffer: Uint8Array,
  headers: string[],
): SheetRow[] => {
  const sheetPath = resolveFirstSheetPath(buffer);
  const entries = readEntries(
    buffer,
    (path) => path === sheetPath || path === SHARED_STRINGS_PATH,
  );

  const sheetXml = entries.get(sheetPath);
  if (!sheetXml) throw new XlsxParseError(`worksheet ${sheetPath} is missing`);
  const shared = parseSharedStrings(entries.get(SHARED_STRINGS_PATH));

  const wanted = new Set(headers.map((h) => h.toLowerCase()));
  /** column letter -> lower-cased header name, built from row 1 */
  const columnHeaders = new Map<string, string>();
  const rows: SheetRow[] = [];

  const parser = sax.parser(true, { trim: false, normalize: false });

  let rowNumber = 0;
  let rowCells = new Map<string, string>();
  let cellColumn = '';
  let cellType = '';
  let inValue = false;
  let inInlineText = false;
  let raw = '';

  const finishCell = () => {
    if (cellColumn === '') return;
    let text = raw;
    if (cellType === 's') {
      const index = Number.parseInt(raw, 10);
      text = Number.isNaN(index) ? '' : (shared[index] ?? '');
    }
    if (rowNumber === 1) {
      const label = text.trim().toLowerCase();
      if (wanted.has(label)) columnHeaders.set(cellColumn, label);
    } else {
      const header = columnHeaders.get(cellColumn);
      if (header !== undefined) rowCells.set(header, text);
    }
    cellColumn = '';
    cellType = '';
    raw = '';
  };

  parser.onopentag = (node) => {
    const attrs = node.attributes as Record<string, string>;
    switch (node.name) {
      case 'row':
        // Blank rows are skipped entirely by Excel, so trust r= over a counter.
        rowNumber = Number.parseInt(attrs.r ?? '0', 10) || rowNumber + 1;
        rowCells = new Map();
        break;
      case 'c':
        cellColumn = columnOf(attrs.r ?? '');
        cellType = attrs.t ?? '';
        raw = '';
        break;
      case 'v':
        inValue = true;
        break;
      case 't':
        // Inline strings (<is><t>) rather than the shared table.
        if (cellType === 'inlineStr') inInlineText = true;
        break;
      default:
        break;
    }
  };

  parser.ontext = (text) => {
    if (inValue || inInlineText) raw += text;
  };
  parser.oncdata = (text) => {
    if (inValue || inInlineText) raw += text;
  };

  parser.onclosetag = (name) => {
    switch (name) {
      case 'v':
        inValue = false;
        break;
      case 't':
        inInlineText = false;
        break;
      case 'c':
        finishCell();
        break;
      case 'row':
        if (rowNumber === 1) {
          const missing = [...wanted].filter(
            (h) => ![...columnHeaders.values()].includes(h),
          );
          if (missing.length > 0) {
            throw new XlsxParseError(
              `missing column(s): ${missing.join(', ')}`,
            );
          }
        } else if (rowCells.size > 0) {
          rows.push({ cells: rowCells, rowNumber });
        }
        break;
      default:
        break;
    }
  };

  parser.write(sheetXml).close();
  return rows;
};
