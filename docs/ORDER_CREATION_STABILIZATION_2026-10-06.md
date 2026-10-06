# Order creation stabilization — 6 October 2026

Home's New order action now sends a direct intent to the React application instead of opening the menu and clicking Orders through timed DOM queries. Setup retains the top product action and adds an Add product button below the final product. Both Create workspace controls disable while a shared save is pending.

New, unsaved setup changes keep one recovery draft per business in the current browser's local storage. Opening New order resumes that unfinished draft. The copy is removed after the server acknowledges creation. This is a device-local draft, not a D1 save or a backup; storage failures are reported. Existing workspace editing and server conflict checks remain unchanged.

Order API requests detect manual authentication redirects, including opaque redirects, before following an external login destination. This distinguishes an expired login from a rejected network request while preserving the open order. The screenshot's generic network error alone does not establish the cause of the original installed-app failure. Details held only in a deleted or closed older app window have not been recovered by this change.

Validation: clean dependency installation; 278 contract/runtime tests, production build and 3 render tests; changed-file lint with no errors and existing warnings. The real browser smoke uses the actual order API against isolated SQLite and proves direct Home creation, the bottom product control, six-product draft recovery after a failed request and reload, authentication redirects, and successful retry. Existing Save & Close, status, billing, archive/delete and fresh-browser workflows also pass.

On this Windows test environment, use a writable workspace temporary directory for tests: the sandbox's default temporary directory rejected atomic file renames. An isolated Playwright browser was used after installed Edge failed to start its test profile. Run installation, browser tests and builds sequentially on this PC.
