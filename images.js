'use strict';

(() => {
  const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/bmp': 'bmp' };
  const imageStates = new WeakMap();
  function dataURL(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  }
  async function insert(files, target) {
    if (state.isNew) { toast('Bitte speichere das neue Dokument zuerst und füge das Bild erneut ein.'); return; }
    if (state.moving || saveInFlight) { toast('Bitte warte, bis der laufende Vorgang abgeschlossen ist.'); return; }
    const start = target.selectionStart, end = target.selectionEnd, links = [], failures = [];
    state.moving = true; target.readOnly = true; $('save').disabled = true;
    try {
      let dir = null;
      if (state.directory && state.folderTarget && state.path) {
        dir = state.directory;
        const parts = state.path.split('/'); parts.pop();
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        dir = await dir.getDirectoryHandle('attachments', { create: true });
      }
      for (const file of files) {
        try {
          const ext = types[file.type]; if (!ext) throw new Error('Nicht unterstütztes Bildformat');
          if (!dir) { links.push(`![Bild](${await dataURL(file)})`); continue; }
          let base = (file.name || 'bild').replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'bild';
          let name = `${base}.${ext}`, n = 2;
          while (true) { try { await dir.getFileHandle(name); name = `${base}-${n++}.${ext}`; } catch (error) { if (error.name === 'NotFoundError') break; throw error; } }
          const handle = await dir.getFileHandle(name, { create: true });
          try { const writable = await handle.createWritable(); await writable.write(file); await writable.close(); }
          catch (error) { try { await dir.removeEntry(name); } catch {} throw error; }
          links.push(`![Bild](./attachments/${encodeURIComponent(name)})`);
        } catch (error) { failures.push(`${file.name || 'Bild'}: ${error.message}`); }
      }
      if (links.length) {
        target.readOnly = false; target.focus(); target.setSelectionRange(start, end);
        if (!document.execCommand('insertText', false, links.join('\n'))) { target.setRangeText(links.join('\n'), start, end); edited(); }
      }
      if (failures.length) toast(`Bilder konnten nicht eingefügt werden: ${failures.join('; ')}`);
    } finally { state.moving = false; target.readOnly = false; $('save').disabled = false; }
  }
  function bind(element) {
    element.addEventListener('paste', event => { const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); insert(files, element); } });
    element.addEventListener('dragover', event => { if ([...(event.dataTransfer?.items || [])].some(item => item.kind === 'file' && item.type.startsWith('image/'))) event.preventDefault(); });
    element.addEventListener('drop', event => { const files = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); insert(files, element); } });
  }
  async function resolve(container) {
    const previous = imageStates.get(container);
    if (previous) for (const url of previous.urls) URL.revokeObjectURL(url);
    const current = { urls: [] }; imageStates.set(container, current);
    if (!state.directory || !state.folderTarget || !state.path) return;
    const root = state.directory, source = state.path;
    for (const img of container.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (!src || /^(?:https?:|data:|\/\/)/i.test(src)) continue;
      try {
        const parts = source.split('/'); parts.pop();
        for (const segment of src.split('/')) { const part = decodeURIComponent(segment); if (!part || part === '.') continue; if (part === '..') { if (!parts.length) throw new Error('Ungültiger Pfad'); parts.pop(); } else { if (part.includes('/') || part.includes('\\')) throw new Error('Ungültiger Pfad'); parts.push(part); } }
        const name = parts.pop(); let dir = root;
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        const file = await (await dir.getFileHandle(name)).getFile();
        if (root !== state.directory || source !== state.path || !img.isConnected || imageStates.get(container) !== current) continue;
        const url = URL.createObjectURL(file); current.urls.push(url); img.src = url;
      } catch { img.alt = `${img.alt} (Bild nicht verfügbar)`; }
    }
  }
  bind(editor); window.GraphitImages = { bind, resolve };
})();
