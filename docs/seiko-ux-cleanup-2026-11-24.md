# SEIKO UX cleanup — 24 November 2026

## Working screens and guidance

Removed routine teaching paragraphs and captions from order setup, person entry,
production, labels, billing, settings, recovery and the business work areas.
Guidance now belongs in the searchable **Help & Training** menu module. Required
field labels, actual record values, errors, incomplete-data warnings and destructive
action confirmations remain in their working context.

## Home

Customization lives in Settings → Home. It controls the starting order view,
visible row count, sort order, section visibility, daily actions and their ordering,
and Quick Access visibility and ordering. Legacy disabled shortcut preferences are
preserved. An empty Quick Access section disappears entirely. An empty scan queue
can be hidden. Preferences remain specific to the device.

## Documents

Invoices, receipts, production handoffs and handover lists have optional notes.
Disabled or whitespace-only notes have no printed Notes section. Existing billing
records with nonempty notes and no explicit visibility flag keep their historical
visibility. Receipt notes belong to the receipt rather than repeating invoice notes.
Production and order-payment APIs retain the notes visibility setting when saving.
Printing and the pending shared-save outbox remain independent.

## Menus and entry controls

Menus and record detail popovers no longer close merely because the pointer leaves
the trigger, focus moves, or the browser loses focus. Outside clicks and Escape
dismiss them. Anchored transient menus can reset on resize or when their virtual
record anchor is recycled. The person editor uses **Close Entry** for closing the
editor and **Delete Entry** for recoverable removal.

An explicitly selected person whose Sheet row was already removed can now be
deleted into restorable trash using the last confirmed snapshot. Stale expected
values, unknown identities and linked production/delivery/billing history still
block deletion. Ordinary Sheet synchronization continues to reject unexplained
missing rows rather than silently deleting people.

## Mobile

The application explicitly declares device width and initial scale 1 without
restricting pinch zoom. The browser audit fixture has the same viewport and CSS
imports, and supports touch-device emulation; narrowing a desktop browser alone
does not test mobile scaling. Phone layouts use compact shortcut cards, an icon
assistant launcher, screen-sized settings/dialogs, grouped preview controls and
shorter copy options. Home shortcuts are not displayed beneath the billing surface.
Typing focus and user pinch zoom remain available. Print canvases retain their
document dimensions and fit within the preview independently of the app viewport.

## Verification

The validation record includes contract/runtime checks, a production build and
built-route rendering, interactive workflow tests, and responsive audits covering
360, 390, 430, 768, 1024 and 1366 CSS pixels. Mobile-specific checks verify the
viewport and actual layout width in a touch-enabled browser. Screenshots are
reviewed for layout issues that numeric overflow checks alone can miss.
