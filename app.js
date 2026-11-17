'use strict';

const $ = id => document.getElementById(id);
const editor = $('editor');
const state = { directory: null, file: null, name: 'Willkommen.md', path: '', saved: '', dirty: false, files: [], tree: [], projects: [], project: '', dragged: null, folderTarget: false, expanded: new Set(), scanErrors: [], moving: false };
const welcome = `# Willkommen in deinem Projekt\n\nEin guter Ort für große Ideen und die kleinen Schritte dazwischen. Hier kannst du Gedanken sammeln, Entscheidungen festhalten und sehen, was als Nächstes ansteht.\n\n## Die nächsten Schritte\n\n- [x] Einen Platz für meine Ideen schaffen\n- [ ] Einen Projektordner öffnen\n- [ ] Das erste Ticket anlegen\n\n> Auch große Projekte beginnen mit einem kleinen Schritt.\n`;
const statusNames = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt' };
let workspaceEpoch = 0, refreshEpoch = 0, lastWorkspace = null, storageWrites = Promise.resolve();

function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4000); }
function updateStatus() {
  state.dirty = editor.value !== state.saved;
  $('save-status').classList.toggle('saved', !state.dirty);
  $('save-status').innerHTML = `<i></i> ${state.dirty ? 'Nicht gespeichert' : 'Gespeichert'}`;
  $('editor-filename').textContent = state.name;
  $('crumb-file').textContent = state.path || state.name;
  $('word-count').textContent = `${(editor.value.trim().match(/\S+/g) || []).length} Wörter`;
  document.title = `${state.dirty ? '● ' : ''}${state.name} – Folio`;
}
function changed() { updateStatus(); renderPreview(); renderBoard(); renderTodos(); }
function canLeave() { return !state.dirty || window.confirm('Es gibt ungespeicherte Änderungen. Möchtest du sie verwerfen?'); }
function loadDocument(text, name, file = null, path = '', folderTarget = false) {
  state.folderTarget = folderTarget; editor.value = text; state.name = name; state.path = path; state.file = file; state.saved = text;
  const project = path.split('/')[0]; if (path.includes('/') && state.projects.some(p => p.name === project)) state.project = project;
  changed(); renderFiles(); $('sidebar').classList.remove('open'); $('toggle-sidebar').setAttribute('aria-expanded', 'false');
}
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
editor.addEventListener('input', changed);
function escapeHTML(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function safeURL(value, image = false) {
  const raw = value.replace(/&amp;/g, '&').trim();
  if (/^(?:https?:|mailto:)/i.test(raw) || (!/^[a-z][a-z\d+.-]*:/i.test(raw) && !raw.startsWith('//'))) return escapeHTML(raw);
  return image ? '' : '#';
}
function inlineBase(text) {
  const tokens = [];
  const protect = html => { tokens.push(html); return `\u0000${tokens.length - 1}\u0000`; };
  let s = escapeHTML(text);
  s = s.replace(/`([^`]+)`/g, (_, code) => protect(`<code>${code}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => { const src = safeURL(url, true); return src ? protect(`<img src="${src}" alt="${alt}">`) : alt; });
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`).replace(/\*([^*]+)\*|_([^_]+)_/g, (_, a, b) => `<em>${a || b}</em>`).replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
}
function inline(text) {
  const links = FolioCore.inlineLinks(text); let result = '', position = 0;
  for (const link of links) {
    result += inlineBase(text.slice(position, link.start));
    const resolution = FolioCore.resolveLink(state.path, link.target, link.type, state.folderTarget && state.directory ? state.files : []);
    const label = escapeHTML(link.label);
    if (resolution.kind === 'external') result += `<a href="${safeURL(link.target)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    else if (resolution.kind === 'local') result += `<a href="#" data-folio-path="${escapeHTML(resolution.path)}">${label}</a>`;
    else result += `<span class="unresolved-link" title="${escapeHTML(state.directory && state.folderTarget ? resolution.reason : 'Öffne einen Arbeitsbereich, um lokale Links zu verwenden')}">${label} ⓘ</span>`;
    position = link.end;
  }
  return result + inlineBase(text.slice(position));
}
function markdown(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'); let out = '', list = '', paragraph = [], code = null, codeFence = null, quote = [];
  const closeList = () => { if (list) { out += `</${list}>`; list = ''; } };
  const flushParagraph = () => { if (paragraph.length) { out += `<p>${inline(paragraph.join(' '))}</p>`; paragraph = []; } };
  const flushQuote = () => { if (quote.length) { out += `<blockquote>${markdown(quote.join('\n'))}</blockquote>`; quote = []; } };
  for (const line of lines) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (code !== null) { if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length && !fence[2].trim()) { out += `<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`; code = null; codeFence = null; } else code.push(line); continue; }
    if (fence) { flushParagraph(); flushQuote(); closeList(); code = []; codeFence = fence[1]; continue; }
    if (/^\s*<!--\s*kanban:(?:start|end)\s*-->\s*$/.test(line)) { flushParagraph(); flushQuote(); closeList(); continue; }
    const q = line.match(/^\s*>\s?(.*)$/); if (q) { flushParagraph(); closeList(); quote.push(q[1]); continue; } flushQuote();
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/); if (heading) { flushParagraph(); closeList(); const n = heading[1].length; out += `<h${n}>${inline(heading[2])}</h${n}>`; continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushParagraph(); closeList(); out += '<hr>'; continue; }
    const item = line.match(/^\s*(?:([-+*])\s+|(\d+)\.\s+)(.*)$/); if (item) { flushParagraph(); const type = item[2] ? 'ol' : 'ul'; if (list !== type) { closeList(); list = type; out += `<${type}>`; } const task = item[3].match(/^\[([ xX])\]\s*(.*)$/); out += task ? `<li><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}> ${inline(task[2])}</li>` : `<li>${inline(item[3])}</li>`; continue; }
    closeList(); paragraph.push(line.trim());
  }
  flushParagraph(); flushQuote(); closeList(); if (code !== null) out += `<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`;
  return out;
}
function renderPreview() { $('preview').innerHTML = markdown(editor.value); renderBacklinks(); }
function renderBacklinks() {
  const list = $('backlinks-list'); list.replaceChildren(); $('backlinks-count').textContent = '';
  const message = text => { const p = document.createElement('p'); p.className = 'backlinks-empty'; p.textContent = text; list.append(p); };
  if (!state.directory || !state.folderTarget || !state.path) { message('Öffne eine Datei aus einem Arbeitsbereich, um Backlinks zu sehen.'); return; }
  const groups = [];
  for (const file of state.files) {
    if (file.error) continue;
    const text = file.path === state.path ? editor.value : file.text;
    if (file.linkText !== text) { file.linkText = text; file.links = FolioCore.findLinks(text); }
    const links = file.links.filter(link => { const result = FolioCore.resolveLink(file.path, link.target, link.type, state.files); return result.kind === 'local' && result.path === state.path; });
    if (links.length) groups.push({ file, links });
  }
  const total = groups.reduce((n, group) => n + group.links.length, 0); $('backlinks-count').textContent = total ? String(total) : '';
  if (!total) message('Noch keine eingehenden Verweise gefunden.');
  for (const { file, links } of groups) {
    const group = document.createElement('div'); group.className = 'backlink-group'; const heading = document.createElement('strong'); heading.textContent = file.path; group.append(heading);
    for (const link of links) { const button = document.createElement('button'); button.className = 'backlink-item'; const line = document.createElement('span'); line.textContent = `Zeile ${link.line}`; const context = document.createElement('span'); context.textContent = link.context; button.append(line, context); button.onclick = () => openProjectFile(file, link.line); group.append(button); }
    list.append(group);
  }
  if (state.scanErrors.length) message('Einige Dateien konnten nicht gelesen werden; die Liste ist möglicherweise unvollständig.');
}
$('preview').addEventListener('click', event => {
  const link = event.target.closest('a[data-folio-path]'); if (!link) return;
  event.preventDefault(); const file = state.files.find(item => item.path === link.dataset.folioPath); if (file) openProjectFile(file);
});

