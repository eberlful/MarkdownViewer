'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../core.js');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.value = ''; this.children = []; this.dataset = {}; this.hidden = false; this.attributes = {};
    this.style = { setProperty() {} }; this.events = {}; this.selectionStart = 0; this.selectionEnd = 0; this.scrollTop = 0;
    const classes = new Set(); this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, force) => { if (force === undefined ? !classes.has(x) : force) classes.add(x); else classes.delete(x); }, contains: x => classes.has(x) };
  }
  append(...items) { for (const item of items) { if (item && typeof item === 'object') item.parentElement = this; this.children.push(item); } }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  prepend(...items) { this.children.unshift(...items); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'id') this.id = ''; }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.events[type] || []) fn({ target: this, ...event }); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  cloneNode() { return new Element(this.tagName); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(item => item !== this); }
  focus() {} setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.setSelectionRange(start + text.length, start + text.length); }
  click() { if (this.onclick) this.onclick({ target: this, preventDefault() {} }); this.dispatch('click', { preventDefault() {} }); }
  showModal() { this.open = true; } close() { this.open = false; }
}
function makeDB() {
  const data = new Map();
  return { open() {
    const request = {};
    queueMicrotask(() => { request.result = { objectStoreNames: { contains: () => true }, close() {}, transaction() {
      const tx = { objectStore() { return {
        get(key) { const result = {}; queueMicrotask(() => { result.result = data.get(key); result.onsuccess(); }); return result; },
        put(value, key) { data.set(key, value); queueMicrotask(() => tx.oncomplete()); }
      }; } }; return tx;
    } }; request.onsuccess(); }); return request;
  } };
}
function file(name, contents) {
  return { kind: 'file', name, text: contents, async getFile() { return { lastModified: 100, text: async () => this.text }; }, async createWritable() { const self = this; return { async write(text) { self.text = text; }, async close() {} }; } };
}
function directory(name, entries) { return { kind: 'directory', name, entriesMap: entries, async *entries() { yield* Object.entries(entries); }, async getDirectoryHandle(name, options = {}) { if (!entries[name] && options.create) entries[name] = directory(name, {}); if (!entries[name]) throw Object.assign(new Error('missing'), { name: 'NotFoundError' }); return entries[name]; }, async getFileHandle(name, options = {}) { if (!entries[name] && options.create) entries[name] = file(name, ''); if (!entries[name]) throw Object.assign(new Error('missing'), { name: 'NotFoundError' }); return entries[name]; }, async removeEntry(name) { delete entries[name]; } }; }
function harness(indexedDB = makeDB()) {
  const elements = new Map(), timers = new Map(), storage = new Map(); let timerId = 0;
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement(tag) { return new Element(tag); }, createTextNode(text) { return text; }, querySelectorAll() { return []; },
    execCommand() { return false; }, title: ''
  };
  const layer = new Element(); layer.append(document.getElementById('editor'));
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const events = {};
  const window = { indexedDB, events, addEventListener(type, fn) { (events[type] ||= []).push(fn); }, confirm() { return true; }, alert() {}, matchMedia() { return { matches: false }; } };
  const context = vm.createContext({ document, window, localStorage, FolioCore: core, console, prompt() {}, confirm() {}, getComputedStyle() { return { lineHeight: '20' }; }, setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  for (const source of ['app.js', 'features.js', 'tabs.js', 'enhancements.js', 'workspace.js', 'tags.js']) vm.runInContext(fs.readFileSync(source, 'utf8'), context, { filename: source });
  return { context, elements, timers, async runTimers() { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) await callback(); } };
}
async function openWorkspace(app, root) { app.context.root = root; await vm.runInContext('state.directory = root; refreshFiles()', app.context); }

