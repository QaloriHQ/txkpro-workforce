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

document.querySelectorAll('[data-interest-form]').forEach(form=>{
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const status=form.querySelector('[data-form-status]');const button=form.querySelector('button[type=submit]');
  if(!form.dataset.endpoint){status.textContent='Signup is not available on this deployment yet.';return;}
  if(!form.reportValidity())return;
  const values=new FormData(form);button.disabled=true;status.textContent='Submitting…';
  try{
   const response=await fetch(form.dataset.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({product:form.dataset.product,email:values.get('email'),role:values.get('role'),consent:values.get('consent')==='on',website:values.get('website')}),signal:AbortSignal.timeout(10000)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||'Unable to submit. Please try again.');
   status.textContent='Thank you. Your request has been received. No account has been created.';form.reset();
  }catch(error){status.textContent=error.name==='TimeoutError'?'Connection timed out. Please try again.':error.message||'Unable to submit. Please try again.';}finally{button.disabled=false;}
 });
});
