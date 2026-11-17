'use strict';

// Each tab keeps its own textarea, preserving the browser's native undo history.
(() => {
  const tabs = [];
  let active = null, counter = 0, restoring = false, persistedSignature = '', renderedSignature = '', restoreGeneration = 0;
  const fields = ['name', 'file', 'path', 'saved', 'dirty', 'folderTarget', 'isNew'];

  function snapshot(tab) {
    if (!tab) return;
    for (const key of fields) tab[key] = state[key];
    tab.error = saveError;
    tab.workspace = state.folderTarget ? state.directory : tab.workspace;
  }
  function capture() { snapshot(active); render(); persist(); }
  function makeTab(element) {
    const tab = { id: ++counter, element, workspace: state.folderTarget ? state.directory : null, error: '' };
    tabs.push(tab); active = tab; snapshot(tab); return tab;
  }
  function render() {
    const bar = $('document-tabs');
    const signature = JSON.stringify([active && active.id, tabs.map(tab => [tab.id, tab.name, tab.path, tab.dirty, tab.error, !!tab.saving])]);
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    const focused = document.activeElement, keepFocus = focused && typeof bar.contains === 'function' && bar.contains(focused) ? { id: focused.dataset.tabId, action: focused.dataset.tabAction } : null;
    let focusTarget = null; bar.replaceChildren();
    for (const tab of tabs) {
      const item = document.createElement('div'); item.className = 'document-tab';
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab === active)); button.dataset.tabId = String(tab.id); button.dataset.tabAction = 'select'; button.title = tab.path || tab.name;
      button.textContent = `${tab.error ? '⚠ ' : tab.dirty ? '● ' : ''}${tab.name}`; button.onclick = () => select(tab);
      const close = document.createElement('button'); close.type = 'button'; close.className = 'close-tab'; close.textContent = '×';
      close.dataset.tabId = String(tab.id); close.dataset.tabAction = 'close'; close.setAttribute('aria-label', `Tab ${tab.name} schließen`); close.onclick = () => closeTab(tab);
      item.append(button, close); bar.append(item);
      if (keepFocus && keepFocus.id === String(tab.id)) focusTarget = keepFocus.action === 'close' ? close : button;
    }
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }
  function select(tab) {
    if (tab === active) return true;
    if (tab.saving) { toast('Dieses Dokument wird gerade gespeichert.'); return false; }
    if (!canLeave(true)) return false;
    snapshot(active); clearTimeout(saveTimer); queueSave(active); clearTimeout(tab.timer);
    active.element.hidden = true; active.element.removeAttribute('id');
    active = tab; editor = tab.element; editor.hidden = false; editor.id = 'editor';
    for (const key of fields) state[key] = tab[key];
    saveError = tab.error || ''; documentEpoch++;
    const project = state.path.split('/')[0]; if (state.path.includes('/') && state.projects.some(item => item.name === project)) state.project = project;
    changed(); renderFiles(); scheduleAutosave();
    if (window.FolioFeatures) window.FolioFeatures.documentOpened();
    return true;
  }
  function prepareNew() {
    snapshot(active); clearTimeout(saveTimer); queueSave(active);
    active.element.hidden = true; active.element.removeAttribute('id');
    const element = editor.cloneNode(false); element.hidden = false; element.id = 'editor'; element.value = '';
    editor.parentElement.append(element); editor = element;
    bindAppEditor(editor); if (window.FolioFeatures) window.FolioFeatures.bindEditor(editor);
    makeTab(editor);
  }
  function closeTab(tab) {
    if (saveInFlight || tab.saving) { toast('Bitte warte, bis das Speichern abgeschlossen ist.'); return; }
    snapshot(active);
    if (tab.dirty && !window.confirm(`„${tab.name}“ enthält ungespeicherte Änderungen. Tab trotzdem schließen?`)) return;
    if (tabs.length === 1) { toast('Mindestens ein Dokument bleibt geöffnet.'); return; }
    if (tab === active) {
      const index = tabs.indexOf(tab); const next = tabs[index + 1] || tabs[index - 1];
      if (!select(next)) return;
    }
    clearTimeout(tab.timer); tabs.splice(tabs.indexOf(tab), 1); tab.element.remove(); render(); persist();
  }
  function selectPath(path) {
    const tab = tabs.find(item => item.workspace === state.directory && item.folderTarget && item.path === path);
    return tab ? (select(tab) ? true : null) : false;
  }
  function textFor(file) {
    const tab = tabs.find(item => item.workspace === state.directory && item.folderTarget && item.path === file.path);
    return tab ? tab.element.value : file.text;
  }
  function workspaceFiles() {
    const files = [...state.files];
    for (const tab of tabs) {
      if (!tab.folderTarget || tab.workspace !== state.directory || !tab.path || files.some(file => file.path === tab.path)) continue;
      files.push({ name: tab.name, path: tab.path, handle: tab.file, text: tab.element.value, kind: 'file' });
    }
    return files;
  }
  function isDirty(path) { snapshot(active); return tabs.some(tab => tab.workspace === state.directory && tab.folderTarget && tab.path === path && tab.dirty); }
  function hasDirty() { snapshot(active); return tabs.some(tab => tab.dirty); }
  function hasSaving() { return tabs.some(tab => tab.saving); }
  function hasUnsavedNew() { snapshot(active); return tabs.some(tab => tab.workspace === state.directory && tab.folderTarget && tab.isNew); }
  function queueSave(tab) {
    clearTimeout(tab.timer);
    if (!tab.file || !tab.dirty || tab.error || tab.isNew) return;
    tab.timer = setTimeout(async () => {
      if (tab === active) { scheduleAutosave(); return; }
      tab.saving = true; render();
      try {
        const original = tab.saved, contents = tab.element.value;
        const latest = await (await tab.file.getFile()).text();
        if (latest !== original) throw new Error('Die Datei wurde außerhalb von Graphit geändert.');
        const writable = await tab.file.createWritable(); await writable.write(contents); await writable.close();
        tab.saved = contents; tab.dirty = tab.element.value !== contents; tab.error = '';
        const cached = tab.workspace === state.directory && state.files.find(file => file.path === tab.path);
        if (cached) cached.text = contents;
      } catch (error) { tab.error = `Speichern fehlgeschlagen: ${error.message}`; toast(`„${tab.name}“ konnte nicht gespeichert werden.`); }
      finally { tab.saving = false; render(); if (tab.dirty && !tab.error) queueSave(tab); }
    }, 900);
  }
  function reconcile(files) {
    snapshot(active); let updatedActive = false;
    for (const tab of tabs) {
      if (!tab.folderTarget || tab.workspace !== state.directory || tab.dirty || tab.saving || tab.error) continue;
      const file = files.find(item => item.path === tab.path && !item.error);
      if (!file || file.text === tab.saved || (tab === active && saveInFlight)) continue;
      tab.element.value = file.text; tab.saved = file.text;
      if (tab === active) { state.saved = file.text; updatedActive = true; }
    }
    if (updatedActive) { updateStatus(); if (window.FolioFeatures) window.FolioFeatures.renderEditor(); }
  }
  function externalUpdate(path, text) {
    for (const tab of tabs) {
      if (tab === active || tab.workspace !== state.directory || tab.path !== path || tab.dirty) continue;
      tab.element.value = text; tab.saved = text;
    }
  }
  function workspaceWillChange() {
    snapshot(active); restoreGeneration++;
    for (const tab of tabs) if (tab.workspace === state.directory) { tab.workspace = null; tab.folderTarget = false; tab.path = ''; }
    if (active) { state.folderTarget = active.folderTarget; state.path = active.path; }
    persistedSignature = '';
  }
  function persist() {
    if (restoring || !state.directory || typeof recentWrites === 'undefined') return;
    const handle = state.directory;
    const paths = tabs.filter(tab => tab.workspace === handle && tab.folderTarget && tab.path && tab.file).map(tab => tab.path);
    const current = active.workspace === handle && active.folderTarget ? active.path : '';
    const signature = JSON.stringify([paths, current]); if (signature === persistedSignature) return;
    persistedSignature = signature;
    recentWrites = recentWrites.catch(() => {}).then(async () => {
      const records = await recentRecords(); let item = await matchingRecent(records, handle);
      if (!item) { item = { handle, paths: [] }; records.push(item); }
      item.openTabs = paths; item.activeTab = current;
      const db = await storageDatabase();
      try { await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(records, 'recentWorkspaces'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
    }).catch(() => {});
  }
  async function workspaceChanged(handle) {
    const generation = ++restoreGeneration; persistedSignature = ''; restoring = true;
    try {
      await recentWrites.catch(() => {});
      const records = await recentRecords(); const record = await matchingRecent(records, handle);
      if (generation !== restoreGeneration || state.directory !== handle || !record || !Array.isArray(record.openTabs)) return;
      const initialTab = active, initialText = editor.value;
      for (const path of record.openTabs) {
        if (generation !== restoreGeneration || state.directory !== handle || active !== initialTab || editor.value !== initialText) break;
        if (tabs.some(tab => tab.workspace === handle && tab.path === path)) continue;
        const file = state.files.find(item => item.path === path && !item.error); if (!file) continue;
        let contents; try { contents = await (await file.handle.getFile()).text(); } catch { toast(`„${file.name}“ konnte nicht wiederhergestellt werden.`); continue; }
        if (generation !== restoreGeneration || state.directory !== handle || active !== initialTab || editor.value !== initialText) break;
        prepareNew(); state.folderTarget = true; editor.value = contents; state.name = file.name; state.path = file.path; state.file = file.handle; state.saved = contents; state.isNew = false; saveError = ''; documentEpoch++; updateStatus(); snapshot(active);
        // Keep restoring in the background while retaining the original active tab.
        const restored = active; restored.element.hidden = true; restored.element.removeAttribute('id');
        active = initialTab; editor = initialTab.element; editor.hidden = false; editor.id = 'editor'; for (const key of fields) state[key] = initialTab[key]; saveError = initialTab.error || '';
      }
      const target = tabs.find(tab => tab.workspace === handle && tab.path === record.activeTab);
      if (target && !initialTab.dirty && initialTab.element.value === welcome) select(target);
      else { changed(); renderFiles(); }
    } catch {} finally { if (generation === restoreGeneration) { restoring = false; capture(); } }
  }
  makeTab(editor); render();
  window.GraphitTabs = { capture, prepareNew, selectPath, hasDirty, hasSaving, hasUnsavedNew, isDirty, textFor, workspaceFiles, reconcile, externalUpdate, workspaceWillChange, workspaceChanged };
})();