test('Tag-Ansicht zählt Dateien samt Untertags und berücksichtigt Entwürfe in anderen Tabs', async () => {
  const a = file('a.md', '---\ntags: [Projekt/Planung, idee]\n---\n#projekt/planung'), b = file('b.md', '#PROJEKT/umsetzung');
  const app = harness(); await openWorkspace(app, directory('root', { 'a.md': a, 'b.md': b }));
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", app.context);
  vm.runInContext("editor.value += '\\n#neu'; edited()", app.context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'b.md'))", app.context);
  app.elements.get('tags-tab').click();
  assert.equal(vm.runInContext("window.GraphitTags.index().find(t => t.key === 'projekt').files.size", app.context), 2);
  assert.equal(vm.runInContext("window.GraphitTags.index().find(t => t.key === 'projekt/planung').files.size", app.context), 1);
  assert.equal(vm.runInContext("window.GraphitTags.index().find(t => t.key === 'neu').files.size", app.context), 1);
  const list = app.elements.get('tag-content').children[0], project = list.children.find(button => button.children[0]?.textContent === '#Projekt');
  project.onclick();
  const hits = app.elements.get('tag-content').children[1]; assert.equal(hits.children.length, 3);
  hits.children[1].onclick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('state.path', app.context), 'a.md');
  assert.equal(vm.runInContext('editor.selectionStart', app.context), 4);
  const other = directory('other', { 'c.md': file('c.md', '#anders') }); app.context.other = other;
  await vm.runInContext('window.GraphitTabs.workspaceWillChange(); state.directory = other; refreshFiles()', app.context);
  assert.deepEqual(Array.from(vm.runInContext('window.GraphitTags.index().map(t => t.name)', app.context)), ['anders']);
});

test('Tags in der Vorschau und Tastaturvorschläge nutzen dieselben Arbeitsbereichsdaten', async () => {
  const app = harness(); await openWorkspace(app, directory('root', { 'a.md': file('a.md', '#projekt/planung\n\nText #idee') }));
  await vm.runInContext("openProjectFile(state.files[0])", app.context);
  assert.match(vm.runInContext("inline('Text #idee und `#code`')", app.context), /data-tag="idee"/);
  assert.doesNotMatch(vm.runInContext("inline('`#code`')", app.context), /data-tag/);
  vm.runInContext("editor.value += '\\n#pro'; editor.setSelectionRange(editor.value.length, editor.value.length)", app.context);
  const activeEditor = vm.runInContext('editor', app.context); activeEditor.dispatch('input');
  const suggestions = app.elements.get('link-suggestions');
  assert.equal(suggestions.hidden, false); assert.equal(suggestions.children[0].textContent, '#projekt');
  activeEditor.dispatch('keydown', { key: 'ArrowDown', preventDefault() {} });
  activeEditor.dispatch('keydown', { key: 'Enter', preventDefault() {} });
  assert.match(vm.runInContext('editor.value', app.context), /#projekt\/planung$/);
  assert.equal(suggestions.hidden, true);
  vm.runInContext("window.GraphitTags.open('idee')", app.context);
  assert.equal(app.elements.get('tags-tab').attributes['aria-selected'], 'true');
  assert.equal(app.elements.get('tag-content').children[1].children[0].textContent, '#idee');
});

test('Tag-Vorschläge erscheinen nicht innerhalb von Code oder Wikilinks', async () => {
  const app = harness(); await openWorkspace(app, directory('root', { 'a.md': file('a.md', '#projekt') }));
  await vm.runInContext("openProjectFile(state.files[0])", app.context);
  const activeEditor = vm.runInContext('editor', app.context);
  vm.runInContext("editor.value = '`#pro`'; editor.setSelectionRange(5, 5)", app.context); activeEditor.dispatch('input');
  assert.equal(app.elements.get('link-suggestions').hidden, true);
  vm.runInContext("editor.value = '[[#pro'; editor.setSelectionRange(6, 6)", app.context); activeEditor.dispatch('input');
  assert.equal(app.elements.get('link-suggestions').attributes['aria-label'], 'Notizverknüpfungen');
  assert.ok(app.elements.get('link-suggestions').children.every(item => !item.textContent.startsWith('#projekt')));
});

test('Tabs bewahren parallele Entwürfe und speichern inaktive Dateien automatisch', async () => {
  const a = file('a.md', '# A'), b = file('b.md', '# B');
  const app = harness(); await openWorkspace(app, directory('root', { 'a.md': a, 'b.md': b }));
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", app.context);
  vm.runInContext("editor.value = '# Entwurf A'; edited()", app.context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'b.md'))", app.context);
  assert.equal(vm.runInContext("window.GraphitTabs.textFor(state.files.find(f => f.name === 'a.md'))", app.context), '# Entwurf A');
  await app.runTimers();
  assert.equal(a.text, '# Entwurf A');
  assert.equal(vm.runInContext("window.GraphitTabs.selectPath('a.md'); editor.value", app.context), '# Entwurf A');
  assert.equal(vm.runInContext('state.dirty', app.context), false);
});

