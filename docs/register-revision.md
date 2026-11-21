# Spreadsheet interface revision (V2)

The historical [spreadsheet-interface branch](https://github.com/AverySteffensen/Fuji-Project/tree/spreadsheet-interface) records the change from the original sidebar to a tabbed purchasing register. It started from [commit 5539caf](https://github.com/AverySteffensen/Fuji-Project/commit/5539caff99c138879e9fbccedccfd4a2a139ef62) and used its own hosted database and file storage. For current behavior and test results, see the [README](../README.md) and the [V5 verification record](verification.md).

## Interface changes in V2

- The purchase register became the default view, with one row per request and sortable column headings. Top tabs replaced the sidebar. Each retained tab offered an Excel download, and the separate Reports & exports screen was removed.
- A data migration converted Normal priority to Medium and Rush to High, including priorities saved in earlier revisions. The new priority choices were Low, Medium and High. The approval routes and financial thresholds stayed the same.
- Date filters included both ends of the selected range. Missing dates sorted last in either direction. The app used Eastern calendar dates and refreshed the business date every minute and when a browser tab became visible. Overdue highlighting began the day after a request was needed and excluded rejected or received purchases. V5 also excludes withdrawn requests.
- Excel downloads included every matching row in the selected order, with numeric amounts, typed dates, filterable tables, frozen headings and overdue formatting. Text remained literal. The Requests sheet showed each request total once. Line-item totals excluded request-level freight and tax.

## Verification at the time

The V2 suite contained 38 checks covering the purchase workflow, priority migration, date boundaries, sorting, filtering and workbook output. The review also included type checking, a production build, local migrations and independent workbook inspection. Interactive browser testing was pending at that revision.
