'use strict';

// Keep the theme separate from the existing workspace and view preferences.
(() => {
  const key = 'graphit-theme';
  let selected = null;
  try {
    const value = localStorage.getItem(key);
    if (value === 'light' || value === 'dark') selected = value;
  } catch {}
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let theme = selected || (media ? (media.matches ? 'dark' : 'light') : 'dark');

  function apply() {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1e1e22' : '#f7f7f9');
    const button = document.getElementById('toggle-theme');
    if (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.title = theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren';
    }
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('toggle-theme').addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      selected = theme;
      try { localStorage.setItem(key, theme); } catch {}
      apply();
    });
  });
  if (media && media.addEventListener) media.addEventListener('change', event => {
    if (!selected) { theme = event.matches ? 'dark' : 'light'; apply(); }
  });
})();
