(() => {
  const root = document.documentElement;
  let saved;
  try { saved = localStorage.getItem('txkpro-marketing-theme'); } catch {}
  root.dataset.theme = saved === 'dark' || saved === 'light' ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = document.querySelector('[data-theme-toggle]');
  const updateTheme = () => { if (theme) theme.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Use light theme' : 'Use dark theme'); };
  updateTheme();
  theme?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('txkpro-marketing-theme', root.dataset.theme); } catch {}
    updateTheme();
  });
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('#mobile-navigation');
  const close = () => { menu?.classList.remove('open'); toggle?.setAttribute('aria-expanded', 'false'); };
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open)); menu?.classList.toggle('open', open);
  });
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { close(); toggle.focus(); } });
  matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) close(); });
})();
