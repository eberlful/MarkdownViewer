'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'theme.js'), 'utf8');
function setup({ stored, dark = false, system = true, storageError = false } = {}) {
  const values = new Map([['folio-ui', '{"mode":"editor"}']]);
  if (stored !== undefined) values.set('graphit-theme', stored);
  const handlers = {}, attributes = {};
  const button = { setAttribute(name, value) { attributes[name] = value; }, addEventListener(type, fn) { handlers[type] = fn; } };
  const meta = { setAttribute(name, value) { this[name] = value; } };
  const document = { documentElement: { dataset: {} }, querySelector() { return meta; }, getElementById() { return button; }, addEventListener(type, fn) { handlers[type] = fn; } };
  const media = { matches: dark, addEventListener(type, fn) { handlers[`media-${type}`] = fn; } };
  const localStorage = { getItem(key) { if (storageError) throw Error('blocked'); return values.get(key) ?? null; }, setItem(key, value) { if (storageError) throw Error('blocked'); values.set(key, value); } };
  const window = system ? { matchMedia() { return media; } } : {};
  vm.runInNewContext(source, { document, window, localStorage });
  handlers.DOMContentLoaded();
  return { document, handlers, attributes, button, meta, values };
}

test('Design folgt zunächst dem System und wechselt bei Systemänderungen', () => {
  const app = setup();
  assert.equal(app.document.documentElement.dataset.theme, 'light');
  assert.equal(app.attributes['aria-pressed'], 'false');
  assert.equal(app.meta.content, '#f7f7f9');
  app.handlers['media-change']({ matches: true });
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
  assert.equal(app.attributes['aria-pressed'], 'true');
});

test('Manuelle Auswahl bleibt bestehen und verändert keine bisherigen Ansichtsoptionen', () => {
  const app = setup({ dark: true });
  app.handlers.click();
  assert.equal(app.values.get('graphit-theme'), 'light');
  assert.equal(app.values.get('folio-ui'), '{"mode":"editor"}');
  assert.equal(app.button.title, 'Dunkles Design aktivieren');
  app.handlers['media-change']({ matches: true });
  assert.equal(app.document.documentElement.dataset.theme, 'light');
  const restored = setup({ stored: app.values.get('graphit-theme'), dark: true });
  assert.equal(restored.document.documentElement.dataset.theme, 'light');
});

test('Fehlende Systemeinstellung und gesperrter Speicher verhindern die Bedienung nicht', () => {
  const app = setup({ system: false, storageError: true });
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
  app.handlers.click();
  assert.equal(app.document.documentElement.dataset.theme, 'light');
});
