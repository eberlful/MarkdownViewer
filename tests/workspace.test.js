'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../core.js');

class Element {
  constructor() { this.value = ''; this.children = []; this.dataset = {}; this.style = { setProperty() {} };  this.classList = { add() {}, remove() {}, toggle() {} }; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute() {} addEventListener() {} querySelectorAll() { return []; } focus() {} setSelectionRange() {} prepend(...items) { this.children.unshift(...items); }
}
function file(name, contents) {
  return { kind: 'file', name, text: contents, async getFile() { return { text: async () => this.text }; }, async createWritable() { const self = this; return { async write(text) { self.text = text; }, async close() {} }; } };
}
function directory(name, entries) { return { kind: 'directory', name, async *entries() { yield* Object.entries(entries); } }; }
function app(options = {}) {
  const elements = new Map();
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }, createElement() { return new Element(); }, createTextNode(text) { return text; }, querySelectorAll() { return []; }, title: '' };
  const context = { document, FolioCore: core, window: { addEventListener() {}, confirm() { return true; }, ...options }, setTimeout: () => 1, clearTimeout() {}, console, prompt() {}, confirm() {} };
  vm.createContext(context); vm.runInContext(fs.readFileSync('app.js', 'utf8'), context); return { context, elements };
}

test('Arbeitsbereich durchsuchen und Ticketdatei sicher verschieben', async () => {
  const ticket = file('eins.md', '---\ntitle: Eins\nstatus: offen\npriority: mittel\n---\nBeschreibung\n');
  const note = file('notiz.md', '# Projekt\n- [ ] Aufgabe\n');
  const image = file('bild.png', 'binary');
  const root = directory('workspace', { Projekt: directory('Projekt', { tickets: directory('tickets', { 'eins.md': ticket }), 'notiz.md': note, 'bild.png': image }) });
  const { context } = app(); context.root = root;
  await vm.runInContext('state.directory = root; refreshFiles()', context);
  assert.equal(vm.runInContext('state.projects.length', context), 1);
  assert.equal(vm.runInContext('state.files.length', context), 2);
  assert.equal(vm.runInContext('state.tree[0].children.length', context), 3);
  await vm.runInContext("moveTicket('Projekt/tickets/eins.md', 'in_arbeit')", context);
  assert.match(ticket.text, /status: in_arbeit/);
  vm.runInContext("state.path = 'Projekt/tickets/eins.md'; state.dirty = true", context);
  await vm.runInContext("moveTicket('Projekt/tickets/eins.md', 'erledigt')", context);
  assert.match(ticket.text, /status: in_arbeit/);
});


test('Backlinks zeigen Quellen und Navigation respektiert ungespeicherte Änderungen', async () => {
  const target = file('ziel.md', '# Ziel\n');
  const source = file('quelle.md', '# Quelle\nSiehe [[ziel]] und [Ziel](ziel.md).\n');
  const root = directory('workspace', { Projekt: directory('Projekt', { 'ziel.md': target, 'quelle.md': source }) });
  const { context, elements } = app(); context.root = root;
  await vm.runInContext('state.directory = root; refreshFiles()', context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'ziel.md'))", context);
  assert.equal(elements.get('backlinks-count').textContent, '2');
  assert.equal(elements.get('backlinks-list').children.length, 1);
  vm.runInContext("editor.value = '# Nicht gespeichert'; changed(); window.confirm = () => false", context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'quelle.md'))", context);
  assert.equal(vm.runInContext('state.name', context), 'ziel.md');
  assert.match(vm.runInContext('editor.value', context), /Nicht gespeichert/);
});

test('Vorschau kennzeichnet interne und mehrdeutige Links ohne HTML auszuführen', async () => {
  const root = directory('workspace', { A: directory('A', { 'a.md': file('a.md', '# A'), 'ziel.md': file('ziel.md', '# Ziel') }), B: directory('B', { 'ziel.md': file('ziel.md', '# Ziel') }) });
  const { context } = app(); context.root = root;
  await vm.runInContext('state.directory = root; refreshFiles()', context);
  vm.runInContext("state.folderTarget = true; state.path = 'A/a.md'", context);
  assert.match(vm.runInContext("inline('[hier](./ziel.md)')", context), /data-folio-path="A\/ziel.md"/);
  assert.match(vm.runInContext("inline('[[ziel]]')", context), /unresolved-link/);
  assert.doesNotMatch(vm.runInContext("inline('[[<script>]]')", context), /<script>/);
});


