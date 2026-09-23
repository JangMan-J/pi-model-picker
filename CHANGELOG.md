# Changelog

## Unreleased

- Report an incomplete installation and fail the command if an extension file cannot be copied
- Keep rendered lines within the terminal width during very narrow resizes
- Use Pi's agent-directory resolver so tilde paths and empty overrides follow Pi's settings behavior
- Preserve custom colon-qualified model names unless the prefix identifies the provider or model ID namespace
- Give the selected provider tab a themed background highlight in scoped and fuzzy search
- Align bracketed providers by the longest fuzzy match name and show the selected model's full ID beside the counter
- Remove maker prefixes from model display names while keeping version and variant information
- Add Ctrl+F global fuzzy search with ranked results, provider labels, and matching-tab highlights
- Omit redundant trailing provider annotations such as `(Antigravity)` from model labels
- Always show the selected position and filtered total as `(5/43)`, or `(0/0)` for no results
- Add Shift+Up/Down to move ten models at a time within the filtered list
- Save each selected model as the default for new sessions
- Show compact action and navigation hints on one footer row
- Remove creator grouping and its shortcut; keep provider tabs only
- Restore the Select Model header and Tab/Shift+Tab category navigation
- Restore upstream tab creation and naming: one tab per provider, with no provider-specific exceptions

## 1.2.0 — 2026-09-17

- Show token costs and aligned model metadata in picker rows
- Switch between provider and creator grouping with `Tab`
- Remember the last grouping and tab while pi is running
- Keep a fixed 10-row picker height across tabs and searches

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
