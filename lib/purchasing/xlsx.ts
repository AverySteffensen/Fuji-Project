import type { Purchase, Workspace } from "./types.ts";
import { ROLE_NAMES } from "./types.ts";
import { businessDate, exportRows, cents } from "./domain.ts";
import { isOverdue, DATE_FIELDS, type RegisterFilters } from "./register.ts";

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type ExcelDate = { date: string; time?: boolean };
export type ExcelCell =
  string | number | boolean | null | undefined | ExcelDate;
export type ExcelSheet = {
  name: string;
  rows: ExcelCell[][];
  widths?: number[];
  currency?: number[];
  overdueColumn?: number;
  overdueRule?: { due: number; status: number; received: number };
};
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/_x([0-9a-f]{4})_/gi, "_x005F_x$1_")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export function columnName(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}
export function excelDate(value: ExcelDate): number | null {
  if (!value.date) return null;
  let day = value.date.slice(0, 10),
    clock = "00:00:00";
  if (value.time) {
    const d = new Date(value.date);
    if (!Number.isFinite(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value;
    day = `${get("year")}-${get("month")}-${get("day")}`;
    clock = `${get("hour")}:${get("minute")}:${get("second")}`;
  }
  const instant = Date.parse(`${day}T${clock}Z`);
  if (!Number.isFinite(instant)) return null;
  return (instant - Date.UTC(1899, 11, 30)) / 86400000;
}
function cell(
  value: ExcelCell,
  ref: string,
  header: boolean,
  currency: boolean,
): string {
  if (header)
    return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  if (value === null || value === undefined || value === "")
    return `<c r="${ref}" s="0"/>`;
  if (typeof value === "object") {
    const serial = excelDate(value);
    return serial === null
      ? `<c r="${ref}"/>`
      : `<c r="${ref}" s="${value.time ? 4 : 3}"><v>${serial}</v></c>`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Excel export contains an invalid number.");
    return `<c r="${ref}" s="${currency ? 2 : 5}"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean")
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  // Strings are always explicit inline strings. User text can never become a formula or external link.
  return `<c r="${ref}" s="0" t="inlineStr"><is><t xml:space="preserve">${xml(value.slice(0, 32767))}</t></is></c>`;
}
function worksheet(sheet: ExcelSheet): string {
  const count = sheet.rows[0].length,
    end = `${columnName(count - 1)}${sheet.rows.length}`;
  const columns = Array.from({ length: count }, (_, c) => {
    const heading = String(sheet.rows[0][c]);
    const width =
      sheet.widths?.[c] ??
      (/Explanation|reason|notes|Note|Item|Attachment/.test(heading)
        ? 46
        : /date|Submitted|Approved|Ordered|Expected|Received|Invoice/i.test(
              heading,
            )
          ? 23
          : /Supplier|Requester|Department|Contact|approv/i.test(heading)
            ? 28
            : 20);
    return `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const rows = sheet.rows
    .map(
      (row, r) =>
        `<row r="${r + 1}" ht="${r === 0 ? 34 : 32}" customHeight="1">${Array.from({ length: count }, (_, c) => cell(row[c], `${columnName(c)}${r + 1}`, r === 0, sheet.currency?.includes(c) ?? false)).join("")}</row>`,
    )
    .join("");
  let conditional = "";
  if (
    sheet.rows.length > 1 &&
    (sheet.overdueColumn !== undefined || sheet.overdueRule)
  ) {
    const rule = sheet.overdueRule;
    const formula = rule
      ? `AND(ISNUMBER($${columnName(rule.due)}2),$${columnName(rule.due)}2<TODAY(),$${columnName(rule.status)}2<>"Rejected",$${columnName(rule.received)}2="")`
      : `$${columnName(sheet.overdueColumn!)}2="Overdue"`;
    conditional = `<conditionalFormatting sqref="A2:${end}"><cfRule type="expression" dxfId="0" priority="1"><formula>${xml(formula)}</formula></cfRule></conditionalFormatting>`;
  }
  return (
    declaration +
    `<worksheet xmlns="${NS}" xmlns:r="${REL}"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B2" sqref="B2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="32"/><cols>${columns}</cols><sheetData>${rows}</sheetData>${conditional}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`
  );
}
const styles =
  declaration +
  `<styleSheet xmlns="${NS}"><numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="mm/dd/yyyy"/><numFmt numFmtId="166" formatCode="mm/dd/yyyy hh:mm:ss"/><numFmt numFmtId="167" formatCode="General"/></numFmts><fonts count="2"><font><sz val="12"/><color rgb="FF24352F"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF217346"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>${[164, 165, 166, 167].map((id) => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>`).join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="1"><dxf><font><b/><color rgb="FFB42318"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFECEB"/><bgColor indexed="64"/></patternFill></fill></dxf></dxfs><tableStyles count="0" defaultTableStyle="TableStyleMedium4" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;

// Small, deterministic ZIP writer using the standard stored method. No runtime dependency,
// macros, formulas, links, or remote services are required to export a workbook.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(entries: [string, string][]): Uint8Array<ArrayBuffer> {
  const files = entries.map(([name, text]) => ({
    name: encoder.encode(name),
    data: encoder.encode(text),
    offset: 0,
  }));
  const localLength = files.reduce(
    (n, f) => n + 30 + f.name.length + f.data.length,
    0,
  );
  const centralLength = files.reduce((n, f) => n + 46 + f.name.length, 0);
  const result = new Uint8Array(localLength + centralLength + 22),
    view = new DataView(result.buffer);
  let pos = 0;
  const u16 = (at: number, n: number) => view.setUint16(at, n, true);
  const u32 = (at: number, n: number) => view.setUint32(at, n, true);
  for (const f of files) {
    f.offset = pos;
    u32(pos, 0x04034b50);
    u16(pos + 4, 20);
    u16(pos + 6, 0x0800);
    u16(pos + 12, 0x0021);
    u32(pos + 14, crc32(f.data));
    u32(pos + 18, f.data.length);
    u32(pos + 22, f.data.length);
    u16(pos + 26, f.name.length);
    result.set(f.name, pos + 30);
    result.set(f.data, pos + 30 + f.name.length);
    pos += 30 + f.name.length + f.data.length;
  }
  for (const f of files) {
    u32(pos, 0x02014b50);
    u16(pos + 4, 20);
    u16(pos + 6, 20);
    u16(pos + 8, 0x0800);
    u16(pos + 14, 0x0021);
    u32(pos + 16, crc32(f.data));
    u32(pos + 20, f.data.length);
    u32(pos + 24, f.data.length);
    u16(pos + 28, f.name.length);
    u32(pos + 42, f.offset);
    result.set(f.name, pos + 46);
    pos += 46 + f.name.length;
  }
  u32(pos, 0x06054b50);
  u16(pos + 8, files.length);
  u16(pos + 10, files.length);
  u32(pos + 12, centralLength);
  u32(pos + 16, localLength);
  return result;
}
export function createXlsx(sheets: ExcelSheet[]): Uint8Array<ArrayBuffer> {
  if (!sheets.length || sheets.some((s) => !s.rows.length || !s.rows[0].length))
    throw new Error("Excel export requires column headings.");
  const parts: [string, string][] = [
    [
      "[Content_Types].xml",
      declaration +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`).join("")}</Types>`,
    ],
    [
      "_rels/.rels",
      declaration +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      declaration +
        `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      declaration +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", styles],
  ];
  sheets.forEach((s, i) => {
    const id = i + 1,
      end = `${columnName(s.rows[0].length - 1)}${s.rows.length}`;
    parts.push([`xl/worksheets/sheet${id}.xml`, worksheet(s)]);
    parts.push([
      `xl/worksheets/_rels/sheet${id}.xml.rels`,
      declaration +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/table" Target="../tables/table${id}.xml"/></Relationships>`,
    ]);
    parts.push([
      `xl/tables/table${id}.xml`,
      declaration +
        `<table xmlns="${NS}" id="${id}" name="FujiTable${id}" displayName="FujiTable${id}" ref="A1:${end}" totalsRowShown="0"><autoFilter ref="A1:${end}"/><tableColumns count="${s.rows[0].length}">${s.rows[0].map((h, c) => `<tableColumn id="${c + 1}" name="${xml(h)}"/>`).join("")}</tableColumns><tableStyleInfo name="TableStyleMedium4" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`,
    ]);
  });
  return zip(parts);
}
const typedDate = (date: string, time = false): ExcelCell =>
  date ? { date, time } : "";
