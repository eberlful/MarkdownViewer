'use strict';

(() => {
  let favorites = [], workspace = null, generation = 0, matches = [], selected = 0, linkRange = null;
  let recentCommands = [];
  try { const value = JSON.parse(localStorage.getItem('graphit-commands') || '[]'); if (Array.isArray(value)) recentCommands = value; } catch {}
  const start = $('start-view');
  function showStart() { start.hidden = false; $('app').classList.add('starting'); renderQuickFiles(); }
  function hideStart() { start.hidden = true; $('app').classList.remove('starting'); }
  function fileButton(file) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = file.name; button.title = file.path;
    button.onclick = () => { hideStart(); openProjectFile(file); }; return button;
  }
  function renderQuickFiles() {
    const box = $('quick-files'), recentBox = $('start-recent-list'); box.replaceChildren(); recentBox.replaceChildren();
    const fileFor = path => state.files.find(file => file.path === path && !file.error);
    function group(label, paths) {
      const files = paths.map(fileFor).filter(Boolean); if (!files.length) return;
      const heading = document.createElement('div'); heading.className = 'quick-heading'; heading.textContent = label; box.append(heading);
      for (const file of files) box.append(fileButton(file));
    }
    group('FAVORITEN', favorites); group('ZULETZT GEÖFFNET', getRecent().filter(path => !favorites.includes(path)).slice(0, 5));
    const recent = getRecent().map(fileFor).filter(Boolean).slice(0, 6);
    if (!recent.length) { const empty = document.createElement('p'); empty.textContent = 'Hier erscheinen deine zuletzt geöffneten Dateien.'; recentBox.append(empty); }
    for (const file of recent) recentBox.append(fileButton(file));
    const favorite = $('favorite-document'), allowed = !!(state.directory && state.folderTarget && state.path && state.file);
    favorite.disabled = !allowed; const marked = allowed && favorites.includes(state.path);
    favorite.textContent = marked ? '★' : '☆'; favorite.setAttribute('aria-label', marked ? 'Aus Favoriten entfernen' : 'Aktuelles Dokument zu Favoriten hinzufügen');
    favorite.setAttribute('aria-pressed', String(marked));
  }
  async function workspaceChanged(handle) {
    workspace = handle; favorites = []; const current = ++generation; renderQuickFiles();
    try {
      await recentWrites.catch(() => {}); const records = await recentRecords(); const item = await matchingRecent(records, handle);
      if (current !== generation || state.directory !== handle) return;
      favorites = item && Array.isArray(item.favorites) ? item.favorites : []; renderQuickFiles();
    } catch { renderQuickFiles(); }
  }
  function storeFavorites() {
    const handle = workspace, value = [...favorites]; if (!handle) return;
    recentWrites = recentWrites.catch(() => {}).then(async () => {
      const records = await recentRecords(); let item = await matchingRecent(records, handle);
      if (!item) { item = { handle, paths: [] }; records.push(item); }
      item.favorites = value;
      const db = await storageDatabase();
      try { await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(records, 'recentWorkspaces'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
    }).catch(() => toast('Favoriten konnten nicht dauerhaft gespeichert werden.'));
  }
  $('favorite-document').onclick = () => {
    if (!state.directory || !state.folderTarget || !state.path || !state.file) return;
    favorites = favorites.includes(state.path) ? favorites.filter(path => path !== state.path) : [...favorites, state.path];
    storeFavorites(); renderQuickFiles();
  };
  $('start-folder').onclick = () => $('open-folder').click();
  $('start-new').onclick = () => { hideStart(); $('new-file').click(); };
  $('start-example').onclick = hideStart;
  $('document-tabs').addEventListener('click', hideStart);
  document.querySelectorAll('[data-mode], [role="tab"]').forEach(button => button.addEventListener('click', hideStart));

  const commands = [
    { id: 'capture', label: 'Schnell erfassen', run: () => $('quick-capture').click() },
    { id: 'projects', label: 'Projektübersicht öffnen', run: () => $('projects-tab').click() },
    { id: 'new', label: 'Neue Notiz', run: () => $('new-file').click() },
    { id: 'folder', label: 'Arbeitsbereich öffnen', run: () => $('open-folder').click() },
    { id: 'search', label: 'Dateien und Inhalte suchen', run: () => $('open-search').click() },
    { id: 'save', label: 'Dokument speichern', run: () => $('save').click() },
    { id: 'board', label: 'Kanban öffnen', run: () => $('board-tab').click() },
    { id: 'todos', label: 'TODOs öffnen', run: () => $('todos-tab').click() },
    { id: 'tags', label: 'Tags öffnen', run: () => $('tags-tab').click() },
    { id: 'document', label: 'Dokument öffnen', run: () => $('preview-tab').click() },
    { id: 'theme', label: 'Helles oder dunkles Design wechseln', run: () => $('toggle-theme').click() },
    { id: 'favorite', label: 'Favorit hinzufügen oder entfernen', run: () => $('favorite-document').click() },
    { id: 'sidebar', label: 'Seitenleiste ein- oder ausblenden', run: () => $('toggle-sidebar').click() }
  ];
  function renderCommands() {
    const term = $('command-input').value.trim().toLocaleLowerCase('de'), box = $('command-results'); box.replaceChildren();
    const ordered = [...commands].sort((a, b) => {
      const ai = recentCommands.indexOf(a.id), bi = recentCommands.indexOf(b.id);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    }).filter(command => command.label.toLocaleLowerCase('de').includes(term));
    if (!ordered.length) { const p = document.createElement('p'); p.textContent = 'Keine Befehle gefunden.'; box.append(p); }
    for (const command of ordered) {
      const button = document.createElement('button'); button.textContent = command.label;
      button.onclick = () => { $('command-dialog').close(); hideStart(); recentCommands = [command.id, ...recentCommands.filter(id => id !== command.id)].slice(0, 8); try { localStorage.setItem('graphit-commands', JSON.stringify(recentCommands)); } catch {} command.run(); }; box.append(button);
    }
  }
  function openCommands() { if (!$('command-dialog').open) $('command-dialog').showModal(); $('command-input').value = ''; renderCommands(); $('command-input').focus(); }
  $('open-commands').onclick = openCommands; $('close-commands').onclick = () => $('command-dialog').close();
  $('command-input').addEventListener('input', renderCommands);
  $('command-input').addEventListener('keydown', event => { if (event.key === 'Enter') { const first = $('command-results').querySelector('button'); if (first) { event.preventDefault(); first.click(); } } else if (event.key === 'ArrowDown') { const first = $('command-results').querySelector('button'); if (first) { event.preventDefault(); first.focus(); } } });
  window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p') { event.preventDefault(); openCommands(); } });

  function relativeLink(source, target) {
    const from = source.split('/'); from.pop(); const to = target.split('/');
    while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
    const path = [...from.map(() => '..'), ...to].join('/').replace(/\.(?:md|markdown)$/i, '');
    return path.startsWith('../') ? path : `./${path}`;
  }
  function closeSuggestions() { $('link-suggestions').hidden = true; matches = []; linkRange = null; }
  function insertLink(choice) {
    if (!linkRange) return;
    const { start, end } = linkRange; const source = state.path || state.name;
    if (choice.tag) {
      editor.focus(); editor.setSelectionRange(start, end);
      if (!document.execCommand('insertText', false, `#${choice.tag}`)) { editor.setRangeText(`#${choice.tag}`, start, end, 'end'); edited(); }
      closeSuggestions(); return;
    }
    const target = choice.file ? relativeLink(source, choice.file.path) : `./${choice.name.replace(/\.(?:md|markdown)$/i, '')}`;
    editor.focus(); editor.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, `[[${target}]]`)) { editor.setRangeText(`[[${target}]]`, start, end, 'end'); edited(); }
    closeSuggestions();
    if (choice.name) {
      const parts = source.split('/'); parts.pop(); const filename = /\.(?:md|markdown)$/i.test(choice.name) ? choice.name : `${choice.name}.md`;
      loadDocument('', filename, null, [...parts, filename].join('/'), true, true);
      toast('Neue Notiz als Entwurf geöffnet. Speichere sie, um sie anzulegen.');
    }
  }
  function renderSuggestions() {
    const box = $('link-suggestions'); box.replaceChildren();
    matches.forEach((choice, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(index === selected));
      button.textContent = choice.tag ? `#${choice.tag}` : choice.file ? choice.file.path : `Neue Notiz „${choice.name}“ anlegen`;
      button.addEventListener('mousedown', event => event.preventDefault()); button.onclick = () => insertLink(choice); box.append(button);
    });
    box.hidden = !matches.length;
  }
  function updateSuggestions() {
    if (!state.directory || !state.folderTarget || editor.selectionStart !== editor.selectionEnd) { closeSuggestions(); return; }
    const cursor = editor.selectionStart, prefix = editor.value.slice(0, cursor), match = prefix.match(/\[\[([^\]\n|]*)$/);
    if (!match) {
      const candidate = prefix.match(/#[\p{L}\p{N}_/-]*$/u);
      if (!candidate || !window.GraphitTags) { closeSuggestions(); return; }
      const start = cursor - candidate[0].length, line = prefix.split('\n').length;
      const probe = prefix + 'a' + editor.value.slice(cursor);
      const parsed = FolioCore.findTags(probe).find(tag => tag.source === 'inline' && tag.line === line && tag.start === start - (prefix.lastIndexOf('\n') + 1));
      if (!parsed) { closeSuggestions(); return; }
      const query = FolioCore.tagKey(candidate[0].slice(1));
      matches = window.GraphitTags.index().filter(tag => tag.key.startsWith(query) && tag.key !== query).slice(0, 8).map(tag => ({ tag: tag.name }));
      const suffix = editor.value.slice(cursor).match(/^[\p{L}\p{N}_/-]*/u)[0];
      selected = 0; linkRange = { start, end: cursor + suffix.length }; $('link-suggestions').setAttribute('aria-label', 'Tag-Vorschläge'); renderSuggestions(); return;
    }
    $('link-suggestions').setAttribute('aria-label', 'Notizverknüpfungen');
    const query = match[1].trim(), lower = query.toLocaleLowerCase('de');
    matches = workspaceFiles().filter(file => !file.error && file.path.toLocaleLowerCase('de').includes(lower)).slice(0, 8).map(file => ({ file }));
    if (query && !/[\\/\r\n\[\]|]/.test(query) && query !== '.' && query !== '..') {
      const target = FolioCore.resolveLink(state.path || state.name, `./${query}`, 'wiki', workspaceFiles());
      if (target.kind === 'invalid' && target.reason === 'Datei nicht gefunden') matches.push({ name: query });
    }
    selected = 0; linkRange = { start: cursor - match[0].length, end: editor.value.slice(cursor, cursor + 2) === ']]' ? cursor + 2 : cursor }; renderSuggestions();
  }
  function bindEditor(element) {
    element.addEventListener('input', updateSuggestions);
    element.addEventListener('keydown', event => {
      if ($('link-suggestions').hidden || !matches.length) return;
      if (event.key === 'Escape') { event.preventDefault(); closeSuggestions(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; renderSuggestions(); }
      else if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); insertLink(matches[selected]); }
    });
    element.addEventListener('blur', () => { setTimeout(closeSuggestions, 150); });
  }
  bindEditor(editor);
  window.GraphitEnhancements = { bindEditor, workspaceChanged, renameFavorite(oldPath, newPath) { favorites = favorites.map(path => path === oldPath ? newPath : path); storeFavorites(); renderQuickFiles(); }, changed: renderQuickFiles, documentOpened() { closeSuggestions(); hideStart(); renderQuickFiles(); } };
  showStart();
})();
