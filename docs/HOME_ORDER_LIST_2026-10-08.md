# Home order list — 2026-10-08

Home now sorts matching orders by their persisted updatedAt timestamp, newest first, with a stable order-ID tie break. Active/completed scope and status changes remain unchanged.

The operational list has a persistent Search field and button. Case-insensitive, space-separated terms search the same order across its ID, client/order details, status, configured fields, products, measurements and person records. Existing client type, product and status filters still apply.

The saved 5/10/20 row preference controls the scroll viewport. Previous/Next pagination is removed from Home only. A fixed-height virtual window renders at most the selected row count plus four overscan rows, including on mobile. All matching orders remain reachable by scrolling. Search/filter/viewport changes reset scroll to the beginning.

Validation: full contract suite, production build and rendered tests; Chrome regression with 1,001 synthetic orders / 100,001 records covers newest-first server save order, scroll to oldest, record-value search, no-match feedback, row preference, desktop/mobile bounded rendering, and existing Order Center search/pagination. Production business records are not used by the test.
