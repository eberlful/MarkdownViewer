'use strict';

(() => {
  const dialog = $('presentation'), content = $('presentation-content'), slide = $('presentation-slide');
  const previous = $('presentation-prev'), next = $('presentation-next'), count = $('presentation-count');
  let slides = [], index = 0, source = '', returnFocus = null, enteredFullscreen = false;

  function render() {
    slide.innerHTML = slides.length ? markdown(slides[index].text, slides[index].startLine - 1) : '<p>Dieses Dokument enthält keinen präsentierbaren Inhalt.</p>';
    if (window.GraphitImages) window.GraphitImages.resolve(slide);
    slide.querySelectorAll('input[type="checkbox"]').forEach(box => { box.disabled = true; });
    count.textContent = slides.length ? `${index + 1} / ${slides.length}` : '0 / 0';
    previous.disabled = index <= 0; next.disabled = index >= slides.length - 1;
    content.scrollTop = 0;
  }
  function move(delta) { const target = Math.max(0, Math.min(slides.length - 1, index + delta)); if (target !== index) { index = target; render(); if (slide.animate && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) slide.animate([{opacity: 0, transform: `translateX(${delta > 0 ? 8 : -8}px)`}, {opacity: 1, transform: 'translateX(0)'}], {duration: 220, easing: 'ease-out'}); } }
  function close() {
    if (!dialog.open) return;
    dialog.close();
    if (document.fullscreenElement === dialog && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    enteredFullscreen = false;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function start() {
    source = editor.value; slides = FolioCore.splitSlides(source); index = 0;
    returnFocus = document.activeElement; render(); dialog.showModal(); content.focus();
    if (dialog.requestFullscreen) {
      try { Promise.resolve(dialog.requestFullscreen()).then(() => { enteredFullscreen = true; if (!dialog.open && document.fullscreenElement === dialog) document.exitFullscreen(); }).catch(() => {}); } catch {}
    }
  }
  $('start-presentation').addEventListener('click', start);
  previous.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));
  $('presentation-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('fullscreenchange', () => { if (enteredFullscreen && document.fullscreenElement !== dialog) close(); });
  window.addEventListener('keydown', event => {
    if (!dialog.open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) { event.stopImmediatePropagation(); return; }
    let delta = 0;
    if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(event.key)) delta = 1;
    if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) delta = -1;
    if (event.key === ' ' && !event.target.closest('button, a, input')) delta = 1;
    if (delta) { event.preventDefault(); event.stopImmediatePropagation(); move(delta); }
  }, true);
  slide.addEventListener('click', event => {
    const tag = event.target.closest('button[data-tag]');
    if (tag) { close(); if (window.GraphitTags) window.GraphitTags.open(tag.dataset.tag); return; }
    const link = event.target.closest('a[data-folio-path]'); if (!link) return;
    event.preventDefault();
    const path = link.dataset.folioPath, anchor = link.dataset.folioAnchor;
    if (path === (state.path || state.name) && anchor) {
      const line = FolioCore.anchorLine(source, anchor);
      const target = slides.findIndex(item => line >= item.startLine && line <= item.endLine);
      if (target >= 0) { index = target; render(); }
      return;
    }
    const file = workspaceFiles().find(item => item.path === path);
    if (file) { close(); const line = anchor ? FolioCore.anchorLine(window.GraphitTabs ? window.GraphitTabs.textFor(file) : file.text, anchor) : null; openProjectFile(file, line); }
  });
})();
