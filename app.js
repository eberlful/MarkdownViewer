'use strict';

const $ = id => document.getElementById(id);
let editor = $('editor');
const state = { directory: null, file: null, name: 'Willkommen.md', path: '', saved: '', dirty: false, isNew: false, files: [], tree: [], projects: [], project: '', dragged: null, folderTarget: false, expanded: new Set(), scanErrors: [], moving: false };
const welcome = `# Willkommen in deinem Projekt\n\nEin guter Ort für große Ideen und die kleinen Schritte dazwischen. Hier kannst du Gedanken sammeln, Entscheidungen festhalten und sehen, was als Nächstes ansteht.\n\n## Die nächsten Schritte\n\n- [x] Einen Platz für meine Ideen schaffen\n- [ ] Einen Projektordner öffnen\n- [ ] Das erste Ticket anlegen\n\n> Auch große Projekte beginnen mit einem kleinen Schritt.\n`;
const statusNames = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt' };
let workspaceEpoch = 0, refreshEpoch = 0, lastWorkspace = null, storageWrites = Promise.resolve();
let saveTimer = null, saveInFlight = null, saveError = '', documentEpoch = 0;
let boardPriority = '', todoProject = '', todoFile = '';

function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 4000); }
function updateStatus() {
  state.dirty = state.isNew || editor.value !== state.saved;
  $('save-status').classList.toggle('saved', !state.dirty);
  $('save-status').innerHTML = `<i></i> ${saveInFlight ? 'Wird gespeichert …' : saveError ? 'Speichern fehlgeschlagen' : state.dirty ? 'Nicht gespeichert' : 'Gespeichert'}`;
  $('save-status').title = saveError;
  $('editor-filename').textContent = state.name;
  $('crumb-file').textContent = state.path || state.name;
  $('word-count').textContent = `${(editor.value.trim().match(/\S+/g) || []).length} Wörter`;
  document.title = `${state.dirty ? '● ' : ''}${state.name} – Graphit`;
}
function changed() { updateStatus(); if (window.GraphitTabs) window.GraphitTabs.capture(); if (window.GraphitWorkspace) window.GraphitWorkspace.render(); if (window.GraphitEnhancements) window.GraphitEnhancements.changed(); if (window.GraphitTags) window.GraphitTags.render(); renderPreview(); renderBoard(); renderTodos(); if (window.FolioFeatures) window.FolioFeatures.renderEditor(); }
function edited() { saveError = ''; changed(); scheduleAutosave(); }
function canLeave(tabSwitch = false) { if (saveInFlight || state.moving) { toast('Bitte warte, bis das Speichern abgeschlossen ist.'); return false; } if (tabSwitch && window.GraphitTabs) return true; return !state.dirty || window.confirm('Es gibt ungespeicherte Änderungen. Möchtest du sie verwerfen?'); }
function loadDocument(text, name, file = null, path = '', folderTarget = false, isNew = false) {
  if (window.GraphitTabs) window.GraphitTabs.prepareNew();
  clearTimeout(saveTimer); saveError = ''; documentEpoch++;
  state.folderTarget = folderTarget; state.isNew = isNew; editor.value = text; state.name = name; state.path = path; state.file = file; state.saved = text;
  const project = projectForPath(path); if (project) state.project = project.name;
  if (folderTarget && path) { const parts = path.split('/'); parts.pop(); let parent = ''; for (const part of parts) { parent = parent ? `${parent}/${part}` : part; state.expanded.add(parent); } }
  changed(); renderFiles(); if (window.FolioFeatures) window.FolioFeatures.documentOpened(); $('sidebar').classList.remove('open'); $('toggle-sidebar').setAttribute('aria-expanded', 'false');
}
window.addEventListener('beforeunload', event => { if (state.dirty || (window.GraphitTabs && window.GraphitTabs.hasDirty())) { event.preventDefault(); event.returnValue = ''; } });
function bindAppEditor(element) { element.addEventListener('input', edited); }
bindAppEditor(editor);
window.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
  event.preventDefault();
  if (!event.repeat && !$('save').disabled) $('save').click();
});
function escapeHTML(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function safeURL(value, image = false) {
  const raw = value.replace(/&amp;/g, '&').trim();
  if (/^(?:https?:|mailto:)/i.test(raw) || (!/^[a-z][a-z\d+.-]*:/i.test(raw) && !raw.startsWith('//'))) return escapeHTML(raw);
  return image ? '' : '#';
}
function inlineBase(text) {
  const tokens = [];
  const protect = html => { tokens.push(html); return `\u0000${tokens.length - 1}\u0000`; };
  let raw = text;
  for (const tag of FolioCore.inlineTags(text).reverse()) raw = raw.slice(0, tag.start) + protect(`<button type="button" class="markdown-tag" data-tag="${escapeHTML(tag.name)}">#${escapeHTML(tag.name)}</button>`) + raw.slice(tag.end);
  let s = escapeHTML(raw);
  s = s.replace(/`([^`]+)`/g, (_, code) => protect(`<code>${code}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, url) => { const src = safeURL(url, true); return src ? protect(`<img src="${src}" alt="${alt}">`) : alt; });
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`).replace(/\*([^*]+)\*|_([^_]+)_/g, (_, a, b) => `<em>${a || b}</em>`).replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
}
function inline(text) {
  const links = FolioCore.inlineLinks(text); let result = '', position = 0;
  for (const link of links) {
    result += inlineBase(text.slice(position, link.start));
    const resolution = FolioCore.resolveLink(state.path || state.name, link.target, link.type, state.folderTarget && state.directory ? workspaceFiles() : []);
    const label = escapeHTML(link.label);
    if (resolution.kind === 'external') result += `<a href="${safeURL(link.target)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    else if (resolution.kind === 'local') {
      const fragment = link.target.includes('#') ? link.target.slice(link.target.indexOf('#') + 1) : '';
      const file = workspaceFiles().find(item => item.path === resolution.path);
      const text = resolution.path === (state.path || state.name) ? editor.value : file && (window.GraphitTabs ? window.GraphitTabs.textFor(file) : file.text);
      if (fragment && (text === undefined || !FolioCore.anchorLine(text, fragment))) result += `<span class="unresolved-link" title="Überschrift nicht gefunden">${label} ⓘ</span>`;
      else result += `<a href="#" data-folio-path="${escapeHTML(resolution.path)}" data-folio-anchor="${escapeHTML(fragment)}">${label}</a>`;
    }
    else result += `<span class="unresolved-link" title="${escapeHTML(state.directory && state.folderTarget ? resolution.reason : 'Öffne einen Arbeitsbereich, um lokale Links zu verwenden')}">${label} ⓘ</span>`;
    position = link.end;
  }
  return result + inlineBase(text.slice(position));
}
function markdown(text, lineOffset = 0) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'); let out = '', list = '', paragraph = [], code = null, codeFence = null, quote = [], quoteStart = 0;
  const closeList = () => { if (list) { out += `</${list}>`; list = ''; } };
  const flushParagraph = () => { if (paragraph.length) { out += `<p>${inline(paragraph.join(' '))}</p>`; paragraph = []; } };
  const flushQuote = () => { if (quote.length) { out += `<blockquote>${markdown(quote.join('\n'), quoteStart)}</blockquote>`; quote = []; } };
  for (const [index, line] of lines.entries()) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (code !== null) { if (fence && fence[1][0] === codeFence[0] && fence[1].length >= codeFence.length && !fence[2].trim()) { out += `<pre><code>${escapeHTML(code.join('\n'))}</code></pre>`; code = null; codeFence = null; } else code.push(line); continue; }
    if (fence) { flushParagraph(); flushQuote(); closeList(); code = []; codeFence = fence[1]; continue; }
    if (/^\s*<!--\s*kanban:(?:start|end)\s*-->\s*$/.test(line)) { flushParagraph(); flushQuote(); closeList(); continue; }
    const q = line.match(/^\s*>\s?(.*)$/); if (q) { flushParagraph(); closeList(); if (!quote.length) quoteStart = lineOffset + index; quote.push(q[1]); continue; } flushQuote();
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/); if (heading) { flushParagraph(); closeList(); const n = heading[1].length; out += `<h${n}>${inline(heading[2])}</h${n}>`; continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushParagraph(); closeList(); out += '<hr>'; continue; }
    const item = line.match(/^\s*(?:([-+*])\s+|(\d+)\.\s+)(.*)$/); if (item) { flushParagraph(); const type = item[2] ? 'ol' : 'ul'; if (list !== type) { closeList(); list = type; out += `<${type}>`; } const task = item[3].match(/^\[([ xX])\]\s*(.*)$/); out += task ? `<li><input type="checkbox" data-task-line="${lineOffset + index + 1}" aria-label="Aufgabe ${task[1].toLowerCase() === 'x' ? 'wieder öffnen' : 'erledigen'}" ${task[1].toLowerCase() === 'x' ? 'checked' : ''}> ${inline(task[2])}</li>` : `<li>${inline(item[3])}</li>`; continue; }
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
  for (const file of workspaceFiles()) {
    if (file.error) continue;
    const text = window.GraphitTabs ? window.GraphitTabs.textFor(file) : file.path === state.path ? editor.value : file.text;
    if (file.linkText !== text) { file.linkText = text; file.links = FolioCore.findLinks(text); }
    const links = file.links.filter(link => { const result = FolioCore.resolveLink(file.path, link.target, link.type, workspaceFiles()); return result.kind === 'local' && result.path === state.path; });
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
$('preview').addEventListener('change', event => {
  const box = event.target; if (!box.matches('input[data-task-line]')) return;
  const lines = editor.value.split(/(?<=\n)/); const index = Number(box.dataset.taskLine) - 1;
  const match = lines[index]?.match(/^(\s*(?:>\s*)*\s*(?:[-+*]|\d+\.)\s+\[)([ xX])(\])/);
  if (!match) { renderPreview(); return; }
  const offset = lines.slice(0, index).reduce((sum, line) => sum + line.length, 0) + match[1].length;
  const start = editor.selectionStart, end = editor.selectionEnd, scroll = editor.scrollTop, value = box.checked ? 'x' : ' ';
  editor.focus(); editor.setSelectionRange(offset, offset + 1);
  const inserted = document.execCommand('insertText', false, value);
  if (!inserted) { editor.setRangeText(value, offset, offset + 1); edited(); }
  editor.setSelectionRange(start, end); editor.scrollTop = scroll;
  const updated = $('preview').querySelector(`input[data-task-line="${index + 1}"]`); if (updated) updated.focus();
});
$('preview').addEventListener('click', event => {
  const tag = event.target.closest('button[data-tag]'); if (tag) { if (window.GraphitTags) window.GraphitTags.open(tag.dataset.tag); return; }
  const link = event.target.closest('a[data-folio-path]'); if (!link) return;
  event.preventDefault(); const file = workspaceFiles().find(item => item.path === link.dataset.folioPath); const anchor = link.dataset.folioAnchor; if (file) { const line = anchor ? FolioCore.anchorLine(window.GraphitTabs ? window.GraphitTabs.textFor(file) : file.text, anchor) : null; openProjectFile(file, line); } else if (anchor && link.dataset.folioPath === (state.path || state.name)) { const line = FolioCore.anchorLine(editor.value, anchor); if (line) { if (window.FolioFeatures) window.FolioFeatures.showEditor(); focusLine(line); } }
});

function workspaceFiles() { return window.GraphitTabs ? window.GraphitTabs.workspaceFiles() : state.files; }
const markdownFile = name => /\.(?:md|markdown)$/i.test(name);
function projectForPath(path) { return state.projects.find(project => path.startsWith(`${project.name}/`)); }
function currentProject() { return state.projects.find(project => project.name === state.project); }
function ticketFiles() { return workspaceFiles().filter(file => file.path.startsWith(`${state.project}/tickets/`)); }
function makeMessage(title, description) { const box = document.createElement('div'); box.className = 'board-empty'; const strong = document.createElement('strong'); strong.textContent = title; const p = document.createElement('p'); p.textContent = description; box.append(strong, p); return box; }
function renderBoard() {
  const board = $('board'), errors = $('ticket-errors'), select = $('board-project');
  board.replaceChildren(); errors.replaceChildren(); select.replaceChildren();
  for (const project of state.projects) { const option = document.createElement('option'); option.value = project.name; option.textContent = project.name; select.append(option); }
  select.value = state.project; select.disabled = !state.projects.length; $('new-ticket').disabled = !currentProject();
  if (!state.directory) { board.append(makeMessage('Öffne einen Arbeitsbereich', 'Wähle einen Ordner, um Projekte und ihre Tickets zu sehen.')); return; }
  if (!state.projects.length) { board.append(makeMessage('Noch keine Projekte gefunden', 'Lege einen Projektordner im Arbeitsbereich an.')); return; }
  const tickets = [];
  for (const file of ticketFiles()) { if (file.error) { const p = document.createElement('p'); p.textContent = `${file.path}: ${file.error}`; errors.append(p); continue; } const ticket = FolioCore.parseTicket(window.GraphitTabs ? window.GraphitTabs.textFor(file) : file.text); if (ticket.error) { const p = document.createElement('p'); p.textContent = `${file.path}: ${ticket.error}`; errors.append(p); } else tickets.push({ ...ticket, file }); }
  tickets.sort((a, b) => a.title.localeCompare(b.title, 'de') || a.file.path.localeCompare(b.file.path, 'de'));
  FolioCore.statuses.forEach((status, index) => {
    const col = document.createElement('div'); col.className = 'column'; const heading = document.createElement('h3'); heading.textContent = statusNames[status]; const count = document.createElement('span'); count.textContent = tickets.filter(t => t.status === status && (!boardPriority || t.priority === boardPriority)).length; heading.append(count); col.append(heading);
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('drag-over'); if (state.dragged) moveTicket(state.dragged, status); state.dragged = null; });
    for (const ticket of tickets.filter(t => t.status === status && (!boardPriority || t.priority === boardPriority))) {
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
  if ((state.path === path && state.dirty) || (window.GraphitTabs && window.GraphitTabs.isDirty(path))) { toast('Bitte speichere oder verwirf zuerst die Änderungen an diesem Ticket.'); return; }
  state.moving = true; editor.readOnly = true; $('save').disabled = true; renderBoard();
  try {
    const latest = await (await file.handle.getFile()).text();
    if (latest !== file.text) { if (state.path === path && !state.dirty) { editor.value = latest; state.saved = latest; updateStatus(); renderPreview(); } await refreshFiles(); toast('Das Ticket wurde extern geändert. Die Ansicht wurde aktualisiert.'); return; }
    const updated = FolioCore.setTicketStatus(latest, status); if (updated === null) throw new Error('Ungültiger Ticket-Header.');
    const writable = await file.handle.createWritable(); await writable.write(updated); await writable.close();
    file.text = updated;
    if (window.GraphitTabs) window.GraphitTabs.externalUpdate(path, updated);
    if (state.path === path && !state.dirty) { editor.value = updated; state.saved = updated; updateStatus(); renderPreview(); }
    renderTodos(); toast('Ticketstatus gespeichert.');
  } catch (err) { toast(`Ticket konnte nicht verschoben werden: ${err.message}`); }
  finally { state.moving = false; editor.readOnly = false; $('save').disabled = false; renderBoard(); }
}
$('board-project').onchange = event => { state.project = event.target.value; renderBoard(); };
$('board-priority').onchange = event => { boardPriority = event.target.value; renderBoard(); };
async function createTicket(input, priority = 'mittel') {
  const project = currentProject(); if (!project) return;
  const title = input.trim(); if (!title || /[\r\n]/.test(title) || !FolioCore.priorities.includes(priority)) { toast('Bitte einen einzeiligen Titel eingeben.'); return; }
  try {
    const dir = await project.handle.getDirectoryHandle('tickets', { create: true });
    const base = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ticket';
    let name = `${base}.md`, number = 2;
    while (true) { try { await dir.getFileHandle(name); name = `${base}-${number++}.md`; } catch (err) { if (err.name === 'NotFoundError') break; throw err; } }
    const handle = await dir.getFileHandle(name, { create: true }); const text = `---\ntitle: ${JSON.stringify(title)}\nstatus: offen\npriority: ${priority}\n---\n\n`;
    const writable = await handle.createWritable(); await writable.write(text); await writable.close(); state.expanded.add(project.name); state.expanded.add(`${project.name}/tickets`); await refreshFiles(); toast('Ticket angelegt. Öffne es im Board, um die Beschreibung zu bearbeiten.');
  } catch (err) { toast(`Ticket konnte nicht angelegt werden: ${err.message}`); await refreshFiles(); }
}
$('new-ticket').onclick = () => { if (currentProject()) { $('ticket-dialog').showModal(); $('ticket-name').focus(); } };
$('cancel-ticket').onclick = () => $('ticket-dialog').close();
$('ticket-form').onsubmit = event => { event.preventDefault(); const title = $('ticket-name').value; const priority = $('ticket-priority').value; $('ticket-dialog').close(); $('ticket-name').value = ''; createTicket(title, priority); };
function renderTodos() {
  const list = $('todos'); list.replaceChildren();
  if (!state.directory) { list.append(makeMessage('Öffne einen Arbeitsbereich', 'Die TODO-Übersicht durchsucht alle Markdown-Dateien im ausgewählten Ordner.')); return; }
  const projectSelect = $('todo-project'), fileSelect = $('todo-file');
  projectSelect.replaceChildren(); fileSelect.replaceChildren();
  function option(select, value, label) { const node = document.createElement('option'); node.value = value; node.textContent = label; select.append(node); }
  option(projectSelect, '', 'Alle Projekte');
  for (const project of state.projects) option(projectSelect, project.name, project.name);
  option(projectSelect, ':root:', 'Arbeitsbereich'); projectSelect.value = todoProject;
  option(fileSelect, '', 'Alle Dateien');
  for (const file of workspaceFiles().filter(file => !todoProject || (todoProject === ':root:' ? !projectForPath(file.path) : file.path.startsWith(`${todoProject}/`)))) option(fileSelect, file.path, file.path);
  fileSelect.value = todoFile;
  const groups = new Map();
  for (const file of workspaceFiles()) {
    if (file.error || (todoFile && file.path !== todoFile) || (todoProject && (todoProject === ':root:' ? !!projectForPath(file.path) : !file.path.startsWith(`${todoProject}/`)))) continue;
    const text = window.GraphitTabs ? window.GraphitTabs.textFor(file) : state.path === file.path && state.folderTarget ? editor.value : file.text;
    const project = projectForPath(file.path); const group = project ? `project:${project.name}` : 'root:';
    for (const todo of FolioCore.findTodos(text)) { if (!groups.has(group)) groups.set(group, []); groups.get(group).push({ ...todo, file }); }
  }
  if (!groups.size) { list.append(makeMessage('Keine offenen TODOs', 'Für die aktuelle Auswahl wurden keine offenen TODOs gefunden.')); }
  for (const [key, todos] of [...groups].sort((a,b) => a[0].localeCompare(b[0], 'de'))) {
    const name = key === 'root:' ? 'Arbeitsbereich' : key.slice('project:'.length);
    const section = document.createElement('section'); section.className = 'todo-group'; const heading = document.createElement('h3'); heading.textContent = `${name} · ${todos.length}`; section.append(heading);
    for (const todo of todos) { const row = document.createElement('div'); row.className = 'todo-row'; const check = document.createElement('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `Aufgabe erledigen: ${todo.text}`); check.onchange = () => completeTodo(todo); const button = document.createElement('button'); button.className = 'todo-item'; const title = document.createElement('strong'); title.textContent = todo.text; const path = document.createElement('span'); path.textContent = `${todo.file.path}:${todo.line}`; button.append(title, path); button.onclick = () => openProjectFile(todo.file, todo.line); row.append(check, button); section.append(row); } list.append(section);
  }
  if (state.scanErrors.length) { const warning = document.createElement('p'); warning.className = 'scan-warning'; warning.textContent = `${state.scanErrors.length} Einträge konnten nicht gelesen werden. Aktualisiere den Arbeitsbereich und prüfe die Berechtigungen.`; list.prepend(warning); }
}
$('todo-project').onchange = event => { todoProject = event.target.value; todoFile = ''; renderTodos(); };
$('todo-file').onchange = event => { todoFile = event.target.value; renderTodos(); };
async function completeTodo(todo) {
  await openProjectFile(todo.file, todo.line);
  if (!state.folderTarget || state.path !== todo.file.path) { $('todos-tab').click(); renderTodos(); return; }
  const current = FolioCore.findTodos(editor.value).find(item => item.line === todo.line && item.text === todo.text);
  if (!current) { toast('Die Aufgabe wurde geändert. Bitte prüfe die aktuelle Datei.'); $('todos-tab').click(); renderTodos(); return; }
  const lines = editor.value.split(/(?<=\n)/), index = todo.line - 1;
  // Locate only the checkbox token in the verified task line.
  const marker = lines[index]?.match(/^(\s*(?:[-+*]|\d+[.)])\s+\[) (\])/);
  if (!marker) { toast('Die Aufgabe konnte nicht geändert werden.'); $('todos-tab').click(); renderTodos(); return; }
  const offset = lines.slice(0, index).reduce((sum, line) => sum + line.length, 0) + marker[1].length;
  editor.focus(); editor.setSelectionRange(offset, offset + 1);
  if (!document.execCommand('insertText', false, 'x')) { editor.setRangeText('x', offset, offset + 1); edited(); }
  $('todos-tab').click();
}
async function scanDirectory(dir, prefix = '', scan = { files: [], errors: [], rootError: null }) {
  const nodes = []; const entries = [];
  try { for await (const [name, handle] of dir.entries()) entries.push({ name, handle }); }
  catch (err) { scan.errors.push(`${prefix || dir.name}: ${err.message}`); if (!prefix) scan.rootError = err; return nodes; }
  entries.sort((a, b) => (a.handle.kind === b.handle.kind ? a.name.localeCompare(b.name, 'de') : a.handle.kind === 'directory' ? -1 : 1));
  for (const { name, handle } of entries) {
    const path = prefix ? `${prefix}/${name}` : name; const node = { name, path, handle, kind: handle.kind }; nodes.push(node);
    if (handle.kind === 'directory') node.children = await scanDirectory(handle, path, scan);
    else if (markdownFile(name)) { try { const diskFile = await handle.getFile(); node.text = await diskFile.text(); node.modified = diskFile.lastModified || 0; } catch (err) { node.error = err.message; scan.errors.push(`${path}: ${err.message}`); } scan.files.push(node); }
  }
  return nodes;
}
async function readWorkspace(dir) {
  const scan = { files: [], errors: [], rootError: null }; const tree = await scanDirectory(dir, '', scan);
  if (scan.rootError) throw scan.rootError;
  let para = false; try { const config = await dir.getFileHandle('.graphit.json'); para = JSON.parse(await (await config.getFile()).text()).layout === 'para'; } catch {}
  return { ...scan, tree, para };
}
function applyWorkspaceScan(scan) {
  state.files = scan.files; if (window.GraphitTabs) window.GraphitTabs.reconcile(scan.files); state.scanErrors = scan.errors; state.tree = scan.tree; state.para = !!scan.para; const rootProjects = scan.tree.find(node => node.kind === 'directory' && node.name === 'Projekte'); state.projects = state.para ? (rootProjects?.children || []).filter(node => node.kind === 'directory').map(node => ({ ...node, name: node.path })) : scan.tree.filter(node => node.kind === 'directory');
  if (!state.projects.some(p => p.name === state.project)) state.project = state.projects[0]?.name || '';
  renderFiles(); renderBoard(); renderTodos(); renderPreview(); if (window.GraphitWorkspace) window.GraphitWorkspace.render(); if (window.GraphitTags) window.GraphitTags.render();
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
      else { const b = document.createElement('button'); b.className = `file-item${node.path === state.path && state.folderTarget ? ' active' : ''}`; b.title = markdownFile(node.name) ? node.path : `${node.path} (nur sichtbar)`; b.append(document.createTextNode(`${markdownFile(node.name) ? '▤' : '·'}  ${node.name}`)); if (markdownFile(node.name)) b.onclick = () => openProjectFile(node); else { b.disabled = true; b.classList.add('non-markdown'); } const row = document.createElement('div'); row.className = 'file-row'; row.append(b); parent.append(row); if (markdownFile(node.name) && window.GraphitWorkspace) { const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'rename-file'; rename.textContent = '✎'; rename.title = `Umbenennen: ${node.path}`; rename.setAttribute('aria-label', rename.title); rename.onclick = () => window.GraphitWorkspace.rename(node); row.append(rename); } }
    }
  }
  addNodes(state.tree, list);
}
async function openProjectFile(file, line = null) {
  if (window.GraphitTabs) { const selected = window.GraphitTabs.selectPath(file.path); if (selected === null) return; if (selected) { if (window.FolioFeatures) window.FolioFeatures.documentOpened(); if (line) { if (window.FolioFeatures) window.FolioFeatures.showEditor(); focusLine(line); } return; } }
  if (state.path === file.path && state.folderTarget) { if (window.FolioFeatures) window.FolioFeatures.documentOpened(); if (line) { if (window.FolioFeatures) window.FolioFeatures.showEditor(); focusLine(line); } return; }
  if (!canLeave(true)) return;
  clearTimeout(saveTimer); const previousText = editor.value, epoch = documentEpoch, directory = state.directory;
  try {
    const contents = await (await file.handle.getFile()).text();
    if (epoch !== documentEpoch || directory !== state.directory) return;
    if ((editor.value !== previousText || saveInFlight) && !canLeave(true)) { scheduleAutosave(); return; }
    loadDocument(contents, file.name, file.handle, file.path, true);
    if (line) { if (window.FolioFeatures) window.FolioFeatures.showEditor(); focusLine(line); }
  } catch (err) { scheduleAutosave(); toast(`Datei konnte nicht geöffnet werden: ${err.message}`); }
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
  if (saveInFlight || state.moving) { toast('Bitte warte, bis das Speichern abgeschlossen ist.'); return false; }
  if (state.directory && state.directory !== dir && window.GraphitTabs && window.GraphitTabs.hasUnsavedNew()) { toast('Bitte speichere oder schließe neue Entwürfe, bevor du den Arbeitsbereich wechselst.'); return false; }
  ++refreshEpoch;
  if (state.directory !== dir) { todoProject = ''; todoFile = ''; if (window.GraphitTabs) window.GraphitTabs.workspaceWillChange(); }
  // A document from the previous workspace remains open under its original file handle.
  if (state.folderTarget && state.path && state.directory !== dir) { state.folderTarget = false; state.path = ''; }
  if (!state.file) state.folderTarget = true;
  state.directory = dir; state.project = ''; state.expanded.clear(); if (window.FolioFeatures) window.FolioFeatures.workspaceChanged();
  $('project-name').textContent = dir.name; $('crumb-project').textContent = dir.name; $('project-caption').textContent = 'Arbeitsbereich';
  $('restore-folder').hidden = true; workspaceMessage();
  applyWorkspaceScan(scan); updateStatus();
  if (window.GraphitTabs) window.GraphitTabs.workspaceChanged(dir);
  if (window.GraphitEnhancements) window.GraphitEnhancements.workspaceChanged(dir);
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
$('open-file').onclick = () => { if (canLeave(true)) $('file-input').click(); };
$('file-input').onchange = async event => { const file = event.target.files[0]; if (file) { try { const contents = await file.text(); if (canLeave(true)) loadDocument(contents, file.name); } catch (err) { toast(`Datei konnte nicht geöffnet werden: ${err.message}`); } } event.target.value = ''; };
$('new-file').onclick = () => { if (!canLeave(true)) return; const name = prompt('Name der neuen Markdown-Datei:', 'Neues-Dokument.md'); if (name === null) return; const clean = name.trim(); if (!clean || /[\\/]/.test(clean) || clean === '.' || clean === '..') { toast('Bitte einen gültigen Dateinamen ohne Schrägstrich eingeben.'); return; } const filename = /\.(md|markdown)$/i.test(clean) ? clean : `${clean}.md`; if (state.directory && workspaceFiles().some(file => file.path === filename)) { toast('Eine Datei oder ein Entwurf mit diesem Namen ist bereits vorhanden.'); return; } loadDocument('', filename, null, state.directory ? filename : '', !!state.directory, true); toast('Neue Datei angelegt. Speichere sie, um sie dauerhaft abzulegen.'); };
function scheduleAutosave() {
  clearTimeout(saveTimer);
  if (state.file && state.dirty && !saveError) saveTimer = setTimeout(() => saveDocument(false), 900);
}
async function saveDocument(manual = true) {
  clearTimeout(saveTimer);
  if (saveInFlight) { if (manual) await saveInFlight; else return; }
  const epoch = documentEpoch, snapshot = editor.value, original = state.saved;
  const work = async () => {
    try {
      if (state.file || (manual && state.directory && state.folderTarget)) {
        let handle = state.file;
        if (handle) {
          const latest = await (await handle.getFile()).text();
          if (latest !== original) {
            if (!manual) { saveError = 'Die Datei wurde außerhalb von Graphit geändert. Dein Entwurf bleibt erhalten; mit Speichern kannst du den Konflikt lösen.'; toast(saveError); return; }
            const result = window.GraphitWorkspace ? await window.GraphitWorkspace.resolveConflict(handle, snapshot, latest) : { choice: window.confirm('Die Datei wurde außerhalb von Graphit geändert. Möchtest du sie mit deinem aktuellen Entwurf überschreiben?') ? 'draft' : 'cancel', disk: latest };
            if (result.choice === 'disk') { editor.value = result.disk; state.saved = result.disk; saveError = ''; changed(); await refreshFiles(); return; }
            if (result.choice !== 'draft') { saveError = 'Die Datei wurde außerhalb von Graphit geändert. Dein Entwurf bleibt erhalten.'; return; }
          }
        } else {
          const parts = (state.path || state.name).split('/'); const leaf = parts.pop(); let parent = state.directory;
          if (!leaf || parts.some(part => !part || part === '.' || part === '..')) throw new Error('Ungültiger Dateipfad');
          for (const part of parts) parent = await parent.getDirectoryHandle(part);
          try { await parent.getFileHandle(leaf); if (!window.confirm(`„${leaf}“ existiert bereits. Überschreiben?`)) return; }
          catch (err) { if (err.name !== 'NotFoundError') throw err; }
          handle = await parent.getFileHandle(leaf, { create: true });
        }
        const writable = await handle.createWritable(); await writable.write(snapshot); await writable.close();
        if (epoch === documentEpoch) { state.file = handle; state.path ||= state.name; state.saved = snapshot; state.isNew = false; saveError = ''; }
        await refreshFiles();
        if (window.GraphitTabs) window.GraphitTabs.capture();
        if (manual) toast('Datei gespeichert.');
      } else if (manual) {
        const blob = new Blob([snapshot], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = state.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (epoch === documentEpoch) { state.saved = snapshot; state.isNew = false; saveError = ''; } toast('Markdown-Datei heruntergeladen.');
      }
    } catch (err) { if (epoch === documentEpoch) saveError = `Speichern fehlgeschlagen: ${err.message}`; if (err.name !== 'AbortError') toast(saveError); }
  };
  saveInFlight = work(); updateStatus();
  try { await saveInFlight; } finally { saveInFlight = null; updateStatus(); if (window.GraphitTabs) window.GraphitTabs.capture(); if (epoch === documentEpoch && state.dirty && !saveError) scheduleAutosave(); }
}
$('save').onclick = () => saveDocument(true);
for (const name of ['preview', 'board', 'todos', 'projects', 'tags']) $(`${name}-tab`).onclick = () => { for (const other of ['preview', 'board', 'todos', 'projects', 'tags']) { const selected = name === other; $(`${other}-tab`).setAttribute('aria-selected', String(selected)); $(`${other}-view`).hidden = !selected; } if (window.FolioFeatures) window.FolioFeatures.selectArea(name); if (name === 'tags' && window.GraphitTags) window.GraphitTags.render(); };
editor.value = welcome; state.saved = welcome; changed();
const restoreReady = restoreOnStart();
