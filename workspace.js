'use strict';

// Project views use the same workspace snapshot and open-tab contents as search and Kanban.
(() => {
  const textOf = file => window.GraphitTabs ? window.GraphitTabs.textFor(file) : file.text;
  const isTicket = path => /^[^/]+\/tickets\/.+\.(?:md|markdown)$/i.test(path);
  const btn = (label, action) => { const node = document.createElement('button'); node.type = 'button'; node.className = 'overview-link'; node.textContent = label; node.onclick = action; return node; };
  function group(parent, title) { const section = document.createElement('section'); section.className = 'overview-group'; const h = document.createElement('h3'); h.textContent = title; section.append(h); parent.append(section); return section; }
  function empty(section, message) { if (section.children.length === 1) { const p = document.createElement('p'); p.textContent = message; section.append(p); } }
  function related(file, files) {
    const ticket = isTicket(file.path), results = new Map();
    for (const source of files) {
      if (source.error) continue;
      for (const link of FolioCore.findLinks(textOf(source))) {
        const target = FolioCore.resolveLink(source.path, link.target, link.type, files);
        if (target.kind !== 'local') continue;
        let other = null;
        if (source.path === file.path) other = files.find(item => item.path === target.path);
        else if (target.path === file.path) other = source;
        if (other && other.path !== file.path && ticket !== isTicket(other.path)) results.set(other.path, other);
      }
    }
    return [...results.values()].sort((a, b) => a.path.localeCompare(b.path, 'de'));
  }
  function renderRelations() {
    const box = $('related-files'); box.replaceChildren();
    const files = workspaceFiles(), file = state.folderTarget && files.find(item => item.path === state.path);
    if (!file || file.error) return;
    const section = group(box, isTicket(file.path) ? 'Zugehörige Dokumente' : 'Zugehörige Tickets');
    for (const other of related(file, files)) section.append(btn(other.path, () => openProjectFile(other)));
    empty(section, 'Noch keine Verknüpfungen vorhanden.');
    if (state.scanErrors.length) { const warning = document.createElement('p'); warning.textContent = 'Einige Dateien konnten nicht gelesen werden; die Liste ist möglicherweise unvollständig.'; section.append(warning); }
  }
  function renderProjects() {
    const select = $('projects-select'), box = $('projects-content'); select.replaceChildren(); box.replaceChildren();
    for (const project of state.projects) { const option = document.createElement('option'); option.value = project.name; option.textContent = project.name; select.append(option); }
    select.value = state.project; select.disabled = !state.projects.length;
    if (!state.directory || !state.project) { box.append(makeMessage('Kein Projekt ausgewählt', 'Öffne einen Arbeitsbereich mit einem Projektordner.')); return; }
    const files = workspaceFiles().filter(file => !file.error && file.path.startsWith(`${state.project}/`));
    const tickets = group(box, 'Offene Tickets');
    for (const status of ['offen', 'in_arbeit']) for (const file of files.filter(item => isTicket(item.path))) {
      const ticket = FolioCore.parseTicket(textOf(file)); if (!ticket.error && ticket.status === status) tickets.append(btn(`${statusNames[status]} · ${ticket.title}`, () => openProjectFile(file)));
    }
    empty(tickets, 'Keine offenen Tickets.');
    const todos = group(box, 'Offene Aufgaben');
    for (const file of files) for (const todo of FolioCore.findTodos(textOf(file))) todos.append(btn(`${todo.text} · ${file.path}:${todo.line}`, () => openProjectFile(file, todo.line)));
    empty(todos, 'Keine offenen Aufgaben.');
    const recent = group(box, 'Zuletzt geändert');
    for (const file of [...files].filter(item => item.modified).sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path, 'de')).slice(0, 8)) recent.append(btn(file.path, () => openProjectFile(file)));
    empty(recent, 'Keine Änderungsdaten verfügbar.');
    const links = group(box, 'Links aus der Projekt-README');
    const readme = files.find(file => file.path.toLowerCase() === `${state.project}/readme.md`.toLowerCase());
    if (readme) for (const link of FolioCore.findLinks(textOf(readme))) {
      const target = FolioCore.resolveLink(readme.path, link.target, link.type, workspaceFiles());
      if (target.kind === 'local') { const file = workspaceFiles().find(item => item.path === target.path); const fragment = link.target.split('#')[1]; if (file) links.append(btn(link.label, () => openProjectFile(file, fragment ? FolioCore.anchorLine(textOf(file), fragment) : null))); }
      else if (target.kind === 'external' && /^(https?:|mailto:)/i.test(link.target)) { const a = document.createElement('a'); a.href = link.target; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.label; links.append(a); }
    }
    empty(links, 'Keine Links in der Projekt-README.');
    if (state.scanErrors.length) { const warning = document.createElement('p'); warning.className = 'scan-warning'; warning.textContent = 'Einige Dateien konnten nicht gelesen werden; die Übersicht ist möglicherweise unvollständig.'; box.prepend(warning); }
  }
  function render() { renderProjects(); renderRelations(); }
  $('projects-select').onchange = event => { state.project = event.target.value; renderBoard(); renderProjects(); };
  $('projects-tab').addEventListener('click', renderProjects);

  $('quick-capture').onclick = () => { $('capture-error').textContent = ''; $('capture-dialog').showModal(); $('capture-text').focus(); };
  $('capture-cancel').onclick = () => $('capture-dialog').close();
  window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.altKey && !event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); if (!$('capture-dialog').open) $('quick-capture').click(); } });
  let capturing = false;
  $('capture-form').onsubmit = async event => {
    event.preventDefault(); if (capturing) return; const input = $('capture-text').value.trim(); if (!input) return;
    const error = $('capture-error'); error.textContent = '';
    try {
      if (!state.directory) throw new Error('Bitte zuerst einen Arbeitsbereich öffnen.');
      if (state.moving || saveInFlight || (window.GraphitTabs && window.GraphitTabs.hasSaving())) throw new Error('Bitte warte, bis laufende Schreibvorgänge abgeschlossen sind.');
      if (window.GraphitTabs && window.GraphitTabs.isDirty('Inbox.md')) throw new Error('Bitte speichere oder schließe den Entwurf der Inbox zuerst.');
      capturing = true; state.moving = true;
      const root = state.directory, cached = state.files.find(file => file.path === 'Inbox.md'); let handle, original = '';
      try { handle = await root.getFileHandle('Inbox.md'); original = await (await handle.getFile()).text(); if (!cached || cached.error || cached.text !== original) throw new Error('Inbox wurde extern geändert. Bitte Dateien aktualisieren und erneut versuchen.'); }
      catch (err) { if (err.name !== 'NotFoundError') throw err; if (cached) throw new Error('Inbox wurde extern entfernt. Bitte Dateien aktualisieren.'); handle = await root.getFileHandle('Inbox.md', { create: true }); }
      if (root !== state.directory || (await (await handle.getFile()).text()) !== original) throw new Error('Die Inbox hat sich geändert. Bitte erneut versuchen.');
      const entry = $('capture-kind').value === 'task' ? `- [ ] ${input.replace(/\r?\n/g, '\n  ')}` : input;
      const next = `${original}${original && !original.endsWith('\n') ? '\n' : ''}${original ? '\n' : '# Inbox\n\n'}${entry}\n`;
      const writable = await handle.createWritable(); await writable.write(next); await writable.close();
      if (window.GraphitTabs) window.GraphitTabs.externalUpdate('Inbox.md', next);
      await refreshFiles(); $('capture-text').value = ''; $('capture-dialog').close(); toast('In Inbox gespeichert.');
    } catch (err) { error.textContent = err.message; } finally { if (capturing) { capturing = false; state.moving = false; } }
  };

  async function resolveConflict(handle, draft, disk) {
    const dialog = $('conflict-dialog'); $('conflict-draft').value = draft; $('conflict-disk').value = disk; $('conflict-message').textContent = '';
    while (true) {
      const choice = await new Promise(resolve => {
        const done = value => { dialog.oncancel = null; dialog.close(); resolve(value); };
        $('conflict-cancel').onclick = () => done('cancel'); $('conflict-load').onclick = () => done('disk'); $('conflict-save').onclick = () => done('draft');
        dialog.oncancel = event => { event.preventDefault(); done('cancel'); }; dialog.showModal();
      });
      if (choice === 'cancel') return { choice, disk };
      const latest = await (await handle.getFile()).text();
      if (latest === disk) return { choice, disk };
      disk = latest; $('conflict-disk').value = latest; $('conflict-message').textContent = 'Die Datei wurde erneut geändert. Bitte vergleiche die neue Version.';
    }
  }

  async function rename(file) {
    if (!state.directory || state.moving || saveInFlight || (window.GraphitTabs && window.GraphitTabs.hasSaving())) { toast('Bitte warte, bis laufende Schreibvorgänge abgeschlossen sind.'); return; }
    const name = prompt('Neuer Dateiname:', file.name); if (name === null) return;
    let leaf = name.trim(); if (!leaf || /[\\/]/.test(leaf) || leaf === '.' || leaf === '..') { toast('Bitte einen gültigen Dateinamen eingeben.'); return; }
    if (!/\.(?:md|markdown)$/i.test(leaf)) leaf += '.md';
    const parts = file.path.split('/'); parts.pop(); const newPath = [...parts, leaf].join('/'); if (newPath === file.path) return;
    if (state.scanErrors.length) { toast('Bitte zuerst Lesefehler im Arbeitsbereich beheben.'); return; }
    const files = workspaceFiles();
    if (files.some(item => item.path === newPath)) { toast('Eine Datei oder ein Entwurf mit diesem Namen existiert bereits.'); return; }
    const future = files.map(item => item.path === file.path ? { ...item, path: newPath, name: leaf } : item);
    const edits = [];
    for (const item of files) {
      if (item.error || !item.handle) continue;
      let updated = textOf(item); const targets = new Map();
      for (const link of FolioCore.findLinks(updated)) {
        const before = FolioCore.resolveLink(item.path, link.target, link.type, files); if (before.kind !== 'local' || link.target.startsWith('#')) continue;
        const after = FolioCore.resolveLink(item.path === file.path ? newPath : item.path, link.target, link.type, future);
        const expected = before.path === file.path ? newPath : before.path;
        if (after.kind !== 'local' || after.path !== expected) targets.set(before.path, expected);
      }
      for (const [oldTarget, newTarget] of targets) updated = FolioCore.rewriteLinks(updated, item.path, oldTarget, newTarget, files).text;
      if (updated !== textOf(item) || item.path === file.path) edits.push({ file: item, original: textOf(item), updated });
    }
    const affected = edits.filter(item => item.updated !== item.original);
    if (edits.some(item => window.GraphitTabs && window.GraphitTabs.isDirty(item.file.path))) { toast('Bitte speichere zuerst alle betroffenen Dokumente.'); return; }
    const update = !affected.length || window.confirm(`Betroffene Dateien:\n${affected.map(item => item.file.path).join('\n')}\n\nLinks beim Umbenennen aktualisieren?`);
    if (!update) for (const edit of edits) edit.updated = edit.original;
    if (!window.confirm(`„${file.path}“ in „${newPath}“ umbenennen?`)) return;
    state.moving = true; editor.readOnly = true; $('save').disabled = true;
    let created = false, removed = false; const written = [];
    try {
      let parent = state.directory; for (const part of parts) parent = await parent.getDirectoryHandle(part);
      try { await parent.getFileHandle(leaf); throw new Error('Eine Datei mit diesem Namen existiert bereits.'); } catch (err) { if (err.name !== 'NotFoundError') throw err; }
      for (const edit of edits) if (await (await edit.file.handle.getFile()).text() !== edit.original) throw new Error(`„${edit.file.path}“ wurde extern geändert. Bitte Dateien aktualisieren.`);
      const target = await parent.getFileHandle(leaf, { create: true }); created = true;
      const self = edits.find(edit => edit.file.path === file.path);
      let writable = await target.createWritable(); await writable.write(self.updated); await writable.close();
      for (const edit of edits.filter(item => item.file.path !== file.path && item.updated !== item.original)) {
        if (await (await edit.file.handle.getFile()).text() !== edit.original) throw new Error(`„${edit.file.path}“ wurde zwischenzeitlich geändert.`);
        writable = await edit.file.handle.createWritable(); await writable.write(edit.updated); await writable.close(); written.push(edit.file.path);
        if (window.GraphitTabs) window.GraphitTabs.externalUpdate(edit.file.path, edit.updated);
        if (state.path === edit.file.path && !state.dirty) { editor.value = edit.updated; state.saved = edit.updated; }
      }
      if (await (await file.handle.getFile()).text() !== self.original) throw new Error('Die ursprüngliche Datei wurde zwischenzeitlich geändert.');
      await parent.removeEntry(file.name); removed = true;
      if (window.GraphitTabs) window.GraphitTabs.renamed(file.path, newPath, target, self.updated);
      if (window.FolioFeatures) window.FolioFeatures.renameRecent(file.path, newPath);
      if (window.GraphitEnhancements) window.GraphitEnhancements.renameFavorite(file.path, newPath);
      await refreshFiles(); changed(); toast('Datei umbenannt.');
    } catch (err) {
      await refreshFiles();
      const detail = `${err.message}${created && !removed ? ` Neue Datei „${newPath}“ und Original sind vorhanden.` : ''}${written.length ? ` Bereits aktualisiert: ${written.join(', ')}.` : ''}`;
      window.alert(detail);
    } finally { state.moving = false; editor.readOnly = false; $('save').disabled = false; }
  }
  window.GraphitWorkspace = { render, resolveConflict, rename };
  renderFiles(); render();
})();
