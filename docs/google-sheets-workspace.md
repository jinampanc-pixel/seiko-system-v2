# Google Sheets order workspace

After order setup, open its workspace. Once the owner has connected Google Sheets, the app creates one spreadsheet for the order and copies existing person records into its People tab. Linked orders use that sheet for person details, sizes, measurements, status, batches and assigned product quantities. Order setup, agreed prices, deliveries, client queries and issued financial documents remain in the app.

Add supplementary people on new rows in People. Enter their person details and leave Record ID and Person ID blank: the next sync assigns stable IDs. Do not copy another person's IDs. Mark withdrawn people Cancelled and keep their row so delivery, query and billing history stays attached. Hold and Awaiting are also available. Quantities are individual product pieces, not pairs or package prices.

The app checks the sheet when opening its workspace, on returning focus, once a minute while visible and when explicitly syncing. Current production, labels and invoice reconciliation require a successful check. If a built report has changed source records, printing stops and asks you to rebuild it. Invalid or missing rows do not replace the last confirmed app records. Issued invoices and production handoffs retain their historical snapshots; use reviewed billing adjustments and explicit handoff revisions for changes.

Find person is available in app navigation, including Billing. Search names, IDs, phone numbers or another saved field across orders. Search uses the last validated app records; opening a known person checks their linked sheet and displays details in the app. A new person entered in Sheets becomes searchable after syncing that order. Google Sheets opens only when its explicit link is selected. Financial information is shown only with financial-view permission.

Order setup controls the required columns. After adding a product, field or measurement, choose Update sheet columns from order setup. This appends columns and preserves person cells. Do not remove or reorder the first two identity columns or the three header rows.

## One-time owner/server setup

1. In the owning Google Cloud project enable Google Drive API and Google Sheets API. Configure an OAuth web client and consent screen. For a testing app, add the owner's Google account as a test user; testing authorization may require periodic reconnection.
2. Register this exact authorized redirect URI:
   `https://seiko-system-v2-app.jinampanc.workers.dev/api/erp/order-sheets/callback`
3. Set Worker secrets `GOOGLE_SHEETS_CLIENT_ID`, `GOOGLE_SHEETS_CLIENT_SECRET`, and a random `JINAM_CONNECTOR_ENCRYPTION_KEY` of at least 32 characters. Existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are fallbacks only if their web client supports this redirect. Never put secrets in browser settings or Git.
4. Open an order workspace as owner, select Connect Google Sheets, and consent with the business's Google account. Access is limited to files this OAuth app creates or opens (`drive.file`). Share each created spreadsheet in Google Drive with the people who will edit it.

The app stores its refresh token encrypted in shared storage. Keep the encryption key and OAuth client in the owner's secret recovery system. Portable business backups retain public spreadsheet links with orders; they do not export connector credentials. After a restore, reconnect the same Google account with the same OAuth client before syncing. Existing sheets are recovered rather than reset.

Google setup references: https://developers.google.com/identity/protocols/oauth2/web-server and https://developers.google.com/workspace/sheets/api/scopes
