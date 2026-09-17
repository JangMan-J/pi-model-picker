// Run: node scripts/test-maker-tabs.mjs <typescript.js> <pi-tui/dist/index.js>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ts = (await import(pathToFileURL(process.argv[2]))).default;
const tui = await import(pathToFileURL(process.argv[3]));
const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default function', 'function');
let settingsText = '{}';
let settingsExists = true;
let stateText;
let stateReads = 0;
let stateWrites = 0;
let writeFails = false;
const { Picker, maker, register, resolve } = vm.runInNewContext(
  ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText +
  '\n({ Picker: ModelPickerComponent, maker: modelMaker, register: modelPickerExtension, resolve: resolveShortcuts });',
  {
    ...tui, join, homedir: () => '/test-home',
    readFileSync: path => {
      if (path.endsWith('/settings.json')) {
        if (!settingsExists) throw new Error('missing settings');
        return settingsText;
      }
      assert.equal(path, '/test-home/.pi/agent/pi-model-picker-state.json');
      stateReads++;
      if (stateText === undefined) throw new Error('missing state');
      return stateText;
    },
    writeFileSync: (path, text) => {
      assert.equal(path, '/test-home/.pi/agent/pi-model-picker-state.json');
      if (writeFails) throw new Error('permission denied');
      stateText = text;
      stateWrites++;
    },
    DynamicBorder: class { render(w) { return ['─'.repeat(w)]; } invalidate() {} },
  },
);
for (const [setting, fallback] of [['shortcut', 'ctrl+shift+m'], ['groupingShortcut', 'ctrl+shift+g']]) {
  for (const [value, expected] of [
    [undefined, [fallback]], [42, [fallback]], [true, [fallback]], [null, [fallback]], [{}, [fallback]],
    ['alt+g', ['alt+g']], [['alt+g', 'ctrl+shift+g', 1, ''], ['alt+g', 'ctrl+shift+g']],
    [false, []], [[], []], ['', []],
  ]) {
    settingsText = JSON.stringify({ 'pi-model-picker': { [setting]: value } });
    assert.deepEqual(Array.from(resolve(setting, fallback)), expected);
  }
  for (const text of ['{}', 'null', '{broken']) {
    settingsText = text;
    assert.deepEqual(Array.from(resolve(setting, fallback)), [fallback]);
  }
  settingsExists = false;
  assert.deepEqual(Array.from(resolve(setting, fallback)), [fallback]);
  settingsExists = true;
}
settingsText = '{}';
const toggle = '\x1b[103;6u'; // Kitty Ctrl+Shift+G
const theme = { fg: (_, text) => text, bold: text => text };
const model = (id, name, provider = 'openrouter') => ({
  id, name, provider, reasoning: true, input: ['text', 'image'],
  contextWindow: 200000, cost: { input: 3, output: 15 },
});
for (const providers of [['groq', 'openrouter'], ['groq', 'fireworks-dedicated', '供应商']]) {
  const fixtures = providers.map(provider => model('claude-sonnet', 'Claude Sonnet', provider));
  const p = new Picker({ allModels: fixtures, currentModel: fixtures[0], onSelect() {}, onCancel() {} });
  p.handleInput(toggle);
  const rows = p.render(120, theme).filter(line => line.includes('Claude Sonnet'));
  const expectedStart = 3 + Math.max(12, ...providers.map(provider => tui.visibleWidth(`[${provider}]`)));
  for (const row of rows) {
    assert.equal(tui.visibleWidth(row.slice(0, row.indexOf('Claude Sonnet'))), expectedStart, 'model names must share a padded provider column');
    assert.ok(tui.visibleWidth(row) <= 120);
  }
  assert.equal(rows.length, providers.length);
  const costs = rows.map(row => tui.visibleWidth(row.slice(0, row.indexOf('$3/$15'))));
  assert.equal(new Set(costs).size, 1, 'provider padding must preserve price alignment');
}
const cases = [
  ['openai/gpt-5', 'OpenAI: GPT-5', 'OpenAI'],
  ['o3', 'o3', 'OpenAI'],
  ['claude-sonnet', 'Claude Sonnet', 'Anthropic'],
  ['claude-sonnet', 'Claude Sonnet', 'Anthropic', 'antigravity'],
  ['google/gemma-3', 'Google: Gemma 3', 'Google'],
  ['gemini-3-flash', 'Gemini 3 Flash', 'Google', 'antigravity'],
  ['meta-llama/llama-4', 'Meta: Llama 4', 'Meta'],
  ['hf:deepseek-ai/DeepSeek-R1-Distill-Llama-70B', 'DeepSeek R1 Distill Llama', 'DeepSeek'],
  ['hf:Qwen/Qwen3-235B', 'Qwen3 235B', 'Qwen', 'synthetic'],
  ['accounts/fireworks/models/deepseek-v4', 'Custom alias', 'DeepSeek', 'fireworks'],
  ['hf:meta-llama/Llama-4', 'Custom alias', 'Meta'],
  ['nousresearch/hermes-llama-3', 'Hermes Llama', 'Other'],
  ['syn:large:text', 'syn:large:text', 'Other', 'synthetic'],
  ['kimi-k3', 'Kimi K3', 'Other', 'fireworks'],
  ['mystery', 'Mystery', 'Other', 'openai'],
];
for (const [id, name, expected, provider] of cases) assert.equal(maker(model(id, name, provider)), expected, id);
// Arbitrary versions must match prefixes, without an ID allowlist.
for (const [id, expected] of [
  ['gpt-99-new-variant', 'OpenAI'], ['claude-99-new-variant', 'Anthropic'],
  ['gemini-99-new-variant', 'Google'], ['llama-99-new-variant', 'Meta'],
  ['deepseek-v99-new-variant', 'DeepSeek'], ['qwen99-new-variant', 'Qwen'],
]) assert.equal(maker(model(`accounts/fireworks/models/${id}`, 'Custom alias')), expected);
for (const prefix of ['OpenAI', 'Anthropic', 'Google', 'Meta']) {
  for (const label of [`${prefix}: Example`, `${prefix.toLowerCase()}:Example`]) {
    const m = Object.freeze(model('example', label));
    const p = new Picker({ allModels: [m], currentModel: m, onSelect() {}, onCancel() {} });
    assert.ok(p.render(120, theme).some(line => line.includes(label)), 'provider view keeps original label');
    p.handleInput(toggle);
    assert.ok(p.render(120, theme).some(line => /\[openrouter\]\s+Example/.test(line)), `redundant maker prefix: ${label}`);
    assert.equal(m.name, label, 'display cleanup must not mutate model metadata');
  }
}
for (const prefix of ['DeepSeek', 'Qwen']) {
  const m = model('example', `${prefix}: Example`);
  const p = new Picker({ allModels: [m], currentModel: m, onSelect() {}, onCancel() {} });
  p.handleInput(toggle);
  assert.deepEqual(Array.from(p.categories), ['Open Weights']);
  assert.equal(p.filteredRows[p.rowIndex], m);
  assert.ok(p.render(120, theme).some(line => line.includes(`${prefix}: Example`)), 'Open Weights keeps the maker name');
  p.handleInput(toggle);
  assert.equal(p.filteredRows[p.rowIndex], m, 'toggle back preserves selection');
}
const other = model('moonshot/kimi', 'Moonshot: Kimi');
const otherPicker = new Picker({ allModels: [other], currentModel: other, onSelect() {}, onCancel() {} });
otherPicker.handleInput(toggle);
assert.ok(otherPicker.render(120, theme).some(line => /\[openrouter\]\s+Moonshot: Kimi/.test(line)), 'Other must retain the maker name');
const models = cases.map(([id, name, , provider]) => model(id, name, provider));
const active = models[3];
const picked = [];
let cancelled = false;
const picker = new Picker({ allModels: models, currentModel: active, onSelect: m => picked.push(m), onCancel: () => { cancelled = true; } });
assert.equal(picker.categories[0], 'antigravity');
assert.equal(picker.filteredRows[picker.rowIndex], active);
for (const plainCtrlG of ['\x07', '\x1b[103;5u']) {
  picker.handleInput(plainCtrlG);
  assert.equal(picker.byMaker, false, 'plain Ctrl+G must remain unbound');
}
picker.handleInput(toggle);
assert.equal(picker.byMaker, true);
assert.deepEqual(Array.from(picker.categories), ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Open Weights', 'Other']);
assert.equal(picker.byCategory.get('Open Weights').length, 3, 'DeepSeek and Qwen models share one tab');
assert.equal(picker.filteredRows[picker.rowIndex], active);
assert.equal(picker.filteredRows.length, 2, 'both providers must remain selectable');
assert.equal(Array.from(picker.byCategory.values()).flat().length, models.length, 'no model lost');
const rendered = picker.render(120, theme).join('\n');
assert.match(rendered, /\[antigravity\]\s+Claude Sonnet/);
assert.match(rendered, /\[openrouter\]\s+Claude Sonnet/);
assert.ok(rendered.includes('ctrl+shift+g: makers'));
picker.handleInput('\r');
assert.equal(picked[0], active, 'Enter must preserve exact provider/model identity');
picker.handleInput(toggle);
assert.equal(picker.byMaker, false);
assert.equal(picker.filteredRows[picker.rowIndex], active);
picker.handleInput(toggle);
picker.handleInput('openrouter');
assert.equal(picker.filteredRows.length, 1);
assert.equal(picker.filteredRows[0].provider, 'openrouter');
picker.handleInput(toggle);
assert.equal(picker.categories[picker.catIndex], 'openrouter');
assert.equal(picker.searchInput.getValue(), 'openrouter');
picker.handleInput(toggle);
assert.equal(picker.searchInput.getValue(), 'openrouter');
picker.handleInput('\t');
assert.equal(picker.searchInput.getValue(), '', 'new tab starts with empty search');
picker.handleInput('\x1b[Z');
assert.equal(picker.searchInput.getValue(), 'openrouter', 'tab search restored');
picker.handleInput('\x15');
picker.handleInput('g');
assert.equal(picker.byMaker, true, 'plain g must not toggle grouping');
picker.handleInput('zzzz-unmatched');
assert.equal(picker.filteredRows.length, 0);
picker.handleInput(toggle);
assert.ok(picker.render(80, theme).some(line => line.includes('No models match')));
picker.handleInput('\x1b');
assert.equal(cancelled, true);
for (const fixtures of [models, [], [models.at(-1)]]) {
  const p = new Picker({ allModels: fixtures, currentModel: fixtures.at(-1), onSelect() {}, onCancel() {} });
  p.handleInput(toggle);
  if (fixtures.length) assert.equal(p.categories.at(-1), 'Other', 'Other stays last even when active');
  for (const width of [40, 51, 60, 80, 120]) {
    for (const line of p.render(width, theme)) assert.ok(tui.visibleWidth(line) <= width, `overflow at ${width}: ${line}`);
  }
}
// Exercise settings through registration and the real command/input wrapper, without a model API call.
for (const [config, expectedKeys, input, help] of [
  [{}, ['ctrl+shift+m'], toggle, 'ctrl+shift+g: makers'],
  [{ shortcut: ['ctrl+l', 'ctrl+l'], groupingShortcut: ['alt+g', 'ctrl+shift+g'] }, ['ctrl+l'], '\x1bg', 'alt+g/ctrl+shift+g: makers'],
  [{ shortcut: false, groupingShortcut: false }, [], toggle, 'Grouping: providers'],
]) {
  settingsText = JSON.stringify({ 'pi-model-picker': config });
  stateText = undefined;
  const commands = new Map();
  const shortcuts = new Map();
  let selected;
  let renders = 0;
  register({ registerCommand: (name, spec) => commands.set(name, spec), registerShortcut: (key, spec) => shortcuts.set(key, spec), setModel: async m => { selected = m; return true; } });
  await commands.get('models').handler('', {
    model: active, modelRegistry: { refresh() {}, getAvailable: () => models },
    ui: { notify() {}, custom: async factory => {
      let result;
      const ui = factory({ requestRender: () => renders++ }, theme, {}, value => { result = value; });
      ui.handleInput(input);
      assert.ok(ui.render(140).some(line => line.includes(help)));
      ui.handleInput('\r');
      return result;
    } },
  });
  assert.equal(selected, active);
  assert.equal(renders, 2);
  assert.deepEqual(Array.from(shortcuts.keys()), expectedKeys);
}
const warnings = [];
let lastSelected;
function memoryCommand(rememberLastTab) {
  settingsText = JSON.stringify({ 'pi-model-picker': { rememberLastTab } });
  const commands = new Map();
  register({ registerCommand: (name, spec) => commands.set(name, spec), registerShortcut() {}, setModel: async m => { lastSelected = m; return true; } });
  return commands.get('models').handler;
}
async function openRemembered(handler, keys, check = () => {}) {
  await handler('', {
    model: active, modelRegistry: { refresh() {}, getAvailable: () => models },
    ui: { notify: (message, type) => { if (type === 'warning') warnings.push(message); }, custom: async factory => {
      let result;
      const ui = factory({ requestRender() {} }, theme, {}, value => { result = value; });
      check(ui.render(140).join('\n'));
      for (const key of keys) ui.handleInput(key);
      return result;
    } },
  });
}
stateText = undefined;
const remembered = memoryCommand(); // default true
await openRemembered(remembered, [toggle, '\t', '\x1b']);
assert.deepEqual(JSON.parse(stateText), { byMaker: true, category: 'Google' }, 'Escape saves the visited tab');
const checkGoogle = text => { assert.match(text, /ctrl\+shift\+g: makers/); assert.match(text, /\[antigravity\]\s+Gemini/); };
await openRemembered(remembered, ['\x1b'], checkGoogle); // same extension instance
await openRemembered(memoryCommand(true), ['\r'], checkGoogle); // reload/restart
assert.equal(maker(lastSelected), 'Google');
assert.deepEqual(JSON.parse(stateText), { byMaker: true, category: 'Google' }, 'Enter saves the tab too');
stateText = JSON.stringify({ byMaker: false, category: 'openrouter' });
await openRemembered(memoryCommand(true), ['\x1b'], text => assert.match(text, /ctrl\+shift\+g: providers/));
assert.deepEqual(JSON.parse(stateText), { byMaker: false, category: 'openrouter' });
const saved = stateText;
const counts = [stateReads, stateWrites];
await openRemembered(memoryCommand(false), [toggle, '\x1b'], text => { assert.match(text, /ctrl\+shift\+g: providers/); assert.match(text, /▶ Claude Sonnet/); });
assert.equal(stateText, saved, 'disabled memory must not overwrite the saved tab');
assert.deepEqual([stateReads, stateWrites], counts, 'disabled memory must not read/write state');
stateText = JSON.stringify({ byMaker: true, category: 'Google' });
await openRemembered(memoryCommand('false'), ['\x1b'], checkGoogle); // invalid flag falls back to true
stateText = JSON.stringify({ byMaker: true, category: 'Removed tab' });
await openRemembered(memoryCommand(), ['\x1b'], text => assert.match(text, /\[antigravity\]\s+Claude Sonnet/));
assert.deepEqual(JSON.parse(stateText), { byMaker: true, category: 'Anthropic' }, 'missing tab falls back to the active model');
for (const invalid of [undefined, '{broken', 'null', '[]', '{"byMaker":"true","category":"Google"}']) {
  stateText = invalid;
  await openRemembered(memoryCommand(), ['\x1b'], text => assert.match(text, /ctrl\+shift\+g: providers/));
  assert.deepEqual(JSON.parse(stateText), { byMaker: false, category: 'antigravity' });
}
assert.equal(warnings.length, 0, 'absent/malformed state must not cause warnings');
writeFails = true;
await openRemembered(memoryCommand(), ['\r']);
assert.equal(lastSelected, active, 'state write failure must not prevent model selection');
assert.equal(warnings.length, 1);
console.log('PASS: tab memory across reopen/restart, Enter/Escape, disabled memory, malformed/missing state, unavailable tab, write failure; shortcuts, grouping, selection and layout.');
