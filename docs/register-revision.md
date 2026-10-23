# Purchasing register revision

The `spreadsheet-interface` branch is based on original `main` commit `5539caff99c138879e9fbccedccfd4a2a139ef62`. The original branch and app remain available. The register has a new hosting identity and separate D1/R2 data.

## Behavior

Top tabs replace the sidebar. The default view is a full-width purchase register with larger request text. Reports & exports and project/sample notices are removed from the interface. Every retained tab exports a native Excel workbook.

Priorities are Low, Medium, and High. A data-only migration converts Normal to Medium and Rush to High, including archived revision snapshots. Approval routes and financial thresholds remain unchanged.

Date ranges are inclusive and use the selected date field. Missing dates sort last in either direction. UTC instants are converted to Eastern calendar dates for comparisons. A request is overdue the day after its needed-by date unless it is rejected or received. The business date refreshes every minute and when the browser tab becomes visible.

Excel exports include all matching rows in the current order. They use typed amounts/dates, filterable tables, banded rows, frozen headings/identifiers, and dynamic overdue formatting. User strings cannot become formulas or external links. Request totals appear once per request. Line-item totals exclude request-level freight and tax.

## Verification

38 automated checks cover the prior domain and API behavior plus priorities, date inclusivity, Eastern midnight boundaries, missing-date sorting, priority order, combined filters, export scope, ZIP checksums, workbook structure, literal-string safety, empty exports, and idempotent priority conversion.

Browser QA is unavailable because the managed Sites preview supervisor mailbox is absent. The available verification includes typed checks, API-handler tests, a production build, local migrations, and independent workbook inspection. Report this limit at handoff.
