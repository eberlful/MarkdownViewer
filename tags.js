'use strict';

// The index is derived from the workspace snapshot and current tab drafts.
(() => {
  let workspace = null, selected = '', cache = new Map();
  function syncWorkspace() {
    if (workspace === state.directory) return;
    workspace = state.directory; selected = ''; cache = new Map(); $('tag-filter').value = '';
  }
  function index() {
    syncWorkspace();
    if (!state.directory) return [];
    const groups = new Map(), activePaths = new Set();
    for (const file of workspaceFiles().filter(item => !item.error).sort((a, b) => a.path.localeCompare(b.path, 'de'))) {
      activePaths.add(file.path);
      const text = window.GraphitTabs ? window.GraphitTabs.textFor(file) : file.text;
      let cached = cache.get(file.path);
      if (!cached || cached.text !== text) { cached = { text, tags: FolioCore.findTags(text) }; cache.set(file.path, cached); }
      for (const tag of cached.tags) {
        const parts = tag.name.split('/');
        for (let i = 1; i <= parts.length; i++) {
          const name = parts.slice(0, i).join('/'), key = FolioCore.tagKey(name);
          if (!groups.has(key)) groups.set(key, { key, name, files: new Map() });
          const group = groups.get(key), previous = group.files.get(file.path);
          if (!previous || tag.line < previous.line) group.files.set(file.path, { file, line: tag.line, context: tag.context });
        }
      }
    }
    for (const path of cache.keys()) if (!activePaths.has(path)) cache.delete(path);
    return [...groups.values()].sort((a, b) => {
      const left = a.key.split('/'), right = b.key.split('/');
      for (let i = 0; i < Math.min(left.length, right.length); i++) {
        const order = left[i].localeCompare(right[i], 'de'); if (order) return order;
      }
      return left.length - right.length;
    });
  }
  function message(parent, text) { const node = document.createElement('p'); node.className = 'tag-message'; node.textContent = text; parent.append(node); }
  function render() {
    syncWorkspace();
    if ($('tags-view').hidden) return;
    const box = $('tag-content'); box.replaceChildren();
    if (!state.directory) { message(box, 'Öffne einen Arbeitsbereich, um Tags zu durchsuchen.'); return; }
    const groups = index(), filter = FolioCore.tagKey($('tag-filter').value.trim().replace(/^#/, ''));
    const list = document.createElement('div'); list.className = 'tag-list'; list.setAttribute('aria-label', 'Tags');
    for (const group of groups.filter(item => item.key.includes(filter))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tag-item';
      button.setAttribute('aria-pressed', String(selected === group.key));
      button.style.setProperty('--tag-depth', String(group.name.split('/').length - 1));
      const name = document.createElement('span'); name.textContent = `#${group.name}`;
      const count = document.createElement('span'); count.className = 'tag-count'; count.textContent = String(group.files.size);
      button.append(name, count); button.onclick = () => { selected = group.key; render(); const active = box.querySelector('button[aria-pressed="true"]'); if (active) active.focus(); }; list.append(button);
    }
    if (!list.children.length) message(list, filter ? 'Keine passenden Tags gefunden.' : 'Noch keine Tags gefunden.');
    const results = document.createElement('section'); results.className = 'tag-results'; results.setAttribute('aria-live', 'polite');
    const current = groups.find(group => group.key === selected);
    if (!selected) message(results, 'Wähle ein Tag, um passende Dateien zu sehen.');
    else if (!current) message(results, 'Für dieses Tag wurden keine Dateien gefunden.');
    else {
      const heading = document.createElement('h3'); heading.textContent = `#${current.name}`; results.append(heading);
      for (const hit of current.files.values()) {
        const button = document.createElement('button'); button.type = 'button';
        const path = document.createElement('strong'); path.textContent = `${hit.file.path}:${hit.line}`;
        const context = document.createElement('span'); context.textContent = hit.context;
        button.append(path, context); button.onclick = () => openProjectFile(hit.file, hit.line); results.append(button);
      }
    }
    box.append(list, results);
    if (state.scanErrors.length) message(box, 'Einige Dateien konnten nicht gelesen werden; die Übersicht ist möglicherweise unvollständig.');
  }
  function open(name) { syncWorkspace(); selected = FolioCore.tagKey(name); $('tag-filter').value = ''; $('tags-tab').click(); }
  $('tag-filter').addEventListener('input', render);
  window.GraphitTags = { index, render, open };
})();
