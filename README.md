# pi-model-picker

A categorized, keyboard-driven model selector extension for the [pi coding agent](https://github.com/badlogic/pi-mono). Fork of [rilham97/pi-model-picker](https://github.com/rilham97/pi-model-picker), with token costs, aligned metadata, and tab memory.

Models are grouped by inference provider in horizontal tabs. Press `Tab` or `Shift+Tab` to switch categories. Type to filter within a category and navigate with `↑`/`↓`.

## Preview

```
───────────────────────────────────────────────────────────────────
  Select Model
───────────────────────────────────────────────────────────────────
  Anthropic │ Antigravity │ Fireworks │ Openrouter │ Xai
───────────────────────────────────────────────────────────────────
  Search: > claude_

▶ Claude Sonnet ●                      $3/$15  200k  thinking  vision
  Claude Opus                          $5/$25  200k  thinking  vision

  (1/2) claude-sonnet
───────────────────────────────────────────────────────────────────
  ↑↓ / Enter select · Tab provider · Ctrl+F fuzzy · Esc/Ctrl+C cancel
───────────────────────────────────────────────────────────────────
```

- **Active model** shown with `●` and highlighted in green
- **Context window** shown as `200k`, `1M`, etc.
- **Capability tags**: `thinking` (extended reasoning), `vision` (image input)
- **Search** filters by model name or id within the current category
- **Search term preserved** per category — switch away and back, your query is still there
- **Wraparound navigation** — `↑` on the first item jumps to the last, and vice versa

## Install

This fork is not on npm — the `pi-model-picker` npm package is the upstream release. Install this version from git.

### Via pi package manager (recommended)

```bash
pi install git:github.com/JangMan-J/pi-model-picker
```

Restart pi after installation. `pi update --extensions` pulls the latest commits.

### Manual

```bash
git clone https://github.com/JangMan-J/pi-model-picker.git \
  ~/.pi/agent/extensions/model-picker
```

Restart pi.

## Usage

| Trigger | Description |
|---------|-------------|
| `/models` | Open the categorized picker |
| `Ctrl+Shift+M` | Keyboard shortcut (default, configurable) |

> **Note:** `/model` is a built-in pi command and cannot be overridden. Use `/models` (with an `s`) for this picker. The built-in `/model` (flat search) continues to work as normal.

### Configuring the shortcut

By default the picker binds `Ctrl+Shift+M`. Override it in `~/.pi/agent/settings.json`:

```json
{
  "pi-model-picker": {
    "shortcut": "ctrl+l",
    "rememberLastTab": true
  }
}
```

`shortcut` accepts:

- a single key string, e.g. `"ctrl+l"`
- an array of key strings to bind multiple keys, e.g. `["ctrl+l", "ctrl+shift+m"]`
- `false` to disable the shortcut entirely (the `/models` command still works)

See pi's [keybindings docs](https://github.com/badlogic/pi-mono) for the key identifier format (`ctrl`, `shift`, `alt` modifiers combined with letters, digits, or symbols).

Restart pi (or run `/reload`) after changing `settings.json`.

### Last tab

`rememberLastTab` accepts `true` or `false` and defaults to `true`.
The picker remembers the provider tab after selection or cancellation.
This state stays in memory while pi is running. Restarting pi or using `/reload` clears it.
No state file is used. Search text is not saved.

With `rememberLastTab: false`, the picker always starts on the current model's provider tab.
If the saved tab is unavailable, the picker uses the current model's tab.

### Global fuzzy search

`Ctrl+F` toggles fuzzy search across all providers while preserving the query.

## Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate models (wraps around) |
| `Shift+↑` / `Shift+↓` | Move up / down 10 models, stopping at the first or last result |
| `Ctrl+F` | Toggle provider-scoped search / global fuzzy search |
| `Tab` / `Shift+Tab` | Switch category, or jump between matching providers in fuzzy mode |
| `←` / `→` | Switch category when scoped search is empty; otherwise move the text cursor |
| Type | Filter the current category, or fuzzy-search all providers |
| `Enter` | Select highlighted model and save it as the default for new sessions |
| `Esc` / `Ctrl+C` | Cancel |

Each successful selection saves the provider and model in Pi's global settings.
It preserves other settings, including the default thinking level.

## How it works

The picker calls `modelRegistry.refresh()` then `modelRegistry.getAvailable()` — the same data source as pi's built-in `/model` command. Only models with auth configured (API key or OAuth) are shown. Models are grouped by their `provider` field and sorted alphabetically within each category, with the currently active model's provider appearing first.

## Uninstall

```bash
pi remove git:github.com/JangMan-J/pi-model-picker
rm -rf ~/.pi/agent/extensions/model-picker
```

## License

MIT