const markdownFile = name => /\.(?:md|markdown)$/i.test(name);
function currentProject() { return state.projects.find(project => project.name === state.project); }
function ticketFiles() { return state.files.filter(file => file.path.startsWith(`${state.project}/tickets/`)); }
function makeMessage(title, description) { const box = document.createElement('div'); box.className = 'board-empty'; const strong = document.createElement('strong'); strong.textContent = title; const p = document.createElement('p'); p.textContent = description; box.append(strong, p); return box; }
function renderBoard() {
  const board = $('board'), errors = $('ticket-errors'), select = $('board-project');
  board.replaceChildren(); errors.replaceChildren(); select.replaceChildren();
  for (const project of state.projects) { const option = document.createElement('option'); option.value = project.name; option.textContent = project.name; select.append(option); }
  select.value = state.project; select.disabled = !state.projects.length; $('new-ticket').disabled = !currentProject();
  if (!state.directory) { board.append(makeMessage('Öffne einen Arbeitsbereich', 'Wähle einen Ordner, um Projekte und ihre Tickets zu sehen.')); return; }
  if (!state.projects.length) { board.append(makeMessage('Noch keine Projekte gefunden', 'Jeder direkte Unterordner des Arbeitsbereichs ist ein Projekt.')); return; }
  const tickets = [];
  for (const file of ticketFiles()) { if (file.error) { const p = document.createElement('p'); p.textContent = `${file.path}: ${file.error}`; errors.append(p); continue; } const ticket = FolioCore.parseTicket(file.text); if (ticket.error) { const p = document.createElement('p'); p.textContent = `${file.path}: ${ticket.error}`; errors.append(p); } else tickets.push({ ...ticket, file }); }
  tickets.sort((a, b) => a.title.localeCompare(b.title, 'de') || a.file.path.localeCompare(b.file.path, 'de'));
  FolioCore.statuses.forEach((status, index) => {
    const col = document.createElement('div'); col.className = 'column'; const heading = document.createElement('h3'); heading.textContent = statusNames[status]; const count = document.createElement('span'); count.textContent = tickets.filter(t => t.status === status).length; heading.append(count); col.append(heading);
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('drag-over'); if (state.dragged) moveTicket(state.dragged, status); state.dragged = null; });
    for (const ticket of tickets.filter(t => t.status === status)) {
      const card = document.createElement('div'); card.className = `card${status === 'erledigt' ? ' done' : ''}`; card.draggable = true;
      const open = document.createElement('button'); open.className = 'ticket-open'; open.textContent = ticket.title; open.title = `Ticket öffnen: ${ticket.file.path}`; open.onclick = () => openProjectFile(ticket.file); card.append(open);
      const priority = document.createElement('span'); priority.className = `priority priority-${ticket.priority}`; priority.textContent = `Priorität: ${ticket.priority}`; card.append(priority);
      card.addEventListener('dragstart', e => { state.dragged = ticket.file.path; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ticket.file.path); });
      card.addEventListener('dragend', () => { state.dragged = null; document.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); });
      const controls = document.createElement('div'); controls.className = 'card-controls';
      for (const [symbol, offset, label] of [['←', -1, 'In vorherige Spalte verschieben'], ['→', 1, 'In nächste Spalte verschieben']]) { const b = document.createElement('button'); b.textContent = symbol; b.disabled = !FolioCore.statuses[index + offset] || state.moving; b.setAttribute('aria-label', `${label}: ${ticket.title}`); b.onclick = () => moveTicket(ticket.file.path, FolioCore.statuses[index + offset]); controls.append(b); }
      card.append(controls); col.append(card);
    }
    board.append(col);
  });
}
async function moveTicket(path, status) {
  if (state.moving) return;
  const file = state.files.find(item => item.path === path); if (!file) return;
  if (state.path === path && state.dirty) { toast('Bitte speichere oder verwirf zuerst die Änderungen an diesem Ticket.'); return; }
  state.moving = true; editor.readOnly = true; $('save').disabled = true; renderBoard();
  try {
    const latest = await (await file.handle.getFile()).text();
    if (latest !== file.text) { if (state.path === path && !state.dirty) { editor.value = latest; state.saved = latest; updateStatus(); renderPreview(); } await refreshFiles(); toast('Das Ticket wurde extern geändert. Die Ansicht wurde aktualisiert.'); return; }
    const updated = FolioCore.setTicketStatus(latest, status); if (updated === null) throw new Error('Ungültiger Ticket-Header.');
    const writable = await file.handle.createWritable(); await writable.write(updated); await writable.close();
    file.text = updated;
    if (state.path === path && !state.dirty) { editor.value = updated; state.saved = updated; updateStatus(); renderPreview(); }
    renderTodos(); toast('Ticketstatus gespeichert.');
  } catch (err) { toast(`Ticket konnte nicht verschoben werden: ${err.message}`); }
  finally { state.moving = false; editor.readOnly = false; $('save').disabled = false; renderBoard(); }
}
$('board-project').onchange = event => { state.project = event.target.value; renderBoard(); };
$('new-ticket').onclick = async () => {
  const project = currentProject(); if (!project) return;
  const input = prompt('Titel des neuen Tickets:'); if (input === null) return; const title = input.trim(); if (!title || /[\r\n]/.test(title)) { toast('Bitte einen einzeiligen Titel eingeben.'); return; }
  try {
    const dir = await project.handle.getDirectoryHandle('tickets', { create: true });
    const base = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ticket';
    let name = `${base}.md`, number = 2;
    while (true) { try { await dir.getFileHandle(name); name = `${base}-${number++}.md`; } catch (err) { if (err.name === 'NotFoundError') break; throw err; } }
    const handle = await dir.getFileHandle(name, { create: true }); const text = `---\ntitle: ${JSON.stringify(title)}\nstatus: offen\npriority: mittel\n---\n\n`;
    const writable = await handle.createWritable(); await writable.write(text); await writable.close(); state.expanded.add(project.name); state.expanded.add(`${project.name}/tickets`); await refreshFiles(); toast('Ticket angelegt. Öffne es im Board, um die Beschreibung zu bearbeiten.');
  } catch (err) { toast(`Ticket konnte nicht angelegt werden: ${err.message}`); await refreshFiles(); }
};
function renderTodos() {
  const list = $('todos'); list.replaceChildren();
  if (!state.directory) { list.append(makeMessage('Öffne einen Arbeitsbereich', 'Die TODO-Übersicht durchsucht alle Markdown-Dateien im ausgewählten Ordner.')); return; }
  const groups = new Map();
  for (const file of state.files) {
    if (file.error) continue;
    const text = state.path === file.path && state.folderTarget ? editor.value : file.text;
    const parts = file.path.split('/'); const group = parts.length > 1 ? `project:${parts[0]}` : 'root:';
    for (const todo of FolioCore.findTodos(text)) { if (!groups.has(group)) groups.set(group, []); groups.get(group).push({ ...todo, file }); }
  }
  if (!groups.size) { list.append(makeMessage('Alles erledigt', 'In den lesbaren Markdown-Dateien wurden keine offenen TODOs gefunden.')); }
  for (const [key, todos] of [...groups].sort((a,b) => a[0].localeCompare(b[0], 'de'))) {
    const name = key === 'root:' ? 'Arbeitsbereich' : key.slice('project:'.length);
    const section = document.createElement('section'); section.className = 'todo-group'; const heading = document.createElement('h3'); heading.textContent = `${name} · ${todos.length}`; section.append(heading);
    for (const todo of todos) { const button = document.createElement('button'); button.className = 'todo-item'; const title = document.createElement('strong'); title.textContent = `○  ${todo.text}`; const path = document.createElement('span'); path.textContent = `${todo.file.path}:${todo.line}`; button.append(title, path); button.onclick = () => openProjectFile(todo.file, todo.line); section.append(button); } list.append(section);
  }
  if (state.scanErrors.length) { const warning = document.createElement('p'); warning.className = 'scan-warning'; warning.textContent = `${state.scanErrors.length} Einträge konnten nicht gelesen werden. Aktualisiere den Arbeitsbereich und prüfe die Berechtigungen.`; list.prepend(warning); }
}
async function scanDirectory(dir, prefix = '', scan = { files: [], errors: [], rootError: null }) {
  const nodes = []; const entries = [];
  try { for await (const [name, handle] of dir.entries()) entries.push({ name, handle }); }
  catch (err) { scan.errors.push(`${prefix || dir.name}: ${err.message}`); if (!prefix) scan.rootError = err; return nodes; }
  entries.sort((a, b) => (a.handle.kind === b.handle.kind ? a.name.localeCompare(b.name, 'de') : a.handle.kind === 'directory' ? -1 : 1));
  for (const { name, handle } of entries) {
    const path = prefix ? `${prefix}/${name}` : name; const node = { name, path, handle, kind: handle.kind }; nodes.push(node);
    if (handle.kind === 'directory') node.children = await scanDirectory(handle, path, scan);
    else if (markdownFile(name)) { try { node.text = await (await handle.getFile()).text(); } catch (err) { node.error = err.message; scan.errors.push(`${path}: ${err.message}`); } scan.files.push(node); }
  }
  return nodes;
}
async function readWorkspace(dir) {
  const scan = { files: [], errors: [], rootError: null }; const tree = await scanDirectory(dir, '', scan);
  if (scan.rootError) throw scan.rootError;
  return { ...scan, tree };
}
function applyWorkspaceScan(scan) {
  state.files = scan.files; state.scanErrors = scan.errors; state.tree = scan.tree; state.projects = scan.tree.filter(node => node.kind === 'directory');
  if (!state.projects.some(p => p.name === state.project)) state.project = state.projects[0]?.name || '';
  renderFiles(); renderBoard(); renderTodos(); renderPreview();
  if (state.scanErrors.length) toast(`${state.scanErrors.length} Einträge konnten nicht gelesen werden.`);
}
async function refreshFiles() {
  if (!state.directory) return;
  const dir = state.directory, epoch = ++refreshEpoch;
  try { const scan = await readWorkspace(dir); if (epoch === refreshEpoch && dir === state.directory) applyWorkspaceScan(scan); }
  catch (err) { if (epoch === refreshEpoch && dir === state.directory) toast(`Arbeitsbereich konnte nicht gelesen werden: ${err.message}`); }
}
function renderFiles() {
  const list = $('file-list'); list.replaceChildren();
  if (!state.tree.length) { const p = document.createElement('p'); p.className = 'empty-files'; p.textContent = state.directory ? 'Dieser Ordner ist leer.' : 'Öffne einen Ordner, um deine Dateien hier zu sehen.'; list.append(p); return; }
  function addNodes(nodes, parent) {
    for (const node of nodes) {
      if (node.kind === 'directory') { const details = document.createElement('details'); details.open = state.expanded.has(node.path); details.ontoggle = () => { if (details.open) state.expanded.add(node.path); else state.expanded.delete(node.path); }; const summary = document.createElement('summary'); summary.textContent = `▸ ${node.name}`; summary.title = node.path; details.append(summary); const children = document.createElement('div'); children.className = 'tree-children'; addNodes(node.children, children); details.append(children); parent.append(details); }
      else { const b = document.createElement('button'); b.className = `file-item${node.path === state.path && state.folderTarget ? ' active' : ''}`; b.title = markdownFile(node.name) ? node.path : `${node.path} (nur sichtbar)`; b.append(document.createTextNode(`${markdownFile(node.name) ? '▤' : '·'}  ${node.name}`)); if (markdownFile(node.name)) b.onclick = () => openProjectFile(node); else { b.disabled = true; b.classList.add('non-markdown'); } parent.append(b); }
    }
  }
  addNodes(state.tree, list);
}
async function openProjectFile(file, line = null) {
  if (state.path === file.path && state.folderTarget && state.dirty) { if (line) focusLine(line); return; }
  if (!canLeave()) return;
  try { const contents = await file.handle.getFile(); loadDocument(await contents.text(), file.name, file.handle, file.path, true); if (line) focusLine(line); } catch (err) { toast(`Datei konnte nicht geöffnet werden: ${err.message}`); }
}
function focusLine(line) { const lines = editor.value.split('\n'); let offset = 0; for (let i = 0; i < Math.min(line - 1, lines.length); i++) offset += lines[i].length + 1; editor.focus(); editor.setSelectionRange(offset, Math.min(offset + (lines[line - 1] || '').length, editor.value.length)); const style = getComputedStyle(editor); editor.scrollTop = Math.max(0, (line - 3) * parseFloat(style.lineHeight)); }
function workspaceMessage(text = '') { const el = $('workspace-message'); el.textContent = text; el.hidden = !text; }
function storageDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('Browserspeicher ist nicht verfügbar')); return; }
    let request; try { request = window.indexedDB.open('folio-workspace', 1); } catch (err) { reject(err); return; }
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Browserspeicher konnte nicht geöffnet werden'));
    request.onblocked = () => reject(new Error('Browserspeicher ist blockiert'));
  });
}
async function loadLastWorkspace() {
  const db = await storageDatabase();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readonly'); const request = tx.objectStore('settings').get('lastWorkspace'); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); tx.onabort = () => reject(tx.error || new Error('Lesen abgebrochen')); }); }
  finally { db.close(); }
}
async function storeLastWorkspace(handle) {
  const db = await storageDatabase();
  try { await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(handle, 'lastWorkspace'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('Speichern fehlgeschlagen')); tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen')); }); }
  finally { db.close(); }
}
async function activateWorkspace(dir, epoch) {
  const scan = await readWorkspace(dir);
  if (epoch !== workspaceEpoch) return false;
  ++refreshEpoch;
  // A document from the previous workspace remains open under its original file handle.
  if (state.folderTarget && state.path && state.directory !== dir) { state.folderTarget = false; state.path = ''; }
  if (!state.file) state.folderTarget = true;
  state.directory = dir; state.project = ''; state.expanded.clear();
  $('project-name').textContent = dir.name; $('crumb-project').textContent = dir.name; $('project-caption').textContent = 'Arbeitsbereich';
  $('restore-folder').hidden = true; workspaceMessage();
  applyWorkspaceScan(scan); updateStatus();
  return true;
}
async function restoreOnStart() {
  const epoch = workspaceEpoch;
  if (!window.indexedDB || !window.showDirectoryPicker) return;
  try {
    const handle = await loadLastWorkspace(); if (epoch !== workspaceEpoch || !handle || handle.kind !== 'directory') return;
    lastWorkspace = handle;
    const permission = await handle.queryPermission({ mode: 'readwrite' }); if (epoch !== workspaceEpoch) return;
    if (permission === 'granted') { try { await activateWorkspace(handle, epoch); } catch (err) { if (epoch === workspaceEpoch) { $('restore-folder').hidden = false; workspaceMessage('Der letzte Arbeitsbereich ist nicht erreichbar. Bitte wähle ihn erneut aus.'); } } }
    else { $('restore-folder').hidden = false; workspaceMessage(`Zugriff auf „${handle.name}“ muss erneut bestätigt werden.`); }
  } catch (err) { if (epoch === workspaceEpoch) workspaceMessage('Der letzte Arbeitsbereich konnte nicht geladen werden. Bitte wähle einen Ordner aus.'); }
}
$('restore-folder').onclick = async () => {
  if (!lastWorkspace) return;
  const epoch = ++workspaceEpoch, handle = lastWorkspace;
  try {
    // requestPermission must be called directly from the click, before unrelated awaits.
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (epoch !== workspaceEpoch) return;
    if (permission !== 'granted') { workspaceMessage('Der Zugriff wurde nicht freigegeben. Wähle bei Bedarf einen anderen Ordner.'); return; }
    if (await activateWorkspace(handle, epoch)) toast('Arbeitsbereich wiederhergestellt.');
  } catch (err) { if (epoch === workspaceEpoch) workspaceMessage('Der letzte Arbeitsbereich ist nicht erreichbar. Bitte wähle ihn erneut aus.'); }
};
$('open-folder').onclick = async () => {
  if (!window.showDirectoryPicker) { toast('Dein Browser unterstützt keinen Ordnerzugriff. Öffne stattdessen eine einzelne Datei.'); return; }
  const epoch = ++workspaceEpoch;
  try {
    const options = { mode: 'readwrite', id: 'folio-arbeitsbereich' };
    const dir = await window.showDirectoryPicker(options); if (epoch !== workspaceEpoch) return;
    if (!await activateWorkspace(dir, epoch)) return;
    lastWorkspace = dir; toast('Arbeitsbereich geöffnet.');
    storageWrites = storageWrites.catch(() => {}).then(async () => { if (epoch === workspaceEpoch) await storeLastWorkspace(dir); });
    try { await storageWrites; } catch (err) { if (epoch === workspaceEpoch) workspaceMessage('Der Arbeitsbereich ist geöffnet, konnte aber nicht für das nächste Mal gespeichert werden.'); }
  } catch (err) { if (err.name !== 'AbortError' && epoch === workspaceEpoch) workspaceMessage(`Ordner konnte nicht geöffnet werden: ${err.message}`); }
};
$('refresh-files').onclick = refreshFiles;
$('open-file').onclick = () => { if (canLeave()) $('file-input').click(); };
$('file-input').onchange = async event => { const file = event.target.files[0]; if (file) { try { loadDocument(await file.text(), file.name); } catch (err) { toast(`Datei konnte nicht geöffnet werden: ${err.message}`); } } event.target.value = ''; };
$('new-file').onclick = () => { if (!canLeave()) return; const name = prompt('Name der neuen Markdown-Datei:', 'Neues-Dokument.md'); if (name === null) return; const clean = name.trim(); if (!clean || /[\\/]/.test(clean) || clean === '.' || clean === '..') { toast('Bitte einen gültigen Dateinamen ohne Schrägstrich eingeben.'); return; } loadDocument('', /\.(md|markdown)$/i.test(clean) ? clean : `${clean}.md`, null, '', !!state.directory); toast('Neue Datei angelegt. Speichere sie, um sie dauerhaft abzulegen.'); };
$('save').onclick = async () => { try { if (state.file || (state.directory && state.folderTarget)) { let handle = state.file; if (!handle) { try { await state.directory.getFileHandle(state.name); if (!confirm(`„${state.name}“ existiert bereits. Überschreiben?`)) return; } catch (err) { if (err.name !== 'NotFoundError') throw err; } handle = await state.directory.getFileHandle(state.name, { create: true }); } const writable = await handle.createWritable(); await writable.write(editor.value); await writable.close(); state.file = handle; state.path ||= state.name; state.saved = editor.value; await refreshFiles(); updateStatus(); toast('Datei gespeichert.'); } else { const blob = new Blob([editor.value], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = state.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); state.saved = editor.value; updateStatus(); toast('Markdown-Datei heruntergeladen.'); } } catch (err) { if (err.name !== 'AbortError') toast(`Speichern fehlgeschlagen: ${err.message}`); } };
for (const name of ['preview', 'board', 'todos']) $(`${name}-tab`).onclick = () => { for (const other of ['preview', 'board', 'todos']) { const selected = name === other; $(`${other}-tab`).setAttribute('aria-selected', String(selected)); $(`${other}-view`).hidden = !selected; } $('footer-view').textContent = { preview: 'VORSCHAU', board: 'KANBAN', todos: 'TODOS' }[name]; };
$('toggle-sidebar').onclick = () => { const open = $('sidebar').classList.toggle('open'); $('toggle-sidebar').setAttribute('aria-expanded', String(open)); };
editor.value = welcome; state.saved = ''; changed();
const restoreReady = restoreOnStart();
