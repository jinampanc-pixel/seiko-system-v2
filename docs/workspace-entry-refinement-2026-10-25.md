# Workspace entry refinement - 25 October 2026

The measurement grid previously grouped any field with a shared storage key into a shared row, even after setup restricted it to one product. Entry now uses the current product associations for display while preserving every existing field key and saved value. Fields shared between several products name those products; unassigned fields are omitted. Rule source lists follow the same active associations.

The entry form begins closer to the workspace title and controls. The Type/Speak selector lives in the form. The assigned product/colour summary remains visible. Required person details prevent empty saves; configured required measurements show an incomplete warning rather than losing a partially measured person. Missing details needed to resolve quantity or colour rules are requested before entry continues. Existing order requirements are preserved, not silently rewritten.

An optional Keep group checkbox retains dropdown details for successive new people. It never copies names or measurements. Enter moves through inputs and skips retained dropdowns, which remain editable by click or Tab. Ctrl/Cmd+Enter saves and opens the next person. Existing Save & next continues through the filtered list. Alt/Option+M and a single Speak control remain available. Focused fields are scrolled clear of the sticky action bar.

Order normalization, sheet-column generation and person filtering are memoized instead of repeated for each keystroke. Background focus/timer synchronization defers while a person form is open; a save still validates against the current Sheet and reports conflicts. No optimistic success or deferred unsaved queue is introduced.

Setup condition inputs sit side by side on wider screens, with explicit result labels and boundaries between rules. Removing a condition remains local; Remove rule is labelled. Dropdown type labels are shortened to avoid clipping and option removal controls fit their chips. Pricing collapse is retained.

Validation uses synthetic order/Sheet data, including separate product lengths, a formerly shared single-product field, a genuinely shared waist, colour matching, repeat-group saves, keyboard navigation, field clearing and preserved Sheet aliases. Real order records and the user's open browser draft are not changed. Chromium responsive checks do not establish physical Safari/phone keyboard behaviour.
