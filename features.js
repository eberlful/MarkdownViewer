'use strict';

// Presentation settings and recent paths contain no document contents.
const preferences = (() => {
  try { const value = JSON.parse(localStorage.getItem('folio-ui') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
})();
function storePreferences() { try { localStorage.setItem('folio-ui', JSON.stringify(preferences)); } catch {} }
let area = 'preview';
let mode = ['live', 'editor', 'split', 'preview'].includes(preferences.mode) ? preferences.mode : 'live';
let split = Math.min(75, Math.max(25, Number(preferences.split) || 50));
let sidebarHidden = preferences.sidebarHidden === undefined ? !!(window.matchMedia && window.matchMedia('(max-width: 700px)').matches) : !!preferences.sidebarHidden;

// Measure the available document space with the outline out of the flex layout.
// This prevents the outline itself from creating the overflow that makes it visible.
let outlineFrame = null;
function scheduleOutlineVisibility() {
  if (outlineFrame !== null) return;
  const schedule = window.requestAnimationFrame ? callback => window.requestAnimationFrame(callback) : callback => setTimeout(callback, 0);
  outlineFrame = schedule(() => { outlineFrame = null; updateOutlineVisibility(); });
}
function updateOutlineVisibility() {
  const controls = $('outline-controls');
  if (area !== 'preview') { controls.hidden = true; return; }
  const previousPosition = controls.style.position;
  if (!controls.hidden) controls.style.position = 'absolute';
  let visible;
  try {
    const scrolls = element => element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1;
    visible = (mode !== 'preview' && scrolls(editor)) ||
      ((mode === 'preview' || mode === 'split') && scrolls($('preview-view')));
  } finally { controls.style.position = previousPosition || ''; }
  if (controls.hidden === !visible) return;
  if (!visible && controls.contains && controls.contains(document.activeElement)) {
    const target = mode === 'preview' ? $('preview-view') : editor;
    target.focus({ preventScroll: true });
  }
  controls.hidden = !visible;
}

function applyLayout() {
  const boardOpen = area !== 'preview';
  $('editor-panel').hidden = boardOpen || mode === 'preview';
  $('result-panel').hidden = !boardOpen && (mode === 'editor' || mode === 'live');
  $('splitter').hidden = boardOpen || mode !== 'split';
  $('preview-toolbar').hidden = boardOpen || (mode !== 'split' && mode !== 'preview');
  const readingWidth = preferences.readingWidth !== false;
  $('preview-view').classList.toggle('reading-width', readingWidth);
  $('toggle-reading-width').setAttribute('aria-pressed', String(readingWidth));
  $('workspace').style.setProperty('--split', `${split}%`);
  $('workspace').classList.toggle('single', boardOpen || mode !== 'split');
  $('app').classList.toggle('live-mode', mode === 'live' && !boardOpen);
  document.querySelectorAll('[data-mode]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.mode === mode && !boardOpen)); });
  $('splitter').setAttribute('aria-valuenow', String(Math.round(split)));
  $('app').classList.toggle('sidebar-hidden', sidebarHidden);
  $('sidebar').inert = sidebarHidden;
  if (window.GraphitMotion) window.GraphitMotion.progress();
  $('toggle-sidebar').setAttribute('aria-expanded', String(!sidebarHidden));
  scheduleOutlineVisibility();
}
function setMode(next) {
  mode = next; preferences.mode = mode; storePreferences();
  if (area !== 'preview') $('preview-tab').click();
  applyLayout(); renderEditor(); if (next === 'split' || next === 'preview') { renderPreview(); if (window.GraphitWorkspace) window.GraphitWorkspace.render(); }
}
function showEditor() { if (area !== 'preview') $('preview-tab').click(); if (mode === 'preview') setMode('split'); }
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('toggle-reading-width').onclick = () => { preferences.readingWidth = preferences.readingWidth === false; storePreferences(); applyLayout(); if (window.GraphitMotion) window.GraphitMotion.progress(); };
$('toggle-sidebar').onclick = () => { sidebarHidden = !sidebarHidden; preferences.sidebarHidden = sidebarHidden; storePreferences(); applyLayout(); };
function setSplit(value) { split = Math.min(75, Math.max(25, value)); preferences.split = split; storePreferences(); applyLayout(); }
$('splitter').addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSplit(split + (event.key === 'ArrowLeft' ? -2 : 2)); } });
$('splitter').addEventListener('pointerdown', event => {
  event.preventDefault(); const el = $('splitter'); el.setPointerCapture(event.pointerId);
  const move = e => { const rect = $('workspace').getBoundingClientRect(); setSplit((e.clientX - rect.left) / rect.width * 100); };
  const end = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
});