test('Ein externer Konflikt überschreibt beim Speichern eines inaktiven Tabs keine Datei', async () => {
  const a = file('a.md', 'Original'), b = file('b.md', 'Andere');
  const app = harness(); await openWorkspace(app, directory('root', { 'a.md': a, 'b.md': b }));
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", app.context);
  vm.runInContext("editor.value = 'Mein Entwurf'; edited()", app.context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'b.md'))", app.context);
  a.text = 'Extern'; await app.runTimers();
  assert.equal(a.text, 'Extern');
  vm.runInContext("window.GraphitTabs.selectPath('a.md')", app.context);
  assert.equal(vm.runInContext('editor.value', app.context), 'Mein Entwurf');
  assert.match(vm.runInContext('saveError', app.context), /außerhalb/);
});

test('Tabs werden pro Arbeitsbereich wiederhergestellt und neue leere Entwürfe sind ungespeichert', async () => {
  const db = makeDB(), a = file('a.md', '# A'), b = file('b.md', '# B'), root = directory('root', { 'a.md': a, 'b.md': b });
  const first = harness(db); await openWorkspace(first, root);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", first.context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'b.md'))", first.context);
  await vm.runInContext('recentWrites', first.context);
  const second = harness(db); await openWorkspace(second, root);
  await vm.runInContext('window.GraphitTabs.workspaceChanged(root)', second.context);
  assert.equal(vm.runInContext("window.GraphitTabs.selectPath('a.md'); editor.value", second.context), '# A');
  assert.equal(vm.runInContext("window.GraphitTabs.selectPath('b.md'); editor.value", second.context), '# B');
  vm.runInContext("loadDocument('', 'neu.md', null, 'neu.md', true, true)", second.context);
  assert.equal(vm.runInContext('state.dirty', second.context), true);
});

test('Live-Ansicht verändert den Markdown-Text nicht und maskiert keine HTML-Eingaben', () => {
  const app = harness();
  const result = vm.runInContext("mode = 'live'; editor.value = '# Titel\\n\\n**Fett** <script>'; editor.selectionStart = 0; editor.selectionEnd = 0; highlightMarkdown(editor.value)", app.context);
  assert.match(result, /live-bold/); assert.match(result, /&lt;script&gt;/); assert.doesNotMatch(result, /<script>/);
  assert.equal(vm.runInContext('editor.value', app.context), '# Titel\n\n**Fett** <script>');
});

test('Wikilink-Vorschläge nutzen eindeutige relative Pfade und legen fehlende Ziele zunächst als Entwurf an', async () => {
  const source = file('quelle.md', '');
  const root = directory('root', { A: directory('A', { 'quelle.md': source, 'ziel.md': file('ziel.md', '# A') }), B: directory('B', { 'ziel.md': file('ziel.md', '# B') }) });
  const app = harness(); await openWorkspace(app, root);
  await vm.runInContext("openProjectFile(state.files.find(f => f.path === 'A/quelle.md'))", app.context);
  vm.runInContext("editor.value = 'Siehe [[ziel'; editor.setSelectionRange(editor.value.length, editor.value.length); editor.dispatch('input')", app.context);
  const suggestions = app.elements.get('link-suggestions').children;
  const second = suggestions.find(button => button.textContent === 'B/ziel.md'); assert.ok(second); second.onclick();
  assert.equal(vm.runInContext('editor.value', app.context), 'Siehe [[../B/ziel]]');
  vm.runInContext("editor.value += ' und [[neu'; editor.setSelectionRange(editor.value.length, editor.value.length); editor.dispatch('input')", app.context);
  const create = app.elements.get('link-suggestions').children.find(button => button.textContent.includes('anlegen')); assert.ok(create); create.onclick();
  assert.equal(vm.runInContext('state.path', app.context), 'A/neu.md');
  assert.equal(vm.runInContext('state.isNew && state.dirty', app.context), true);
  assert.match(vm.runInContext("window.GraphitTabs.textFor(state.files.find(f => f.path === 'A/quelle.md'))", app.context), /\[\[\.\/neu\]\]/);
});

test('Eine Aufgabe aus der Übersicht wird im Dokument geändert und gespeichert', async () => {
  const a = file('aufgaben.md', '# Aufgaben\n- [ ] Testen\n'), root = directory('root', { 'aufgaben.md': a });
  const app = harness(); await openWorkspace(app, root);
  await vm.runInContext("completeTodo({ file: state.files[0], line: 2, text: 'Testen' })", app.context);
  assert.match(vm.runInContext('editor.value', app.context), /- \[x\] Testen/);
  await app.runTimers(); assert.match(a.text, /- \[x\] Testen/);
});

