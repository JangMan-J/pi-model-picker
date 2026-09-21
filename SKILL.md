---
name: model-picker
description: Categorized model selector for pi. Use /models or Ctrl+Shift+M to open a TUI picker that groups available models by provider. Tab or ← → to switch categories, ↑↓ to navigate, type to search within a category, Enter to select and save the startup default.
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
| `Tab` / `Shift+Tab` | Switch provider category |
| `←` / `→` | Switch category (when search field is empty) |
| Type | Filter models in the current category |
| `Enter` | Select highlighted model and save it as the startup default |
| `Esc` | Cancel |
