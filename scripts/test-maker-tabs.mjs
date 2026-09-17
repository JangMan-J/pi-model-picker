// Run: node scripts/test-maker-tabs.mjs <typescript.js> <pi-tui/dist/index.js>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ts = (await import(pathToFileURL(process.argv[2]))).default;
const tui = await import(pathToFileURL(process.argv[3]));
const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default function', 'function');
const { Picker, maker, register } = vm.runInNewContext(
  ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText +
  '\n({ Picker: ModelPickerComponent, maker: modelMaker, register: modelPickerExtension });',
  { ...tui, DynamicBorder: class { render(w) { return ['─'.repeat(w)]; } invalidate() {} } },
);
const theme = { fg: (_, text) => text, bold: text => text };
const model = (id, name, provider = 'openrouter') => ({
  id, name, provider, reasoning: true, input: ['text', 'image'],
  contextWindow: 200000, cost: { input: 3, output: 15 },
});
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
const models = cases.map(([id, name, , provider]) => model(id, name, provider));
const active = models[3];
const picked = [];
let cancelled = false;
const picker = new Picker({ allModels: models, currentModel: active, onSelect: m => picked.push(m), onCancel: () => { cancelled = true; } });
assert.equal(picker.categories[0], 'antigravity');
assert.equal(picker.filteredRows[picker.rowIndex], active);
picker.handleInput('\x07'); // legacy Ctrl+G
assert.equal(picker.byMaker, true);
assert.deepEqual(Array.from(picker.categories), ['OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek', 'Qwen', 'Other']);
assert.equal(picker.filteredRows[picker.rowIndex], active);
assert.equal(picker.filteredRows.length, 2, 'both providers must remain selectable');
assert.equal(Array.from(picker.byCategory.values()).flat().length, models.length, 'no model lost');
const rendered = picker.render(120, theme).join('\n');
assert.ok(rendered.includes('[antigravity] Claude Sonnet'));
assert.ok(rendered.includes('[openrouter] Claude Sonnet'));
assert.ok(rendered.includes('Ctrl+G: makers'));
picker.handleInput('\r');
assert.equal(picked[0], active, 'Enter must preserve exact provider/model identity');
picker.handleInput('\x1b[103;5u'); // Kitty Ctrl+G
assert.equal(picker.byMaker, false);
assert.equal(picker.filteredRows[picker.rowIndex], active);
picker.handleInput('\x07');
picker.handleInput('openrouter');
assert.equal(picker.filteredRows.length, 1);
assert.equal(picker.filteredRows[0].provider, 'openrouter');
picker.handleInput('\x07');
assert.equal(picker.categories[picker.catIndex], 'openrouter');
assert.equal(picker.searchInput.getValue(), 'openrouter');
picker.handleInput('\x07');
assert.equal(picker.searchInput.getValue(), 'openrouter');
picker.handleInput('\t');
assert.equal(picker.searchInput.getValue(), '', 'new tab starts with empty search');
picker.handleInput('\x1b[Z');
assert.equal(picker.searchInput.getValue(), 'openrouter', 'tab search restored');
picker.handleInput('\x15'); // clear search before testing ordinary g
picker.handleInput('g');
assert.equal(picker.byMaker, true, 'plain g must not toggle grouping');
picker.handleInput('zzzz-unmatched');
assert.equal(picker.filteredRows.length, 0);
picker.handleInput('\x07');
assert.ok(picker.render(80, theme).some(line => line.includes('No models match')));
picker.handleInput('\x1b');
assert.equal(cancelled, true);
for (const fixtures of [models, [], [models.at(-1)]]) {
  const p = new Picker({ allModels: fixtures, currentModel: fixtures.at(-1), onSelect() {}, onCancel() {} });
  p.handleInput('\x07');
  if (fixtures.length) assert.equal(p.categories.at(-1), 'Other', 'Other stays last even when active');
  for (const width of [40, 51, 60, 80, 120]) {
    for (const line of p.render(width, theme)) assert.ok(tui.visibleWidth(line) <= width, `overflow at ${width}: ${line}`);
  }
}
// Exercise the registered command and wrapper input path, without calling a model API.
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
    ui.handleInput('\x07');
    assert.ok(ui.render(120).some(line => line.includes('Ctrl+G: makers')));
    ui.handleInput('\r');
    return result;
  } },
});
assert.equal(selected, active);
assert.equal(renders, 2);
assert.ok(shortcuts.has('ctrl+shift+m'));
console.log('PASS: maker identification, tab order, Ctrl+G (legacy/Kitty), search, provider identity, selection/cancel, empty results, narrow rendering, command integration.');
