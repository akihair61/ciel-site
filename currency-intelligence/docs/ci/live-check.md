# Live check (GitHub Actions, 2026-10-29T02:35:59.335Z)

Real API responses parsed by the app's own provider code (no mocks). Re-run by pushing to the branch.

## coinbase

- OK in 145 ms · 42 quotes · missing: none
- USD→JPY 157.6525606066666667 (observedAt null (not published), receivedAt 2026-10-29T02:35:59.478Z, kind indicative, estimated)
- USD→THB 33.7275
- JPY→THB cross 0.213935630796 (estimated) → 1000 JPY = 213.94 THB

## open-er-api

- OK in 105 ms · 42 quotes · missing: none
- USD→JPY 157.90537 (observedAt 2026-10-29T00:02:31.000Z, receivedAt 2026-10-29T02:35:59.584Z, kind indicative, estimated)
- USD→THB 33.772095
- JPY→THB cross 0.213875531909 (estimated) → 1000 JPY = 213.88 THB

## frankfurter

- OK in 261 ms · 27 quotes · missing: TWD, VND, LAK, KHR, MMK, AED, SAR, KWD, BHD, OMR, JOD, CLP, EGP, LKR, NPR
- USD→JPY 157.96 (observedAt 2026-10-28T00:00:00Z, receivedAt 2026-10-29T02:35:59.846Z, kind indicative, estimated)
- USD→THB 33.775
- JPY→THB cross 0.213819954419 (estimated) → 1000 JPY = 213.82 THB

## frankfurter history (30 days JPY→THB)

- 22 daily points from 2026-09-29 to 2026-10-28 (working days only) · last: {"THB":0.21382}

## ISO 4217 list one vs currencies.ts

- 165 ISO entries · 43 app currencies checked · mismatches: none · not in ISO list: none
