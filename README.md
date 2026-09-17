# pi-model-picker

A categorized, keyboard-driven model selector extension for the [pi coding agent](https://github.com/badlogic/pi-mono).

Models are grouped by provider or creator in horizontal tabs. Press `Tab` to switch grouping and `←`/`→` to switch categories when search is empty. Type to filter within a category and navigate with `↑`/`↓`.

## Preview

```
Group: providers | creators
tab group (providers/creators)
───────────────────────────────────────────────────────────────────
  OpenAI │ Anthropic │ Google │ Meta │ Open Weights │ Other
───────────────────────────────────────────────────────────────────
  Search: > claude_

▶ [anthropic]  Claude Sonnet ●          $3/$15  200k  thinking  vision
  [openrouter] Claude Sonnet            $3/$15  200k  thinking  vision

  ↑↓ navigate  ·  ← → category  ·  enter select  ·  esc cancel
```

- **Active model** shown with `●` and highlighted in green
- **Context window** shown as `200k`, `1M`, etc.
- **Capability tags**: `thinking` (extended reasoning), `vision` (image input)
- **Search** filters by model name or id within the current category
- **Search term preserved** per category — switch away and back, your query is still there
- **Wraparound navigation** — `↑` on the first item jumps to the last, and vice versa

## Install

### Via npm (recommended)

```bash
npm install -g pi-model-picker
pi-model-picker
```

Restart pi after installation.

### Via pi package manager

```bash
pi install npm:pi-model-picker
```

### Via git

```bash
pi install git:github.com/rilham97/pi-model-picker
```

### Manual

```bash
git clone https://github.com/rilham97/pi-model-picker.git \
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
The picker remembers the tab and grouping mode after selection or cancellation.
This state stays in memory while pi is running. Restarting pi or using `/reload` clears it.
No state file is used. Search text is not saved.

With `rememberLastTab: false`, the picker always starts on the current model's provider tab.
If the saved tab is unavailable, the picker uses the current model's tab.

## Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate models (wraps around) |
| `Tab` / `Shift+Tab` | Switch between provider and creator grouping |
| `←` / `→` | Switch category (when search field is empty) |
| `←` / `→` | Move cursor in search field (when field has text) |
| Type | Filter models in the current category |
| `Enter` | Select highlighted model |
| `Esc` | Cancel |

## How it works

The picker calls `modelRegistry.refresh()` then `modelRegistry.getAvailable()` — the same data source as pi's built-in `/model` command. Only models with auth configured (API key or OAuth) are shown. Models are grouped by their `provider` field and sorted alphabetically within each category, with the currently active model's provider appearing first.

## Uninstall

```bash
pi remove npm:pi-model-picker
rm -rf ~/.pi/agent/extensions/model-picker
```

## License

MIT