function fakeIndexedDB(initial = null, fail = false) {
  let value = initial;
  const indexedDB = { open() {
    const req = {};
    queueMicrotask(() => {
      if (fail) { req.error = new Error('Nicht verfügbar'); req.onerror(); return; }
      req.result = { objectStoreNames: { contains: () => true }, close() {}, transaction(_name, mode) {
        const tx = { objectStore() { return {
          get() { const result = {}; queueMicrotask(() => { result.result = value; result.onsuccess(); }); return result; },
          put(next) { value = next; queueMicrotask(() => tx.oncomplete()); }
        }; } }; return tx;
      } };
      req.onsuccess();
    });
    return req;
  } };
  return { indexedDB, get value() { return value; } };
}
function storedDirectory(name, permission = 'granted') {
  const dir = directory(name, { Projekt: directory('Projekt', { 'notiz.md': file('notiz.md', '- [ ] Aufgabe') }) });
  dir.queryPermission = async () => permission;
  dir.requestPermission = async () => permission;
  return dir;
}

test('Gespeicherten Arbeitsbereich bei bestehender Berechtigung wiederherstellen ohne Editorinhalt zu ersetzen', async () => {
  const saved = storedDirectory('Gespeichert'); const storage = fakeIndexedDB(saved);
  const { context, elements } = app({ indexedDB: storage.indexedDB, showDirectoryPicker() {} });
  vm.runInContext("editor.value = 'Eigener Entwurf'; changed()", context);
  await vm.runInContext('restoreReady', context);
  assert.equal(vm.runInContext('state.directory.name', context), 'Gespeichert');
  assert.equal(vm.runInContext('editor.value', context), 'Eigener Entwurf');
  assert.equal(elements.get('project-name').textContent, 'Gespeichert');
});

test('Berechtigung nach Klick erneut anfragen; Ablehnung lässt Auswahl offen', async () => {
  const saved = storedDirectory('Projekt', 'prompt'); let permission = 'denied';
  saved.requestPermission = async () => permission;
  const { context, elements } = app({ indexedDB: fakeIndexedDB(saved).indexedDB, showDirectoryPicker() {} });
  await vm.runInContext('restoreReady', context);
  assert.equal(elements.get('restore-folder').hidden, false);
  await elements.get('restore-folder').onclick();
  assert.equal(vm.runInContext('state.directory', context), null);
  assert.match(elements.get('workspace-message').textContent, /nicht freigegeben/);
  permission = 'granted'; await elements.get('restore-folder').onclick();
  assert.equal(vm.runInContext('state.directory.name', context), 'Projekt');
  assert.equal(elements.get('restore-folder').hidden, true);
});

test('Neue Auswahl schlägt verzögerte Wiederherstellung und wird gespeichert', async () => {
  let release; const old = storedDirectory('Alt'); old.queryPermission = () => new Promise(resolve => { release = resolve; });
  const next = storedDirectory('Neu'); const storage = fakeIndexedDB(old);
  const { context, elements } = app({ indexedDB: storage.indexedDB, showDirectoryPicker: async () => next });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await elements.get('open-folder').onclick();
  release('granted'); await vm.runInContext('restoreReady', context);
  assert.equal(vm.runInContext('state.directory.name', context), 'Neu');
  assert.equal(storage.value, next);
});

test('Fehlerhafter Speicher oder unzugänglicher Ordner blockieren keine neue Auswahl', async () => {
  const gone = storedDirectory('Verschoben'); gone.entries = async function* () { throw new Error('Nicht gefunden'); };
  const good = storedDirectory('Neu'); const storage = fakeIndexedDB(gone);
  const { context, elements } = app({ indexedDB: storage.indexedDB, showDirectoryPicker: async () => good });
  await vm.runInContext('restoreReady', context);
  assert.match(elements.get('workspace-message').textContent, /nicht erreichbar/);
  await elements.get('open-folder').onclick(); assert.equal(vm.runInContext('state.directory.name', context), 'Neu');
  const broken = app({ indexedDB: fakeIndexedDB(null, true).indexedDB, showDirectoryPicker: async () => good });
  await vm.runInContext('restoreReady', broken.context); await broken.elements.get('open-folder').onclick();
  assert.equal(vm.runInContext('state.directory.name', broken.context), 'Neu');
  assert.match(broken.elements.get('workspace-message').textContent, /nicht.*gespeichert/);
});

test('Ausgewählten Arbeitsbereich nach erneutem Start laden', async () => {
  const workspace = storedDirectory('Merken'); const storage = fakeIndexedDB();
  const first = app({ indexedDB: storage.indexedDB, showDirectoryPicker: async () => workspace });
  await vm.runInContext('restoreReady', first.context);
  await first.elements.get('open-folder').onclick();
  assert.equal(vm.runInContext('state.folderTarget', first.context), true);
  const second = app({ indexedDB: storage.indexedDB, showDirectoryPicker: async () => workspace });
  await vm.runInContext('restoreReady', second.context);
  assert.equal(vm.runInContext('state.directory.name', second.context), 'Merken');
  assert.equal(vm.runInContext('state.files.length', second.context), 1);
});