test('Favoriten werden zusammen mit Arbeitsbereichsdaten gespeichert und wiederhergestellt', async () => {
  const db = makeDB(), root = directory('root', { 'notiz.md': file('notiz.md', '# Notiz') });
  const first = harness(db); await openWorkspace(first, root);
  await vm.runInContext('window.GraphitEnhancements.workspaceChanged(root)', first.context);
  await vm.runInContext('openProjectFile(state.files[0])', first.context);
  first.elements.get('favorite-document').onclick(); await vm.runInContext('recentWrites', first.context);
  const second = harness(db); await openWorkspace(second, root);
  await vm.runInContext('window.GraphitEnhancements.workspaceChanged(root)', second.context);
  await vm.runInContext('openProjectFile(state.files[0])', second.context);
  assert.equal(second.elements.get('favorite-document').textContent, '★');
});


test('Ein über einen Wikilink erstellter Entwurf wird im Quellordner gespeichert', async () => {
  const source = file('quelle.md', ''), folder = directory('A', { 'quelle.md': source });
  const root = directory('root', { A: folder }); const app = harness(); await openWorkspace(app, root);
  await vm.runInContext("openProjectFile(state.files[0])", app.context);
  vm.runInContext("loadDocument('', 'neu.md', null, 'A/neu.md', true, true); editor.value = '# Neu'; edited()", app.context);
  await vm.runInContext('saveDocument(true)', app.context);
  assert.equal(folder.entriesMap['neu.md'].text, '# Neu');
  assert.equal(vm.runInContext('state.isNew || state.dirty', app.context), false);
  const tab = app.elements.get('document-tabs').children.find(item => item.children[0].textContent.includes('neu.md'));
  assert.equal(tab.children[0].textContent, 'neu.md');
});

test('Offene ungespeicherte Dokumente erscheinen in Suche und Aufgabenübersicht', async () => {
  const app = harness(); await openWorkspace(app, directory('root', {}));
  vm.runInContext("loadDocument('', 'entwurf.md', null, 'entwurf.md', true, true); editor.value = '# Entwurf\\n- [ ] Beispiel'; edited()", app.context);
  assert.equal(vm.runInContext("searchFiles('Beispiel')[0].file.path", app.context), 'entwurf.md');
  assert.ok(app.elements.get('todos').children.length);
});


test('Ein Tab wird während seines Hintergrundspeicherns nicht ein zweites Mal geöffnet', async () => {
  const a = file('a.md', 'A'), b = file('b.md', 'B'); let release;
  const wait = new Promise(resolve => { release = resolve; });
  a.createWritable = async () => ({ async write(text) { await wait; a.text = text; }, async close() {} });
  const app = harness(); await openWorkspace(app, directory('root', { 'a.md': a, 'b.md': b }));
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", app.context);
  vm.runInContext("editor.value = 'Neuer Inhalt'; edited()", app.context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'b.md'))", app.context);
  const saving = app.runTimers(); await new Promise(resolve => setImmediate(resolve));
  const before = app.elements.get('document-tabs').children.length;
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", app.context);
  assert.equal(vm.runInContext('state.name', app.context), 'b.md');
  assert.equal(app.elements.get('document-tabs').children.length, before);
  release(); await saving; assert.equal(a.text, 'Neuer Inhalt');
});


test('Kanban erstellt Tickets mit gewählter Priorität und filtert die Karten', async () => {
  const project = directory('Projekt', {}), app = harness(); await openWorkspace(app, directory('root', { Projekt: project }));
  await vm.runInContext("createTicket('Dringend', 'hoch')", app.context);
  await vm.runInContext("createTicket('Routine', 'niedrig')", app.context);
  assert.match(project.entriesMap.tickets.entriesMap['dringend.md'].text, /priority: hoch/);
  vm.runInContext("boardPriority = 'hoch'; renderBoard()", app.context);
  const columns = app.elements.get('board').children;
  const cards = columns.flatMap(column => column.children).filter(element => element && element.className === 'card');
  assert.equal(cards.length, 1); assert.equal(cards[0].children[0].textContent, 'Dringend');
});


