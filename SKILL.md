---
name: model-picker
description: Categorized model selector for pi. Use /models or Ctrl+Shift+M to open a TUI picker that groups available models by provider. Tab or ← → to switch categories, ↑↓ to navigate, type to search within a category, Ctrl+F for global fuzzy search, Enter to select and save the startup default.
license: MIT
compatibility: Requires pi coding agent with auth configured for at least one model provider.
metadata:
  author: rilham97
  version: "1.0.0"
---

# Model Picker

Open the categorized model picker with `/models` or `Ctrl+Shift+M`.

## Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate models (wraps around) |
| `Shift+↑` / `Shift+↓` | Move ten results, stopping at either end |
| `Ctrl+F` | Toggle scoped search / global fuzzy search, carrying the query |
| `Tab` / `Shift+Tab` | Switch category, or jump between matching providers in fuzzy mode |
| `←` / `→` | Switch category when scoped search is empty; otherwise move the text cursor |
| Type | Filter the current category, or fuzzy-search all providers |
| `Enter` | Select highlighted model and save it as the startup default |
| `Esc` | Cancel |
