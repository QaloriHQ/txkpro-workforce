// Release integrity checks: broken navigation, discovery files, legal preservation, and private indexing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sites, APP_URL, MARKETPLACE_JOIN } from './shared/content.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const encode = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sellerFile=fs.readFileSync(path.join(root,'../public/ads.txt'),'utf8');
assert.equal(sellerFile.trim().split('\n').length,20);
assert.match(sellerFile,/^mgid\.com, 997582, DIRECT, d4c29acad76ce94f$/m);
let linksChecked=0,pagesChecked=0;
for (const [name,site] of Object.entries(sites)) {
 const out=path.join(root,name,'dist');
 const config=JSON.parse(fs.readFileSync(path.join(root,name,'vercel.json'),'utf8'));
 assert.deepEqual(Object.fromEntries(config.redirects.map(x=>[x.source,x.destination])),site.aliases,'Redirect manifest drift');
 assert.equal(fs.readFileSync(path.join(out,'ads.txt'),'utf8'),sellerFile);
 const sitemap=fs.readFileSync(path.join(out,'sitemap.xml'),'utf8');

 for (const m of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
  const url=new URL(m[1]);assert.equal(url.origin,site.domain);
  assert(!/^\/(student|admin|login)(\/|$)/.test(url.pathname));assert.equal(url.search,'');
  assert(fs.existsSync(path.join(out,url.pathname==='/'?'index.html':`${url.pathname.slice(1)}.html`)),`Missing sitemap page ${url}`);
 }
 const robots=fs.readFileSync(path.join(out,'robots.txt'),'utf8');
 const indexing=process.env.VERCEL_ENV==='production'&&process.env.MARKETING_PRODUCTION_INDEXING==='true';
 assert(robots.includes(indexing?'Allow: /':'Disallow: /'));
 const guide=fs.readFileSync(path.join(out,'llms.txt'),'utf8');
 assert(guide.startsWith(`# ${site.name}`));assert(!guide.includes('token='));
 for (const file of fs.readdirSync(out).filter(x=>x.endsWith('.html'))) {
  const html=fs.readFileSync(path.join(out,file),'utf8');pagesChecked++;
  assert(!/script\.google|googleusercontent|google\.script|<iframe/.test(html),'Deprecated runtime link or embed');
  assert.equal((html.match(/<h1[\s>]/g)||[]).length,1,`${name}/${file}: expected one H1`);
  assert.match(html,/<html lang="en">/);assert.match(html,/<title>[^<]+<\/title>/);
  assert.match(html,/<meta name="description" content="[^"]+">/);
  assert.match(html,/<link rel="canonical" href="https:\/\//);
  const research=(name==='workforce'&&['survey.html','booking.html','unsubscribe.html'].includes(file))||(name==='marketplace'&&file==='booking.html');
  assert(html.includes(`content="${indexing&&file!=='404.html'&&!research?'index, follow':'noindex, follow'}"`));
  if(research){assert(!sitemap.includes('/'+file.replace('.html','')+'</loc>'));assert(html.includes('data-research-form'));assert(html.includes('name="referrer" content="no-referrer"'));}
  assert(!/google\.script\.run|[✓↗→↑]/.test(html),`${file}: copied unsupported interaction or icon substitute`);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
   const href=m[1].replaceAll('&amp;','&');
   if (!href.startsWith('/')&&!href.startsWith('#')) continue;
   const url=new URL(href,site.domain+'/'+file);linksChecked++;
   const local=url.pathname;
   const target=local==='/'?'index.html':path.extname(local)?local.slice(1):`${local.slice(1)}.html`;
   assert(fs.existsSync(path.join(out,target)),`${name}/${file}: missing ${href}`);
   if (url.hash) {
    const destination=fs.readFileSync(path.join(out,target),'utf8');assert(destination.includes(`id="${url.hash.slice(1)}"`),`Missing fragment ${href}`);
   }
  }
 }
 for(const slug of ['privacy','terms']) {
  const html=fs.readFileSync(path.join(out,slug+'.html'),'utf8');
  assert(html.includes('Qalori, LLC dba TXKPRO'));
  const text=fs.readFileSync(path.join(root,'shared',slug+'.txt'),'utf8');
  for (const line of text.trim().split('\n')) assert(html.includes(encode(line)),`${name}: legal text omitted`);
 }
 if(name==='marketplace')assert(site.cta[1]===MARKETPLACE_JOIN && (MARKETPLACE_JOIN==='/waitlist'||MARKETPLACE_JOIN===APP_URL));
 if(name==='marketplace'){
  assert(!config.redirects.some(rule=>rule.source==='/booking'),'Booking must stay on the apex');
  assert(!config.rewrites?.some(rule=>rule.source==='/booking'),'Booking must be served locally');
  const booking=fs.readFileSync(path.join(out,'booking.html'),'utf8');
  assert(booking.includes('<link rel="canonical" href="https://txkpro.com/booking">'));
  assert(booking.includes('data-research-api="'+(process.env.MARKETING_RESEARCH_ENABLED==='true'?'/api/research':'')+'"'));
  assert(!/zohobookings\.com|http-equiv="refresh"|<iframe/.test(booking));
  assert(config.headers.find(rule=>rule.source==='/(.*)').headers.find(h=>h.key==='Content-Security-Policy').value.includes("connect-src 'self'"));
 }
 console.log(`${name}: redirects, ads.txt, sitemap, indexing, links, legal preservation PASS`);
}
console.log(`PASS: ${pagesChecked} pages, ${linksChecked} internal links/assets/fragments checked.`);