test('Schließen und Neuladen schützen auch Entwürfe in inaktiven Tabs', async () => {
  const app = harness(); await openWorkspace(app, directory('root', { 'a.md': file('a.md', 'A'), 'b.md': file('b.md', 'B') }));
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", app.context);
  vm.runInContext("editor.value = 'Ungespeichert'; edited()", app.context);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'b.md'))", app.context);
  vm.runInContext('window.confirm = () => false', app.context);
  const aTab = app.elements.get('document-tabs').children.find(item => item.children[0].textContent.includes('a.md'));
  aTab.children[1].onclick();
  assert.match(vm.runInContext("window.GraphitTabs.textFor(state.files.find(f => f.name === 'a.md'))", app.context), /Ungespeichert/);
  const event = { preventDefault() { this.prevented = true; } };
  app.context.window.events.beforeunload[0](event); assert.equal(event.prevented, true);
});


test('Live-Ansicht formatiert weder maskierte Syntax noch Inhalt von Codeblöcken', () => {
  const app = harness();
  const source = ['Anfang', String.raw`\**unformatiert**`, '```', '**Code**', '```'].join('\n');
  app.context.sample = source;
  const html = vm.runInContext("mode = 'live'; editor.value = sample; editor.setSelectionRange(0, 0); highlightMarkdown(editor.value)", app.context);
  assert.doesNotMatch(html, /live-bold/); assert.match(html, /syntax-code/);
});


test('Arbeitsbereichswechsel erhält den Speicherort neuer ungespeicherter Entwürfe', async () => {
  const root = directory('alt', {}), next = directory('neu', {}), app = harness(); await openWorkspace(app, root);
  vm.runInContext("loadDocument('', 'neu.md', null, 'neu.md', true, true)", app.context);
  app.context.next = next;
  assert.equal(await vm.runInContext('activateWorkspace(next, workspaceEpoch)', app.context), false);
  assert.equal(vm.runInContext('state.directory === root && state.path', app.context), 'neu.md');
});

test('Projektübersicht und Dokumentverbindungen nutzen ungespeicherte Inhalte', async () => {
  const ticket = file('t.md', '---\ntitle: Aufgabe\nstatus: offen\npriority: mittel\n---\n[[notiz]]');
  const note = file('notiz.md', '# Notiz\n- [ ] Offen');
  const root = directory('root', { P: directory('P', { tickets: directory('tickets', { 't.md': ticket }), 'notiz.md': note }) });
  const app = harness(); await openWorkspace(app, root);
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'notiz.md'))", app.context);
  const links = app.elements.get('related-files').children[0].children;
  assert.equal(links[1].textContent, 'P/tickets/t.md');
  vm.runInContext("editor.value = '# Notiz\\n- [ ] Neuer Eintrag'; edited()", app.context);
  const groups = app.elements.get('projects-content').children;
  assert.ok(groups[1].children.some(node => node.textContent && node.textContent.includes('Neuer Eintrag')));
});

test('Schnellerfassung schreibt Inbox und hält Eingaben bei Konflikten zurück', async () => {
  const inbox = file('Inbox.md', '# Inbox\n');
  const app = harness(); await openWorkspace(app, directory('root', { 'Inbox.md': inbox }));
  vm.runInContext("$('capture-kind').value = 'task'; $('capture-text').value = 'Termin planen'", app.context);
  await app.elements.get('capture-form').onsubmit({ preventDefault() {} });
  assert.match(inbox.text, /- \[ \] Termin planen/);
  inbox.text = '# Extern geändert\n'; app.elements.get('capture-text').value = 'Nicht verlieren';
  await app.elements.get('capture-form').onsubmit({ preventDefault() {} });
  assert.equal(app.elements.get('capture-text').value, 'Nicht verlieren');
  assert.match(app.elements.get('capture-error').textContent, /extern geändert/);
  assert.doesNotMatch(inbox.text, /Nicht verlieren/);
});

test('Umbenennen aktualisiert Links und geöffneten Tab', async () => {
  const target = file('alt.md', '# Abschnitt'), source = file('quelle.md', '[Ziel](alt.md#abschnitt)');
  const project = directory('P', { 'alt.md': target, 'quelle.md': source });
  const app = harness(); await openWorkspace(app, directory('root', { P: project }));
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'alt.md'))", app.context);
  app.context.prompt = () => 'neu.md';
  await vm.runInContext("window.GraphitWorkspace.rename(state.files.find(f => f.name === 'alt.md'))", app.context);
  assert.equal(project.entriesMap['alt.md'], undefined);
  assert.equal(project.entriesMap['neu.md'].text, '# Abschnitt');
  assert.equal(source.text, '[Ziel](./neu.md#abschnitt)');
  assert.equal(vm.runInContext('state.path', app.context), 'P/neu.md');
});

