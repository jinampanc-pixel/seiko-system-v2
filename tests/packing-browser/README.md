# Packing editor regression checks

`npm ci` and `npm test` run the order, geometry and font-fitting regressions,
the repository contracts, the production build, and rendered-route checks.

The 390-row fixture stores garment quantities only. Names, measurements and
other personal information are excluded. Expected piece totals are 383, 298,
87, 267, 249 and 247; the Shirt/Pant intersection contains 63 people.

For the browser checks, make the `playwright` package available (or set
`PLAYWRIGHT_MODULE` to an installed package directory). Run these commands in
separate terminals from the repository root:

```sh
npx vite --config tests/packing-browser/vite.config.mjs
node tests/packing-label-browser.cjs
```

The test launches its own headless Edge instance. Set `PLAYWRIGHT_CHANNEL` to
another installed Chromium channel when needed. It uses an isolated context,
an anonymized fixture and the production component/styles; it does not access
live orders or existing browser sessions. Screenshots and PDFs go under the
ignored `work/` directory.

Coverage: AND filtering and predicted counts; eligible-only search; manual
selection; Cancel/Apply; saved-set restoration; bounded virtualized records;
preview numbering; drag and resize; snapping and bounds; keyboard movement;
undo/redo; zoom/fit; mobile sizing; preview/print text and font parity; 63 output
labels on 32 physically sized two-label pages.

Print labels at 100% / actual size. The existing stock uses two 50 × 25 mm
labels separated by 4 mm, so the PDF page is 104 × 25 mm. The editor shows a
1 mm safety margin. Browser PDF geometry is tested; physical printer calibration
is separate from the editor's millimetre layout.
