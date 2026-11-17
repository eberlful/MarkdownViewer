'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

test('Ticket lesen und Status ändern, ohne andere Zeilen oder Zeilenenden zu verändern', () => {
  const original = '---\r\ntitle: "Plan: nächster Schritt"\r\ncustom: beibehalten\r\nstatus: offen\r\npriority: hoch\r\n---\r\n\r\n# Beschreibung\r\n- [ ] Arbeit\r\n';
  assert.equal(core.parseTicket(original).title, 'Plan: nächster Schritt');
  assert.equal(core.setTicketStatus(original, 'in_arbeit'), original.replace('status: offen', 'status: in_arbeit'));
});
test('Ungültige oder mehrdeutige Ticket-Header werden nicht verändert', () => {
  for (const text of ['kein Header', '---\ntitle: Test\nstatus: offen\npriority: falsch\n---', '---\ntitle: Test\nstatus: offen\nstatus: erledigt\npriority: mittel\n---']) {
    assert.ok(core.parseTicket(text).error); assert.equal(core.setTicketStatus(text, 'erledigt'), null);
  }
});
test('Sonderzeichen in Titeln und einfache YAML-Werte', () => {
  assert.equal(core.parseTicket("---\ntitle: 'Markus'' Projekt'\nstatus: offen\npriority: mittel\n---").title, "Markus' Projekt");
  assert.ok(core.parseTicket('---\ntitle: Unquoted: invalid\nstatus: offen\npriority: mittel\n---').error);
});
test('Nur offene Aufgaben außerhalb von Codeblöcken finden', () => {
  const text = '- [ ] Offen\n- [x] Fertig\n- Übergeordnet\n    - [ ] Unteraufgabe\n\n```md\n- [ ] Code\n```\n~~~\n- [ ] Auch Code\n~~~\n\n    - [ ] Eingerückter Code\n1. [ ] Nummeriert';
  assert.deepEqual(core.findTodos(text), [{line: 1, text: 'Offen'}, {line: 4, text: 'Unteraufgabe'}, {line: 14, text: 'Nummeriert'}]);
});

test('Markdown- und Wikilinks auflösen, Mehrdeutigkeiten und unsichere Pfade erkennen', () => {
  const files = [{path: 'A/notiz.md'}, {path: 'A/dokumentation/konzept.md'}, {path: 'B/notiz.md'}, {path: 'B/idee mit raum.md'}, {path:'B/gesperrt.md', error:'Kein Zugriff'}];
  assert.equal(core.resolveLink('A/notiz.md', 'dokumentation/konzept.md#ziel', 'markdown', files).path, 'A/dokumentation/konzept.md');
  assert.equal(core.resolveLink('A/notiz.md', '../B/idee%20mit%20raum.md', 'markdown', files).path, 'B/idee mit raum.md');
  assert.equal(core.resolveLink('A/notiz.md', 'konzept', 'wiki', files).path, 'A/dokumentation/konzept.md');
  assert.equal(core.resolveLink('A/notiz.md', 'notiz', 'wiki', files).kind, 'invalid');
  assert.equal(core.resolveLink('A/notiz.md', './notiz', 'wiki', files).path, 'A/notiz.md');
  assert.equal(core.resolveLink('A/notiz.md', '../../ausserhalb.md', 'markdown', files).kind, 'invalid');
  assert.equal(core.resolveLink('A/notiz.md', '../B/gesperrt.md', 'markdown', files).kind, 'invalid');
  assert.equal(core.resolveLink('A/notiz.md', 'https://example.com/a.md', 'markdown', files).kind, 'external');
});
test('Links in Code, Bildern und maskierter Syntax werden ignoriert', () => {
  const input = '[Verweis](../B/notiz.md) und [[konzept|Konzept]]\n`[[code]]` und ![Bild](bild.md) und ![[einbettung]]\n```md\n[[fenced]]\n```\n~~~\n[Code](x.md)\n~~~\n    [[eingezogen]]\n\\[[maskiert]]';
  const links = core.findLinks(input);
  assert.deepEqual(links.map(x => [x.type, x.target, x.line]), [['markdown', '../B/notiz.md', 1], ['wiki', 'konzept', 1]]);
});
test('Verschachtelte Listenlinks erfassen, zitierte Codeblöcke auslassen', () => {
  const links = core.findLinks('- Liste\n    - [[ziel]]\n\n> ```\n> [[code]]\n> ```');
  assert.deepEqual(links.map(link => link.target), ['ziel']);
});

test('Überschriftenanker sind eindeutig und ignorieren Codeblöcke', () => {
  const text = '# Hallo Welt!\n```\n# Versteckt\n```\n## Hallo Welt!\n# Hallo Welt 1\n';
  assert.equal(core.anchorLine(text, 'hallo-welt'), 1);
  assert.equal(core.anchorLine(text, 'hallo-welt-1'), 5);
  assert.equal(core.anchorLine(text, 'versteckt'), null);
  assert.equal(core.resolveLink('p/a.md', '#hallo-welt', 'markdown', []).path, 'p/a.md');
});

test('Linkaktualisierung erhält Beschriftungen, Anker und Code', () => {
  const files = [{ path: 'P/alt.md' }, { path: 'P/quell.md' }];
  const original = '> [Text](alt.md#kapitel) und [[alt#kapitel]]\n`[[alt]]`\n```\n[[alt]]\n```';
  const result = core.rewriteLinks(original, 'P/quell.md', 'P/alt.md', 'P/neu.md', files);
  assert.equal(result.count, 2);
  assert.equal(result.text, '> [Text](./neu.md#kapitel) und [[./neu#kapitel|alt#kapitel]]\n`[[alt]]`\n```\n[[alt]]\n```');
});