function liveInline(line) {
  const pattern = /(`[^`]+`|\[\[[^\]\n]+\]\]|\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_)/g;
  let output = '', end = 0, match;
  const hide = value => `<span class="syntax-hide">${escapeHTML(value)}</span>`;
  while ((match = pattern.exec(line))) {
    let slashes = 0; for (let i = match.index - 1; i >= 0 && line[i] === '\\'; i--) slashes++;
    if (slashes % 2) continue;
    output += escapeHTML(line.slice(end, match.index));
    const token = match[0];
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) output += `${hide('[')}<span class="live-link">${escapeHTML(link[1])}</span>${hide(`](${link[2]})`)}`;
    else {
      const double = token.startsWith('**') || token.startsWith('__') || token.startsWith('[[') || token.startsWith('~~');
      const n = double ? 2 : 1;
      const cls = token[0] === '`' ? 'live-code' : token[0] === '[' ? 'live-link' : token[0] === '~' ? 'live-strike' : double ? 'live-bold' : 'live-italic';
      output += `${hide(token.slice(0, n))}<span class="${cls}">${escapeHTML(token.slice(n, -n))}</span>${hide(token.slice(-n))}`;
    }
    end = pattern.lastIndex;
  }
  return output + escapeHTML(line.slice(end));
}
function highlightMarkdown(text) {
  let fence = null;
  const startLine = text.slice(0, editor.selectionStart || 0).split('\n').length - 1;
  const endLine = text.slice(0, editor.selectionEnd || 0).split('\n').length - 1;
  return text.split('\n').map((line, index) => {
    const escaped = escapeHTML(line);
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) { if (!fence) fence = { char: marker[1][0], length: marker[1].length }; else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null; return `<span class="syntax-code">${escaped}</span>`; }
    if (fence) return `<span class="syntax-code">${escaped}</span>`;
    if (mode === 'live' && (index < startLine || index > endLine)) {
      const heading = line.match(/^(#{1,6})(\s+)(.*)$/);
      if (heading) return `<span class="syntax-hide">${escapeHTML(heading[1])}</span>${escapeHTML(heading[2])}<span class="live-heading">${liveInline(heading[3])}</span>`;
      const prefix = line.match(/^(\s*(?:>\s?|[-+*]\s+|\d+[.)]\s+))(.*)$/);
      if (prefix) return `<span class="live-marker">${escapeHTML(prefix[1])}</span>${liveInline(prefix[2])}`;
      return liveInline(line);
    }
    if (/^#{1,6}\s/.test(line)) return `<span class="syntax-heading">${escaped}</span>`;
    if (/^\s*>/.test(line)) return `<span class="syntax-quote">${escaped}</span>`;
    return escaped.replace(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[[ xX]\])/g, '<span class="syntax-mark">$1</span>');
  }).map(line => `<span class="syntax-line">${line || '&#8203;'}</span>`).join('');
}
function renderEditor() {
  scheduleOutlineVisibility();
  $('editor-highlight').innerHTML = highlightMarkdown(editor.value);
  if (preferences.lines) renderLineNumbers();
  const outline = $('outline'); if (!preferences.outline) { syncScroll(); return; } outline.replaceChildren();
  const sourceLines = editor.value.split(/\r?\n/);
  for (const heading of FolioCore.headings(editor.value)) {
    const level = (sourceLines[heading.line - 1].match(/^#+/) || ['#'])[0].length;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = heading.title;
    button.style.paddingLeft = `${8 + (level - 1) * 12}px`;
    button.onclick = () => {
      if (mode !== 'preview') focusLine(heading.line);
      if (mode === 'preview' || mode === 'split') {
        const target = $('preview').querySelector(`[data-heading-line="${heading.line}"]`);
        if (target) { target.scrollIntoView({ block: 'start' }); if (mode === 'preview') target.focus({ preventScroll: true }); }
      }
    };
    outline.append(button);
  }
  if (!outline.children.length) { const empty = document.createElement('span'); empty.textContent = 'Keine Überschriften'; outline.append(empty); }
  syncScroll();
}
function renderLineNumbers() {
  const highlight = $('editor-highlight'), gutter = $('line-numbers');
  if (editor.clientWidth) highlight.style.width = `${editor.clientWidth}px`;
  gutter.replaceChildren();
  highlight.querySelectorAll('.syntax-line').forEach((line, index) => { const number = document.createElement('div'); number.textContent = index + 1; number.style.height = `${line.getBoundingClientRect().height}px`; gutter.append(number); });
}
function syncScroll() { $('editor-highlight').scrollTop = editor.scrollTop; $('editor-highlight').scrollLeft = editor.scrollLeft; $('line-numbers').scrollTop = editor.scrollTop; }
function bindFeatureEditor(element) { element.addEventListener('scroll', syncScroll); element.addEventListener('click', renderEditor); element.addEventListener('keyup', renderEditor); if (window.GraphitEnhancements) window.GraphitEnhancements.bindEditor(element); }
bindFeatureEditor(editor);
window.addEventListener('resize', () => { renderLineNumbers(); syncScroll(); scheduleOutlineVisibility(); });
if (window.ResizeObserver) { const observer = new window.ResizeObserver(() => { renderLineNumbers(); syncScroll(); scheduleOutlineVisibility(); }); for (const id of ['workspace', 'editor-wrap', 'preview-view', 'preview', 'related-files', 'backlinks']) observer.observe($(id)); }
$('preview-view').addEventListener('load', scheduleOutlineVisibility, true);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleOutlineVisibility);
function applyFormat(kind) {
  const start = editor.selectionStart, end = editor.selectionEnd, selected = editor.value.slice(start, end);
  let replacement, selectStart, selectEnd;
  if (kind === 'list') {
    const from = editor.value.lastIndexOf('\n', start - 1) + 1; let to = editor.value.indexOf('\n', end); if (to < 0) to = editor.value.length;
    editor.setSelectionRange(from, to); replacement = editor.value.slice(from, to).split('\n').map(line => `- ${line}`).join('\n'); selectStart = from; selectEnd = from + replacement.length;
  } else {
    const before = { bold: '**', italic: '*', link: '[', code: '```\n' }[kind];
    const after = { bold: '**', italic: '*', link: '](https://)', code: '\n```' }[kind];
    replacement = before + selected + after; selectStart = start + before.length; selectEnd = selectStart + selected.length;
  }
  editor.focus();
  // insertText participates in the browser's native undo history.
  document.execCommand('insertText', false, replacement);
  editor.setSelectionRange(selectStart, selectEnd);
}
document.querySelectorAll('[data-format]').forEach(button => { button.addEventListener('mousedown', e => e.preventDefault()); button.addEventListener('click', () => applyFormat(button.dataset.format)); });
$('toggle-lines').onclick = () => { preferences.lines = !preferences.lines; storePreferences(); updateEditorOptions(); };
$('toggle-outline').onclick = () => { preferences.outline = !preferences.outline; storePreferences(); updateEditorOptions(); if (preferences.outline) renderEditor(); scheduleOutlineVisibility(); };
function updateEditorOptions() { $('line-numbers').hidden = !preferences.lines; $('toggle-lines').setAttribute('aria-pressed', String(!!preferences.lines)); if (preferences.lines) renderLineNumbers(); $('outline').hidden = !preferences.outline; $('toggle-outline').setAttribute('aria-expanded', String(!!preferences.outline)); }

let recentPaths = [], recentWorkspace = null, recentWrites = Promise.resolve();
async function recentRecords(write) {
  const db = await storageDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('settings'); const request = store.get('recentWorkspaces');
      request.onsuccess = () => {
        const records = Array.isArray(request.result) ? request.result : [];
        if (write) { write(records).then(updated => { store.put(updated, 'recentWorkspaces'); }).catch(reject); }
        else resolve(records);
      };
      request.onerror = () => reject(request.error); tx.oncomplete = () => { if (write) resolve(); }; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function sameWorkspace(a, b) { try { return a === b || !!(a && b && a.isSameEntry && await a.isSameEntry(b)); } catch { return false; } }
async function matchingRecent(records, handle) { for (const item of records) if (await sameWorkspace(item.handle, handle)) return item; return null; }
function workspaceChanged() {
  const handle = state.directory; recentWorkspace = handle; recentPaths = [];
  recentWrites = recentWrites.catch(() => {}).then(async () => {
    const records = await recentRecords(); const item = await matchingRecent(records, handle);
    if (recentWorkspace === handle) recentPaths = item && Array.isArray(item.paths) ? item.paths : [];
  }).catch(() => {});
}
function getRecent() { return recentPaths; }
function renameRecent(oldPath, newPath) {
  recentPaths = recentPaths.map(path => path === oldPath ? newPath : path);
  const handle = state.directory;
  recentWrites = recentWrites.catch(() => {}).then(async () => {
    const records = await recentRecords(), item = await matchingRecent(records, handle); if (!item) return;
    for (const key of ['paths', 'favorites', 'openTabs']) if (Array.isArray(item[key])) item[key] = item[key].map(path => path === oldPath ? newPath : path);
    if (item.activeTab === oldPath) item.activeTab = newPath;
    const db = await storageDatabase(); try { await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(records, 'recentWorkspaces'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  }).catch(() => toast('Zuletzt geöffnete Dateien konnten nicht aktualisiert werden.'));
}
function rememberDocument() {
  if (!state.directory || !state.folderTarget || !state.path) return;
  const handle = state.directory, path = state.path;
  recentPaths = [path, ...recentPaths.filter(item => item !== path)].slice(0, 12);
  recentWrites = recentWrites.catch(() => {}).then(async () => {
    // Compare File System handles outside a live transaction: permission checks can be asynchronous.
    const records = await recentRecords(); let item = await matchingRecent(records, handle);
    if (!item) { item = { handle, paths: [] }; records.push(item); }
    item.paths = [path, ...item.paths.filter(existing => existing !== path)].slice(0, 12);
    const db = await storageDatabase();
    try { await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(records, 'recentWorkspaces'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
    if (recentWorkspace === handle) recentPaths = item.paths;
  }).catch(() => {});
}
function searchFiles(query) {
  const term = query.trim().toLocaleLowerCase('de'); const results = [];
  if (!term) return getRecent().map(path => state.files.find(file => file.path === path && !file.error)).filter(Boolean).map(file => ({ file }));
  for (const file of workspaceFiles()) {
    if (file.error) continue;
    if (file.path.toLocaleLowerCase('de').includes(term)) results.push({ file });
    const content = window.GraphitTabs ? window.GraphitTabs.textFor(file) : state.folderTarget && file.path === state.path ? editor.value : file.text;
    content.split(/\r?\n/).forEach((line, index) => { if (line.toLocaleLowerCase('de').includes(term)) results.push({ file, line: index + 1, context: line.trim() }); });
  }
  return results.slice(0, 100);
}
function renderSearch() {
  const results = $('search-results'); results.replaceChildren();
  const found = searchFiles($('search-input').value);
  if (!found.length) { const message = document.createElement('p'); message.textContent = !state.directory ? 'Öffne einen Arbeitsbereich, um Dateien zu durchsuchen.' : $('search-input').value.trim() ? 'Keine Treffer gefunden.' : 'Noch keine zuletzt geöffneten Dateien.'; results.append(message); return; }
  if (!$('search-input').value.trim()) { const heading = document.createElement('p'); heading.textContent = 'Zuletzt geöffnet'; results.append(heading); }
  for (const result of found) {
    const button = document.createElement('button'); const path = document.createElement('strong'); path.textContent = result.file.path + (result.line ? `:${result.line}` : ''); button.append(path);
    if (result.context) { const context = document.createElement('span'); context.textContent = result.context; button.append(context); }
    button.onclick = () => { $('search-dialog').close(); openProjectFile(result.file, result.line); }; results.append(button);
  }
  if (state.scanErrors.length) { const warning = document.createElement('p'); warning.textContent = 'Einige Dateien konnten nicht gelesen werden; die Ergebnisse sind möglicherweise unvollständig.'; results.append(warning); }
}
function openSearch() { if (!$('search-dialog').open) $('search-dialog').showModal(); $('search-input').value = ''; renderSearch(); $('search-input').focus(); }
$('open-search').onclick = openSearch; $('top-search').onclick = openSearch; $('close-search').onclick = () => $('search-dialog').close(); $('search-input').addEventListener('input', renderSearch);
$('search-input').addEventListener('keydown', event => { if (event.key === 'ArrowDown') { const first = $('search-results').querySelector('button'); if (first) { event.preventDefault(); first.focus(); } } });
window.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key === 'p') { event.preventDefault(); openSearch(); }
  if (document.activeElement === editor && ['b', 'i', 'k'].includes(key)) { event.preventDefault(); applyFormat({ b: 'bold', i: 'italic', k: 'link' }[key]); }
});
window.FolioFeatures = { renderEditor, showEditor, scheduleOutlineVisibility, bindEditor: bindFeatureEditor, renameRecent, documentOpened() { if (area !== 'preview') $('preview-tab').click(); if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) { sidebarHidden = true; preferences.sidebarHidden = true; storePreferences(); applyLayout(); } rememberDocument(); if (window.GraphitEnhancements) window.GraphitEnhancements.documentOpened(); }, workspaceChanged, selectArea(name) { area = name; if (name !== 'preview') $('outline-controls').hidden = true; applyLayout(); if (name === 'preview' && preferences.outline) renderEditor(); scheduleOutlineVisibility(); } };
updateEditorOptions(); applyLayout(); renderEditor(); if (state.directory) workspaceChanged();

// Motion feedback is decorative; actions never wait for an animation.
window.GraphitMotion = (() => {
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function progress() {
    const view = $('preview-view'), article = $('preview'), bar = $('reading-progress');
    if (!view || !article || !bar || !view.getBoundingClientRect || view.hidden || $('result-panel').hidden) return;
    const viewport = view.getBoundingClientRect(), documentBox = article.getBoundingClientRect();
    const end = Math.max(0, view.scrollTop + documentBox.bottom - viewport.bottom);
    const fraction = end > 0 ? Math.min(1, Math.max(0, view.scrollTop / end)) : 1;
    bar.style.transform = `scaleX(${fraction})`;
  }
  function line(number) {
    const lines = $('editor-highlight').querySelectorAll('.syntax-line');
    const target = lines[number - 1]; if (!target) return;
    target.classList.remove('jump-highlight'); void target.offsetWidth; target.classList.add('jump-highlight');
  }
  function saved() { const el = $('save-status'); el.classList.remove('save-confirmed'); void el.offsetWidth; el.classList.add('save-confirmed'); setTimeout(() => el.classList.remove('save-confirmed'), 1000); }
  function card(path, origin) {
    const target = [...document.querySelectorAll('.card')].find(card => card.dataset.path === path);
    if (!target || !target.getBoundingClientRect || !target.animate || reduced()) return;
    const end = target.getBoundingClientRect();
    target.animate([{ transform: `translate(${origin.left-end.left}px, ${origin.top-end.top}px)` }, { transform: 'translate(0, 0)' }], { duration: 220, easing: 'ease-out' });
  }
  function todo(ghost, rect) {
    if (reduced() || !document.body || !ghost.animate) return;
    ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, zIndex: '4', pointerEvents: 'none', background: 'var(--surface)' });
    document.body.append(ghost);
    const animation = ghost.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(8px)' }], { duration: 200, easing: 'ease-out' });
    animation.onfinish = () => ghost.remove(); animation.oncancel = () => ghost.remove();
  }
  const view = $('preview-view'); view.addEventListener('scroll', progress);
  view.addEventListener('load', progress, true); window.addEventListener('resize', progress);
  if (window.ResizeObserver) { const observer = new window.ResizeObserver(progress); observer.observe(view); observer.observe($('preview')); }
  return { progress, line, saved, card, todo };
})();
