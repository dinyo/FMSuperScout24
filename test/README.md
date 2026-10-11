# Tests

Zero-dependency tests (`node:test`) for frontend models, English-only labels, FMF import/export,
and team classification.

```bash
npm test        # or: node --test test/*.test.js
```

## How it works

The frontend uses ordered classic scripts, so it is not a module that can be simply `require`d.
`harness.js` reads the script order from `app/index.html`, runs the actual source in a function
scope with no-op browser APIs, and returns selected functions for the tests. That way a model
change that breaks behavior is checked against the real app code.

## Recalibrating the value model

The automatic calibration set (`value-history.json`) was removed (15-07) because the real value now
comes straight from memory and the estimation model is on point. If the estimation model ever needs
recalibrating, temporarily restore the collection in `app/server.js` (see the
git history of `archiveValues`). The current tests check *invariants* (value does not drop
with more reputation, potential stays ≤ 20, and so on).