test('Strg+S und Cmd+S verwenden die Speicheraktion und unterdrücken den Browserdialog', () => {
  const listeners = {};
  const { elements } = app({ addEventListener(type, listener) { listeners[type] = listener; } });
  let saves = 0;
  const save = elements.get('save'); save.click = () => { saves++; };
  const key = (overrides = {}) => {
    let prevented = false;
    const event = { key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, preventDefault() { prevented = true; }, ...overrides };
    listeners.keydown(event); return prevented;
  };
  assert.equal(key(), true); assert.equal(saves, 1);
  assert.equal(key({ ctrlKey: false, metaKey: true, key: 'S' }), true); assert.equal(saves, 2);
  assert.equal(key({ repeat: true }), true); assert.equal(saves, 2);
  save.disabled = true; assert.equal(key(), true); assert.equal(saves, 2);
  assert.equal(key({ shiftKey: true }), false); assert.equal(key({ ctrlKey: false }), false);
});

test('Automatisches Speichern erhält neuere Eingaben und erkennt externe Änderungen', async () => {
  const target = file('notiz.md', 'Original');
  const { context } = app(); context.target = target;
  vm.runInContext("loadDocument('Original', 'notiz.md', target, 'notiz.md', true); editor.value = 'Erste Änderung'; changed()", context);
  let release; const wait = new Promise(resolve => { release = resolve; });
  target.createWritable = async () => ({ async write(text) { await wait; target.text = text; }, async close() {} });
  const saving = vm.runInContext('saveDocument(false)', context);
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext("editor.value = 'Neuere Änderung'; changed()", context);
  release(); await saving;
  assert.equal(target.text, 'Erste Änderung');
  assert.equal(vm.runInContext('state.saved', context), 'Erste Änderung');
  assert.equal(vm.runInContext('state.dirty', context), true);
  target.text = 'Extern geändert';
  await vm.runInContext('saveDocument(false)', context);
  assert.equal(target.text, 'Extern geändert');
  assert.equal(vm.runInContext('editor.value', context), 'Neuere Änderung');
  assert.match(vm.runInContext('saveError', context), /außerhalb/);
});

test('Vorschau ordnet Checkboxen auch in Zitaten der richtigen Quellzeile zu', () => {
  const { context } = app();
  const html = vm.runInContext("markdown('# Titel\\n\\n> - [ ] Erste\\n\\n- [x] Zweite')", context);
  assert.match(html, /data-task-line="3"/);
  assert.match(html, /data-task-line="5"/);
  assert.doesNotMatch(html, /type="checkbox" disabled/);
});

test('Öffnen einer verschachtelten Datei klappt alle übergeordneten Ordner auf', async () => {
  const target = file('note.md', '# Notiz');
  const root = directory('workspace', { Projekt: directory('Projekt', { docs: directory('docs', { 'note.md': target }) }) });
  const { context } = app(); context.root = root;
  await vm.runInContext('state.directory = root; refreshFiles()', context);
  await vm.runInContext('openProjectFile(state.files[0])', context);
  assert.equal(vm.runInContext("state.expanded.has('Projekt') && state.expanded.has('Projekt/docs')", context), true);
});


test('Suche berücksichtigt Pfade, Inhalte und den ungespeicherten Editorstand', async () => {
  const target = file('notiz.md', 'alter Inhalt');
  const root = directory('workspace', { Projekt: directory('Projekt', { 'notiz.md': target, 'andere.md': file('andere.md', 'Erste Zeile\nEin Suchwort hier') }) });
  const { context } = app(); context.root = root;
  context.localStorage = { getItem() { return null; }, setItem() {} };
  await vm.runInContext('state.directory = root; refreshFiles()', context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'notiz.md'))", context);
  vm.runInContext("editor.value = 'Noch nicht gespeichert: SUCHWORT'; changed()", context);
  vm.runInContext(fs.readFileSync('features.js', 'utf8'), context);
  const results = vm.runInContext("searchFiles('suchwort').map(r => [r.file.path, r.line])", context);
  assert.deepEqual(JSON.parse(JSON.stringify(results)), [['Projekt/andere.md', 2], ['Projekt/notiz.md', 1]]);
  assert.equal(vm.runInContext("searchFiles('notiz.md')[0].file.path", context), 'Projekt/notiz.md');
});


test('Ein Schreibfehler erhält den Entwurf und meldet den Fehler', async () => {
  const target = file('notiz.md', 'Original');
  target.createWritable = async () => { throw new Error('Keine Schreibberechtigung'); };
  const { context } = app(); context.target = target;
  vm.runInContext("loadDocument('Original', 'notiz.md', target, 'notiz.md', true); editor.value = 'Entwurf'; changed()", context);
  await vm.runInContext('saveDocument(false)', context);
  assert.equal(target.text, 'Original');
  assert.equal(vm.runInContext('editor.value', context), 'Entwurf');
  assert.equal(vm.runInContext('state.dirty', context), true);
  assert.match(vm.runInContext('saveError', context), /Keine Schreibberechtigung/);
});