export function purchaseSheets(
  purchases: Purchase[],
  workspace: Workspace,
  filters: RegisterFilters,
): ExcelSheet[] {
  const rows = exportRows(purchases);
  const keep = rows[0]
    .map((_, i) => i)
    .filter((i) => rows[0][i] !== "Sample data");
  const dateHeaders = new Set([
    "Submitted at",
    "Needed by",
    "Approved at",
    "Ordered on",
    "Expected on",
    "Received on",
    "Invoice to accounting",
    "Verbal approved at",
  ]);
  const timeHeaders = new Set([
    "Submitted at",
    "Approved at",
    "Verbal approved at",
  ]);
  const headers = keep.map((i) => String(rows[0][i]));
  const currency = headers.flatMap((h, i) =>
    /total|price|Freight|Tax|amount/i.test(h) ? [i] : [],
  );
  const ids = new Set(purchases.map((p) => p.id));
  return [
    {
      name: "Requests",
      rows: [
        headers
          .map((h) => (timeHeaders.has(h) ? `${h} (Eastern)` : h))
          .concat("Due status"),
        ...rows
          .slice(1)
          .map((r, n) => [
            ...keep.map((i) =>
              dateHeaders.has(String(rows[0][i]))
                ? typedDate(
                    String(r[i] ?? ""),
                    timeHeaders.has(String(rows[0][i])),
                  )
                : r[i],
            ),
            isOverdue(purchases[n]) ? "Overdue" : "",
          ]),
      ],
      currency,
      overdueRule: {
        due: headers.indexOf("Needed by"),
        status: headers.indexOf("Status"),
        received: headers.indexOf("Received on"),
      },
    },
    {
      name: "Line items",
      rows: [
        [
          "Request ID",
          "Item",
          "Part number",
          "Quantity",
          "Unit price",
          "Line total",
          "Supplier",
          "Department",
          "Priority",
          "Needed by",
        ],
        ...purchases.flatMap((p) =>
          p.items.map((i) => [
            p.number,
            i.description,
            i.partNumber,
            i.quantity,
            i.unitPrice,
            cents(i.quantity * i.unitPrice),
            p.supplier,
            p.department,
            p.priority,
            typedDate(p.neededBy),
          ]),
        ),
      ],
      currency: [4, 5],
    },
    {
      name: "Approvals",
      rows: [
        [
          "Request ID",
          "Revision",
          "Role",
          "Approved by",
          "Approved at (Eastern)",
          "Note",
        ],
        ...purchases.flatMap((p) =>
          p.approvals.map((a) => [
            p.number,
            a.revision,
            ROLE_NAMES[a.role],
            a.actorName,
            typedDate(a.at, true),
            a.note,
          ]),
        ),
      ],
    },
    {
      name: "Activity",
      rows: [
        [
          "Request ID",
          "Action",
          "Actor",
          "Date and time (Eastern)",
          "Revision",
          "Note",
        ],
        ...workspace.audit
          .filter((a) => ids.has(a.requestId))
          .map((a) => [
            purchases.find((p) => p.id === a.requestId)?.number,
            a.action,
            a.actorName,
            typedDate(a.at, true),
            a.revision,
            a.note,
          ]),
      ],
    },
    {
      name: "Export details",
      rows: [
        ["Setting", "Value"],
        ["Exported at (Eastern)", typedDate(new Date().toISOString(), true)],
        ["Tab", filters.view],
        ["Requests", purchases.length],
        ["Search", filters.search],
        ["Status", filters.status || "All"],
        ["Department", filters.department || "All"],
        ["Priority", filters.priority || "All"],
        ["Order stage", filters.fulfillment || "All"],
        ["Date field", DATE_FIELDS[filters.dateField]],
        ["From (inclusive)", typedDate(filters.from)],
        ["Through (inclusive)", typedDate(filters.to)],
        ["Overdue only", filters.overdueOnly],
        ["Sort", `${filters.sortField} ${filters.direction}`],
        ["Amounts", "USD"],
        ["Time zone", "America/New_York"],
        [
          "Line item values",
          "Line total excludes request-level freight and tax. Request totals are on Requests.",
        ],
      ],
      widths: [28, 90],
    },
  ];
}
