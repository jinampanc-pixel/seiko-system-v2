# Order rules and interface review - 25 October 2026

Keep Class and Gender as separate person details. In a product specification choose Different by group, then All conditions for each result:

| Class | Gender | Colour |
| --- | --- | --- |
| 11 | Male | Blue Milange |
| 9, 10 | Male | Gray |
| 11 | Female | Maroon |
| 9, 10 | Female | Carrot |

All conditions means AND; Any condition means OR. Matching accepts lists, numeric ranges and case-insensitive text. Each rule supports up to eight conditions. Additional rules can express several alternatives for the same result. Sources include person details, individual specifications and measurements; calculated results cannot create rule cycles. The same predicates support quantities, specifications, conditional measurement requirements and pricing. Conflicts are rejected; missing details remain pending. Arbitrary expressions and nested condition groups are not supported.

An individual override takes precedence over the order rule/default. Clearing it restores automatic calculation. Existing explicit assignments are preserved when upgrading an order. Structured orders expose editable quantity/specification overrides and separate calculated result columns in Sheets. Results and count formulas refresh on app save or sheet synchronization. Direct edits to calculated cells are ignored. Existing person rows are retained when adding columns.

Workspace entry recalculates source-detail changes without freezing automatic results as exceptions. Save & next continues through existing people. Production, lookup, labels and billing share resolution functions. Actual quantities remain counted when colours are pending; unsafe label output is withheld. Issued invoices retain their snapshot and require reviewed amendment.

UI repairs: pricing cards collapse individually, expanded product headings lose their gold fill, quantity guidance sits beside its control, client/person cards align at the top, and condition controls wrap on narrow screens. Dialogs close on outside click or Escape using their existing close action. Dragging from inside to outside does not dismiss. Focus stays in the dialog and returns to the opener. Saving/uploading/preparing prevents dismissal; failed saves retain input.

Validation covers matching, conflicts, override clearing, conditional requirements, Sheet round trips, billing, label safety, sequential entry, pricing collapse and dialog interactions. The responsive audit checks 204 screen/viewport combinations in Chromium. Physical iPhone/Safari and microphone quality were not tested.
