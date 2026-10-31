# Live check (GitHub Actions, 2026-10-31T01:38:41.834Z)

Real API responses parsed by the app's own provider code (no mocks). Re-run by pushing to the branch.

## coinbase

- OK in 112 ms · 42 quotes · missing: none
- USD→JPY 157.592037235 (observedAt null (not published), receivedAt 2026-10-31T01:38:41.942Z, kind indicative, estimated)
- USD→THB 33.7485
- JPY→THB cross 0.214151048442 (estimated) → 1000 JPY = 214.15 THB

## open-er-api

- OK in 105 ms · 42 quotes · missing: none
- USD→JPY 157.494371 (observedAt 2026-10-31T00:02:31.000Z, receivedAt 2026-10-31T01:38:42.050Z, kind indicative, estimated)
- USD→THB 33.744351
- JPY→THB cross 0.214257505114 (estimated) → 1000 JPY = 214.26 THB

## frankfurter

- OK in 323 ms · 27 quotes · missing: TWD, VND, LAK, KHR, MMK, AED, SAR, KWD, BHD, OMR, JOD, CLP, EGP, LKR, NPR
- USD→JPY 157.25 (observedAt 2026-10-30T00:00:00Z, receivedAt 2026-10-31T01:38:42.373Z, kind indicative, estimated)
- USD→THB 33.73
- JPY→THB cross 0.214499205087 (estimated) → 1000 JPY = 214.50 THB

## frankfurter history (30 days JPY→THB)

- 22 daily points from 2026-10-01 to 2026-10-30 (working days only) · last: {"THB":0.2145}

## ISO 4217 list one vs currencies.ts

- 165 ISO entries · 43 app currencies checked · mismatches: none · not in ISO list: none
