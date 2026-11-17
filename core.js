'use strict';

// Ticket metadata intentionally supports a small, lossless YAML scalar subset.
const FolioCore = (() => {
  const statuses = ['offen', 'in_arbeit', 'erledigt'];
  const priorities = ['niedrig', 'mittel', 'hoch'];
  function scalar(raw) {
    const value = raw.trim();
    if (!value) return null;
    if (value[0] === '"') { try { const parsed = JSON.parse(value); return typeof parsed === 'string' ? parsed : null; } catch { return null; } }
    if (value[0] === "'") return /^'(?:[^']|'')*'$/.test(value) ? value.slice(1, -1).replace(/''/g, "'") : null;
    if (/[:#\[\]{}]|^[!&*|>@`"']/.test(value)) return null;
    return value;
  }
  function parseTicket(text) {
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    if (lines[0] !== '---') return { error: 'YAML-Header fehlt.' };
    const end = lines.indexOf('---', 1);
    if (end < 0) return { error: 'YAML-Header ist nicht abgeschlossen.' };
    const values = {}, positions = {};
    for (let i = 1; i < end; i++) {
      const match = lines[i].match(/^(title|status|priority):\s*(.*?)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (Object.hasOwn(values, key)) return { error: `Feld „${key}“ ist mehrfach vorhanden.` };
      values[key] = scalar(match[2]); positions[key] = i;
    }
    if (!values.title || !values.title.trim()) return { error: 'Ein gültiger Titel fehlt.' };
    if (!statuses.includes(values.status)) return { error: 'Status muss offen, in_arbeit oder erledigt sein.' };
    if (!priorities.includes(values.priority)) return { error: 'Priorität muss niedrig, mittel oder hoch sein.' };
    return { ...values, lines, positions, newline };
  }
  function setTicketStatus(text, status) {
    const ticket = parseTicket(text);
    if (ticket.error || !statuses.includes(status)) return null;
    ticket.lines[ticket.positions.status] = `status: ${status}`;
    return ticket.lines.join(ticket.newline);
  }
  function findTodos(text) {
    const results = []; let fence = null, listContext = false;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker) {
        if (!fence) fence = { char: marker[1][0], length: marker[1].length };
        else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        return;
      }
      if (fence) return;
      if (!line.trim()) { listContext = false; return; }
      const item = line.match(/^( *)(?:[-+*]|\d+[.)])\s+(.*)$/);
      if (!item) { if (!/^(?: {4}|\t)/.test(line)) listContext = false; return; }
      if (item[1].length >= 4 && !listContext) return;
      listContext = true;
      const task = item[2].match(/^\[ \]\s*(.*)$/);
      if (task) results.push({ line: index + 1, text: task[1] || '(ohne Beschreibung)' });
    });
    return results;
  }
  const tagName = /^(?=[\p{L}\p{N}_/-]*[\p{L}_-])[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u;
  const tagKey = name => name.toLocaleLowerCase('de');
  function inlineTags(text) {
    // Mask constructs that can contain literal # characters, while preserving offsets.
    const masked = text.split('');
    function mask(start, end) { for (let i = start; i < end; i++) masked[i] = ' '; }
    const protectedSyntax = /(`+)([\s\S]*?)\1|!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^\n)]*\)|(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>]+|<!--[\s\S]*?-->/gi;
    let match;
    while ((match = protectedSyntax.exec(text))) {
      // Link labels remain ordinary text; only their destination is excluded.
      if (/^\[[^[]/.test(match[0]) && match[0].includes('](')) {
        const start = match.index + match[0].indexOf(']('); mask(start, protectedSyntax.lastIndex);
      } else mask(match.index, protectedSyntax.lastIndex);
    }
    const result = [], pattern = /#[\p{L}\p{N}_/-]+/gu, source = masked.join('');
    while ((match = pattern.exec(source))) {
      const start = match.index, before = text[start - 1] || '';
      if (before && /[\p{L}\p{N}_/#]/u.test(before)) continue;
      let slashes = 0; for (let i = start - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
      if (slashes % 2) continue;
      const name = match[0].slice(1);
      if (!tagName.test(name)) continue;
      result.push({ name, start, end: pattern.lastIndex });
    }
    return result;
  }
  function yamlTagValues(raw) {
    const value = raw.trim();
    if (!value) return [];
    let parts;
    if (value.startsWith('[')) {
      if (!/^\[[\s\S]*\]\s*(?:#.*)?$/.test(value)) return [];
      const content = value.slice(1, value.lastIndexOf(']'));
      parts = content.match(/(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,])+/g) || [];
    } else parts = [value.replace(/\s+#.*$/, '')];
    return parts.map(part => scalar(part)).filter(item => item !== null).map(item => item.replace(/^#/, '')).filter(item => tagName.test(item));
  }
  function findTags(text) {
    const lines = text.split(/\r?\n/), found = []; let firstBody = 0;
    if (lines[0] === '---') {
      const end = lines.indexOf('---', 1);
      if (end !== -1) {
        firstBody = end + 1; let list = false;
        for (let i = 1; i < end; i++) {
          const field = lines[i].match(/^tags:\s*(.*)$/);
          if (field) { list = !field[1].trim(); for (const name of yamlTagValues(field[1])) found.push({ name, line: i + 1, context: lines[i].trim(), source: 'yaml' }); continue; }
          const item = list && lines[i].match(/^\s+-\s+(.+)$/);
          if (item) for (const name of yamlTagValues(item[1])) found.push({ name, line: i + 1, context: lines[i].trim(), source: 'yaml' });
          else if (!/^\s*(?:#.*)?$/.test(lines[i])) list = false;
        }
      }
    }
    let fence = null, listContext = false, comment = false;
    for (let i = firstBody; i < lines.length; i++) {
      const original = lines[i], line = original.replace(/^ {0,3}(?:> ?)+/, '');
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null; continue; }
      if (fence) continue;
      if (!line.trim()) { listContext = false; continue; }
      const item = line.match(/^( *)(?:[-+*]|\d+[.)])\s+/);
      if (/^(?: {4}|\t)/.test(line) && !listContext) continue;
      if (item) listContext = true; else if (!/^(?: {4}|\t)/.test(line)) listContext = false;
      let visible = line, offset = 0;
      if (comment) { const close = visible.indexOf('-->'); if (close < 0) continue; offset = close + 3; visible = visible.slice(offset); comment = false; }
      const open = visible.indexOf('<!--');
      if (open >= 0 && visible.indexOf('-->', open + 4) < 0) { visible = visible.slice(0, open); comment = true; }
      for (const tag of inlineTags(visible)) found.push({ ...tag, start: tag.start + offset + original.length - line.length, end: tag.end + offset + original.length - line.length, line: i + 1, context: original.trim(), source: 'inline' });
    }
    return found;
  }
  function inlineLinks(text) {
    const found = [];
    // Consume code and images first so their content is never mistaken for a link.
    const pattern = /(`+)([\s\S]*?)\1|!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)|\[\[([^\]\n]+)\]\]|\[([^\]\n]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;
    let match;
    while ((match = pattern.exec(text))) {
      let slashes = 0; for (let i = match.index - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
      if (slashes % 2 || match[1] || match[3] !== undefined || (match[5] !== undefined && text[match.index - 1] === '!')) continue;
      if (match[5] !== undefined) {
        const parts = match[5].split('|'); const target = parts.shift().trim();
        if (target) found.push({ type: 'wiki', target, label: parts.join('|').trim() || target, start: match.index, end: pattern.lastIndex });
      } else found.push({ type: 'markdown', target: match[7], label: match[6], start: match.index, end: pattern.lastIndex });
    }
    return found;
  }
  function findLinks(text) {
    const results = []; let fence = null, listContext = false;
    text.split(/\r?\n/).forEach((original, index) => {
      const line = original.replace(/^ {0,3}(?:> ?)+/, '');
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker) { if (!fence) fence = { char: marker[1][0], length: marker[1].length }; else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null; return; }
      if (fence) return;
      if (!line.trim()) { listContext = false; return; }
      const item = line.match(/^( *)(?:[-+*]|\d+[.)])\s+/);
      if (/^(?: {4}|\t)/.test(line) && !(item && listContext)) return;
      if (item) listContext = true; else if (!/^(?: {4}|\t)/.test(line)) listContext = false;
      for (const link of inlineLinks(line)) results.push({ ...link, start: link.start + original.length - line.length, end: link.end + original.length - line.length, line: index + 1, context: original.trim() });
    });
    return results;
  }
  function resolveLink(source, target, type, files) {
    if (target.startsWith('#')) return source ? { kind: 'local', path: source } : { kind: 'invalid', reason: 'Kein Dokument geöffnet' };
    if (type === 'markdown' && (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//'))) return { kind: 'external' };
    let path = target.split('#')[0].split('?')[0];
    try { path = decodeURIComponent(path); } catch { return { kind: 'invalid', reason: 'Ungültige Kodierung im Pfad' }; }
    if (type === 'markdown' && !/\.(?:md|markdown)$/i.test(path)) return { kind: 'external' };
    if (!path || path.startsWith('/') || path.includes('\\')) return { kind: 'invalid', reason: 'Ungültiger lokaler Pfad' };
    const available = files.filter(file => /\.(?:md|markdown)$/i.test(file.path));
    const withExtension = /\.(?:md|markdown)$/i.test(path);
    let matches;
    if (type === 'wiki' && !path.includes('/') && path !== '.' && path !== '..') {
      matches = available.filter(file => { const basename = file.path.split('/').pop(); return withExtension ? basename === path : basename.replace(/\.(?:md|markdown)$/i, '') === path; });
    } else {
      const segments = source.split('/'); segments.pop();
      for (const part of path.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (!segments.length) return { kind: 'invalid', reason: 'Pfad liegt außerhalb des Arbeitsbereichs' }; segments.pop(); } else segments.push(part); }
      const normalized = segments.join('/');
      matches = available.filter(file => file.path === normalized || (type === 'wiki' && !withExtension && (file.path === `${normalized}.md` || file.path === `${normalized}.markdown`)));
    }
    if (matches.length > 1) return { kind: 'invalid', reason: 'Mehrdeutiger Link – bitte einen relativen Pfad angeben' };
    if (!matches.length) return { kind: 'invalid', reason: 'Datei nicht gefunden' };
    if (matches[0].error) return { kind: 'invalid', reason: 'Datei konnte nicht gelesen werden' };
    return { kind: 'local', path: matches[0].path };
  }
  function headings(text) {
    const found = [], counts = new Map(), used = new Set(); let fence = null;
    text.split(/\r?\n/).forEach((line, index) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker) { if (!fence) fence = marker[1]; else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null; return; }
      if (fence) return;
      const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/); if (!match) return;
      const base = match[2].toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-');
      let count = counts.get(base) || 0, slug = count ? `${base}-${count}` : base;
      while (used.has(slug)) slug = `${base}-${++count}`; counts.set(base, count + 1); used.add(slug);
      found.push({ slug, line: index + 1, title: match[2] });
    }); return found;
  }
  function anchorLine(text, fragment) {
    let anchor; try { anchor = decodeURIComponent(fragment).toLowerCase(); } catch { return null; }
    return headings(text).find(item => item.slug === anchor)?.line || null;
  }
  function relativePath(source, target) {
    const from = source.split('/'); from.pop(); const to = target.split('/');
    while (from.length && to.length && from[0] === to[0]) { from.shift(); to.shift(); }
    const result = [...from.map(() => '..'), ...to].join('/'); return result.startsWith('../') ? result : `./${result}`;
  }
  function rewriteLinks(text, source, oldPath, newPath, files) {
    const lines = text.split(/(?<=\n)/), links = findLinks(text).reverse(); let count = 0;
    for (const link of links) {
      const result = resolveLink(source, link.target, link.type, files); if (result.kind !== 'local' || result.path !== oldPath || link.target.startsWith('#')) continue;
      const suffix = link.target.slice(link.target.search(/[#?]/) < 0 ? link.target.length : link.target.search(/[#?]/));
      let path = relativePath(source, newPath);
      if (link.type === 'wiki' && !/\.(?:md|markdown)$/i.test(link.target.split(/[?#]/)[0])) path = path.replace(/\.(?:md|markdown)$/i, '');
      if (link.type === 'markdown') path = path.split('/').map(encodeURIComponent).join('/');
      const line = lines[link.line - 1], token = line.slice(link.start, link.end);
      let replacement = link.type === 'wiki' ? token.replace(/^(\[\[)[^|\]]+/, (_, prefix) => prefix + path + suffix) : token.replace(/(\]\()[^\s)]+/, (_, prefix) => prefix + path + suffix);
      if (link.type === 'wiki' && !token.includes('|')) replacement = replacement.slice(0, -2) + `|${link.label}]]`;
      lines[link.line - 1] = line.slice(0, link.start) + replacement + line.slice(link.end); count++;
    } return { text: lines.join(''), count };
  }
  function splitSlides(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let first = 0;
    if (lines[0] === '---') {
      const end = lines.indexOf('---', 1);
      if (end > 0 && lines.slice(1, end).some(line => /^[A-Za-z_][\w-]*:\s*/.test(line))) first = end + 1;
    }
    const slides = []; let start = first, fence = null;
    function push(end) {
      const part = lines.slice(start, end);
      if (part.some(line => line.trim())) slides.push({ text: part.join('\n'), startLine: start + 1, endLine: end });
    }
    for (let i = first; i < lines.length; i++) {
      const line = lines[i], marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        continue;
      }
      if (fence) continue;
      if (/^ {0,3}---[ \t]*$/.test(line)) { push(i); start = i + 1; }
      else if (/^#{1,2}\s+/.test(line)) { push(i); start = i; }
    }
    push(lines.length); return slides;
  }
  return { splitSlides, statuses, priorities, parseTicket, setTicketStatus, findTodos, inlineTags, findTags, tagKey, inlineLinks, findLinks, resolveLink, headings, anchorLine, rewriteLinks };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FolioCore;
