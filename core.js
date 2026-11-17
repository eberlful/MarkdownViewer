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
      for (const link of inlineLinks(line)) results.push({ ...link, line: index + 1, context: original.trim() });
    });
    return results;
  }
  function resolveLink(source, target, type, files) {
    if (type === 'markdown' && (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('#'))) return { kind: 'external' };
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
  return { statuses, priorities, parseTicket, setTicketStatus, findTodos, inlineLinks, findLinks, resolveLink };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FolioCore;
