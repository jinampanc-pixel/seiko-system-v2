# Interface Capitalization Audit

## Convention

Use Title Case for authored headings, buttons, menus, field labels, table headings and short status labels. Keep connecting words such as “and”, “for” and “of” lowercase within a title. Preserve acronyms and measurement units. Instructions and full explanatory sentences retain sentence case.

Apply the convention to source copy, including generated document HTML and DOM/CSS-authored captions. Do not globally transform rendered text: customer names, notes, specifications, measurements, imported records and configurable document wording must retain their entered spelling.

## Scope

Reviewed shared navigation, authentication and access, Home, order setup and workspaces, person entry, quantities and rules, labels and their designers, production, delivery, billing and payment previews, settings, backup/recovery, activity and the other business screens. Existing Seiko colours, logo and document layout remain in use.

Status formatting is display-only. For example, `part_paid` displays as “Part Paid”; API payloads and persisted status codes do not change. Invoice footers display “Payment Status: Issued” or the appropriate current status. Document labels and receipt allocation labels follow the same convention.

Text-based UI adapters and selectors are updated alongside authored copy. Case-independent matching prevents capitalization differences from disabling a shortcut. Behavioral browser selectors also normalize surrounding whitespace, while financial, identity and persistence assertions continue checking their actual values.

## Regression Coverage

The billing rendering test checks Issued, Part Paid and Paid footer labels, unchanged billing codes, unchanged entered names/notes and unchanged inputs. The repository contract, build, rendered HTML, lint and browser workflow checks provide broader regression coverage. This is a source-wide copy review with representative browser workflows; it does not rewrite historical customer-entered text or configurable wording already stored in records.
