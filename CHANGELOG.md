# Changelog

## 1.1.0 — 2026-07-02

- Keyboard shortcut is now configurable via `~/.pi/agent/settings.json` (`pi-model-picker.shortcut`)
  - Accepts a string, an array of strings (binds multiple keys), or `false` to disable
  - Defaults to `Ctrl+Shift+M` when unset

## 1.0.0 — 2026-02-25

Initial release.

- Categorized model picker grouped by provider
- Tab / ← → to switch categories
- Per-category search field (preserves query when switching categories)
- ↑ / ↓ navigation with wraparound
- Active model highlighted with ● marker
- Model metadata: context window size, `thinking` and `vision` tags
- `/models` command and `Ctrl+Shift+M` shortcut
- Uses same data source as built-in `/model` (`modelRegistry.refresh()` + `getAvailable()`)