test('Konfliktdialog zeigt erneute externe Änderungen vor der Auswahl', async () => {
  const target = file('a.md', 'Extern 1'); const app = harness(); app.context.target = target;
  const pending = vm.runInContext("window.GraphitWorkspace.resolveConflict(target, 'Entwurf', 'Extern 1')", app.context);
  target.text = 'Extern 2'; app.elements.get('conflict-save').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.elements.get('conflict-disk').value, 'Extern 2');
  app.elements.get('conflict-load').onclick();
  const result = await pending; assert.equal(result.choice, 'disk'); assert.equal(result.disk, 'Extern 2');
});

test('Umbenennen schützt Änderungen und bereits vorhandene Ziele', async () => {
  const target = file('alt.md', 'Original'), source = file('quelle.md', '[[alt]]'), existing = file('neu.md', 'Erhalten');
  const project = directory('P', { 'alt.md': target, 'quelle.md': source, 'neu.md': existing });
  const app = harness(); await openWorkspace(app, directory('root', { P: project }));
  app.context.prompt = () => 'neu.md';
  await vm.runInContext("window.GraphitWorkspace.rename(state.files.find(f => f.name === 'alt.md'))", app.context);
  assert.equal(existing.text, 'Erhalten'); assert.equal(target.text, 'Original');
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'quelle.md'))", app.context);
  vm.runInContext("editor.value = '[[alt]] Entwurf'; edited()", app.context); app.context.prompt = () => 'anders.md';
  await vm.runInContext("window.GraphitWorkspace.rename(state.files.find(f => f.name === 'alt.md'))", app.context);
  assert.equal(project.entriesMap['anders.md'], undefined); assert.equal(source.text, '[[alt]]');
  assert.equal(vm.runInContext('editor.value', app.context), '[[alt]] Entwurf');
});

test('Speicherkonflikt erlaubt das Laden der externen Version', async () => {
  const target = file('a.md', 'Original'); const app = harness();
  await openWorkspace(app, directory('root', { 'a.md': target }));
  await vm.runInContext("openProjectFile(state.files.find(f => f.name === 'a.md'))", app.context);
  vm.runInContext("editor.value = 'Entwurf'; edited()", app.context); target.text = 'Extern';
  const saving = vm.runInContext('saveDocument(true)', app.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.elements.get('conflict-draft').value, 'Entwurf');
  assert.equal(app.elements.get('conflict-disk').value, 'Extern');
  app.elements.get('conflict-load').onclick(); await saving;
  assert.equal(vm.runInContext('editor.value', app.context), 'Extern'); assert.equal(target.text, 'Extern');
  assert.equal(vm.runInContext('state.dirty', app.context), false);
});

test('Fehler beim Umbenennen lässt Original und Kopie bestehen', async () => {
  const target = file('alt.md', 'Original'), source = file('quelle.md', '[[alt]]');
  source.createWritable = async () => { throw new Error('Kein Schreibzugriff'); };
  const project = directory('P', { 'alt.md': target, 'quelle.md': source });
  const app = harness(); await openWorkspace(app, directory('root', { P: project }));
  let message = ''; app.context.window.alert = text => { message = text; }; app.context.prompt = () => 'neu.md';
  await vm.runInContext("window.GraphitWorkspace.rename(state.files.find(f => f.name === 'alt.md'))", app.context);
  assert.equal(target.text, 'Original'); assert.equal(project.entriesMap['neu.md'].text, 'Original');
  assert.equal(source.text, '[[alt]]'); assert.match(message, /Original sind vorhanden/);
});

test('Anker funktionieren auch in einzeln geöffneten Dokumenten', () => {
  const app = harness();
  vm.runInContext("state.name = 'einzeln.md'; state.path = ''; state.folderTarget = false; editor.value = '# Kapitel\\n\\n[weiter](#kapitel)'", app.context);
  assert.match(vm.runInContext("inline('[weiter](#kapitel)')", app.context), /data-folio-anchor="kapitel"/);
  assert.match(vm.runInContext("inline('[fehlt](#nicht-da)')", app.context), /Überschrift nicht gefunden/);
});
