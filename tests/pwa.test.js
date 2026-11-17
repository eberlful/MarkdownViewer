'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function setupWorker() {
  const handlers = {}, stores = new Map(), deleted = [];
  const scope = 'https://example.test/folio/';
  const cache = {
    async addAll(paths) { for (const item of paths) this.entries.set(new URL(item, scope).href, `cached:${item}`); },
    async match(url) { return this.entries.get(url); },
    entries: new Map()
  };
  const caches = {
    async open(name) { if (!stores.has(name)) stores.set(name, cache); return stores.get(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { deleted.push(name); stores.delete(name); }
  };
  const self = { registration: { scope }, addEventListener(type, cb) { handlers[type] = cb; }, skipWaiting() { self.skipped = true; } };
  const context = vm.createContext({ URL, self, caches, fetch: async request => `network:${request.url}` });
  vm.runInContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), context);
  async function lifecycle(type) { let task; handlers[type]({ waitUntil(promise) { task = promise; } }); await task; }
  async function request(url, mode = 'cors', method = 'GET') {
    let response; handlers.fetch({ request: { url, mode, method }, respondWith(promise) { response = promise; } });
    return response === undefined ? undefined : await response;
  }
  return { context, handlers, stores, deleted, cache, self, scope, lifecycle, request };
}

test('Manifest beschreibt installierbare App und passende Symbole', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.display, 'standalone');
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
    const icon = manifest.icons.find(item => item.sizes === `${size}x${size}` && item.purpose === purpose);
    assert.ok(icon); const data = fs.readFileSync(path.join(root, icon.src));
    assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /src="pwa\.js"/);
});

test('Service Worker hält nur die App-Dateien offline bereit, auch unter einem Unterpfad', async () => {
  const worker = setupWorker(); await worker.lifecycle('install');
  for (const url of worker.cache.entries.keys()) {
    const relative = new URL(url).pathname.replace('/folio/', '');
    assert.ok(fs.existsSync(path.join(root, relative || 'index.html')), `${url} fehlt`);
  }
  assert.equal(await worker.request('https://example.test/folio/?view=test', 'navigate'), 'cached:./index.html');
  assert.equal(await worker.request('https://example.test/folio/app.js'), 'cached:./app.js');
  assert.equal(await worker.request('https://example.test/folio/user-note.md'), undefined);
  assert.equal(await worker.request('https://another.test/folio/app.js'), undefined);
  assert.equal(await worker.request('https://example.test/folio/app.js', 'cors', 'POST'), undefined);
});

test('Updates löschen nur eigene veraltete Caches und aktivieren sich nur auf ausdrückliche Nachricht', async () => {
  const worker = setupWorker(); await worker.lifecycle('install');
  const name = [...worker.stores.keys()][0]; const prefix = name.slice(0, -2);
  worker.stores.set(prefix + 'v0', {}); worker.stores.set('andere-app', {});
  await worker.lifecycle('activate');
  assert.ok(worker.stores.has(name)); assert.ok(worker.stores.has('andere-app')); assert.ok(!worker.stores.has(prefix + 'v0'));
  worker.handlers.message({ data: 'unrelated' }); assert.equal(worker.self.skipped, undefined);
  worker.handlers.message({ data: 'SKIP_WAITING' }); assert.equal(worker.self.skipped, true);
});

function setupRegistration(dirty = false) {
  const handlers = {}, serviceHandlers = {}, workerMessages = [], notifications = [];
  const button = { hidden: true, disabled: false, addEventListener(type, cb) { handlers[type] = cb; } };
  const waiting = { postMessage(message) { workerMessages.push(message); } };
  const registration = { waiting, addEventListener() {} };
  const serviceWorker = { controller: {}, addEventListener(type, cb) { serviceHandlers[type] = cb; }, async register() { return registration; } };
  const state = { dirty }; const location = { protocol: 'http:', reload() { location.reloaded = true; } };
  const context = { navigator: { serviceWorker }, window: { isSecureContext: true, location }, document: { getElementById() { return button; } }, state, saveInFlight: null, toast(message) { notifications.push(message); }, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pwa.js'), 'utf8'), context);
  return { handlers, serviceHandlers, state, button, location, workerMessages, notifications };
}

test('Update schützt ungespeicherte Änderungen auch während der Aktivierung', async () => {
  const app = setupRegistration(true); await Promise.resolve();
  assert.equal(app.button.hidden, false);
  app.handlers.click(); assert.equal(app.workerMessages.length, 0); assert.match(app.notifications[0], /speichere/i);
  app.state.dirty = false; app.handlers.click(); assert.deepEqual(app.workerMessages, ['SKIP_WAITING']);
  app.state.dirty = true; app.serviceHandlers.controllerchange(); assert.equal(app.location.reloaded, undefined);
  assert.equal(app.button.hidden, false);
  app.state.dirty = false; app.handlers.click(); assert.equal(app.location.reloaded, true);
});
