# SEIKO Catalog

Catalog replaces the old local Product Library. A main product groups its variants; colour, design, specification and measurement definitions distinguish variants. Explicit abbreviations are attached to a main product. Case and spacing differences do not create separate learned variants. Ambiguous abbreviations cannot be assigned to another parent.

Catalog can be maintained without an order: add products, variants, specifications, measurements, price options and shared reference images. Named sets contain garment variants with quantities and alternatives. One set may have several price options. Catalog uses the existing shared artwork service; thumbnails appear beside variants, in the picker and in order setup for linked products.

Saved order definitions contribute Catalog variants and named pricing sets. Learning excludes person records and actual measurements. It adds observations and source-order references without replacing manual Catalog edits. Changes made in an order do not update other orders. Archived Catalog records are not reactivated by learning.

Add From Catalog copies definitions into the order with fresh IDs, and reuses already-linked variants. Pricing is optional. Class or other price conditions are remapped by exact person-detail name; a missing or ambiguous field blocks the price import. Alternative garments start with quantities entered per person, avoiding accidental assignment to everyone. Configure recipient/quantity rules in setup as needed.

The shared endpoint checks business permissions, hides rates without financial access, protects rate changes, and uses optimistic versions for manual edits. Existing browser product names and prices are adopted. Learning retries on subsequent order-cache/focus events after a connection failure; it does not block order saving. Catalog changes do not rewrite invoices or order prices.

Checks: `node --test tests/garment-catalog.test.mjs`, `node tests/catalog-browser.cjs` and the full repository suite. The browser test uses local fixtures and mocked services, including image uploads, without touching live business records.
