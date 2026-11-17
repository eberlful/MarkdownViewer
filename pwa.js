'use strict';

// Keep an update waiting until the user can safely reload the current document.
if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(window.location.protocol)) {
  const updateButton = document.getElementById('update-app');
  let registration = null;
  let applying = false;
  let activated = false;

  function showUpdate() { updateButton.hidden = false; updateButton.disabled = false; }
  function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
    });
  }

  updateButton.addEventListener('click', () => {
    if (state.dirty || saveInFlight || (window.GraphitTabs && (window.GraphitTabs.hasDirty() || window.GraphitTabs.hasSaving()))) { toast('Bitte speichere zuerst deine Änderungen, bevor du Graphit aktualisierst.'); return; }
    if (activated) { window.location.reload(); return; }
    const worker = registration && registration.waiting;
    if (!worker) { updateButton.hidden = true; return; }
    applying = true;
    updateButton.disabled = true;
    worker.postMessage('SKIP_WAITING');
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!applying) return;
    applying = false;
    activated = true;
    if (state.dirty || saveInFlight || (window.GraphitTabs && (window.GraphitTabs.hasDirty() || window.GraphitTabs.hasSaving()))) {
      showUpdate();
      toast('Das Update ist bereit. Speichere deine Änderungen und starte Graphit neu.');
      return;
    }
    window.location.reload();
  });

  navigator.serviceWorker.register('./service-worker.js').then(result => {
    registration = result;
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate();
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
  }).catch(error => console.warn('Graphit konnte den Offline-Modus nicht einrichten:', error));
}
