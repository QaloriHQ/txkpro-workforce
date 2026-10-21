import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sites, legacyWorkforceAnchors } from './shared/content.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(root);
const targets = process.argv[2] ? [process.argv[2]] : Object.keys(sites);
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 menu:'<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>',
 theme:'<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"/>'
};
const icon = name => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${icons[name]}</svg>`;
const logo = label => `<a class="brand" href="/" aria-label="TXKPRO ${escape(label)} home"><img class="logo-light" src="/assets/logo-light.svg" width="122" height="30" alt="TXKPRO"><img class="logo-dark" src="/assets/logo-dark.svg" width="122" height="30" alt="TXKPRO"><span>${escape(label)}</span></a>`;
const link = ([text,href],current) => `<a href="${escape(href)}"${href===current?' aria-current="page"':''}>${escape(text)}</a>`;
const publicIndexing = process.env.VERCEL_ENV === 'production' && process.env.MARKETING_PRODUCTION_INDEXING === 'true';
for (const target of targets) {
 const site=sites[target];
 if (!site) throw new Error(`Unknown site: ${target}`);
 const out=path.join(root,target,'dist');
 fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(path.join(out,'assets'),{recursive:true});
 for (const filename of ['site.css','site.js','HEROICONS-LICENSE.txt']) fs.copyFileSync(path.join(root,'shared',filename),path.join(out,'assets',filename));
 for (const theme of ['light','dark']) fs.copyFileSync(path.join(repo,'public',`txkpro-logo-${theme}.svg`),path.join(out,'assets',`logo-${theme}.svg`));
 fs.copyFileSync(path.join(repo,'public','favicon.ico'),path.join(out,'favicon.ico'));
 fs.copyFileSync(path.join(repo,'public','ads.txt'),path.join(out,'ads.txt'));
 const pages=[...site.pages];
 for (const [slug,title] of [['privacy','Privacy Policy'],['terms','Terms of Service']]) {
  const original=fs.readFileSync(path.join(root,'shared',`${slug}.txt`),'utf8');
  // Preserve the currently published legal text and dates, with the approved entity attribution (#199).
  const paragraphs=original.trim().split('\n').map(line=>/^\d+\. [A-Z][A-Z '’/&-]+$/.test(line)?`<h2>${escape(line)}</h2>`:`<p>${escape(line)}</p>`).join('\n');
  pages.push({path:`/${slug}`,title,description:`${title} for TXKPRO services.`,heading:title,intro:'Qalori, LLC dba TXKPRO',body:`<div class="shell"><article class="prose legal">${target!=='workforce'?'<div class="notice">Current availability: Marketplace is a waitlist. Service requests, contractor onboarding, estimates, jobs, and payments are planned and are not currently available.</div>':'<div class="notice">Current availability: Workforce is implemented in staging and undergoing testing. Access is coordinated by TXKPRO; a general production launch is not announced here.</div>'}${paragraphs}</article></div>`});
 }
 const render = (page,notFound=false) => {
  const pageTitle = `${page.title} | ${site.name}`;
  const metaIndex = publicIndexing && !notFound ? 'index, follow' : 'noindex, follow';
  return `<!doctype html>
<!-- TXKPRO UI BUILD GATE: approved logos; official Heroicons; semantic tokens; responsive layouts; explicit sample provenance. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(page.description)}"><meta name="robots" content="${metaIndex}"><meta name="theme-color" content="#1173d4"><title>${escape(pageTitle)}</title><link rel="canonical" href="${site.domain}${page.path}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(pageTitle)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${site.domain}${page.path}"><meta property="og:site_name" content="${site.name}"><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" defer></script></head><body>
<a class="skip" href="#main">Skip to content</a><header class="header"><div class="shell nav">${logo(site.label)}<nav class="links" aria-label="Primary navigation">${site.nav.map(x=>link(x,page.path)).join('')}</nav><div class="actions"><button class="icon-button" type="button" data-theme-toggle aria-label="Change color theme">${icon('theme')}</button><a class="button small blue" href="${site.cta[1]}">${site.cta[0]}</a><button class="icon-button menu-toggle" type="button" data-menu-toggle aria-label="Toggle navigation" aria-controls="mobile-navigation" aria-expanded="false">${icon('menu')}</button></div></div><nav id="mobile-navigation" class="mobile-menu" aria-label="Mobile navigation">${site.nav.map(x=>link(x,page.path)).join('')}${link(site.cta,page.path)}</nav></header>
<main id="main">${page.heading?`<div class="shell"><section class="page-hero"><p class="eyebrow">${site.name}</p><h1>${page.heading}</h1><p class="lede">${escape(page.intro)}</p></section></div>`:''}${page.body}${target==='workforce'&&page.path==='/'?`<section class="section soft"><div class="shell"><p class="kicker">Explore the program</p><h2>Find your next step.</h2><div class="cards">${legacyWorkforceAnchors.map(([id,href])=>`<a class="card" id="${id}" href="${href}">${id==='booking'?'Contact about interviews':id==='updates'?'Program updates':id==='survey'?'Contact about research':id==='how-it-works'?'How it works':id.charAt(0).toUpperCase()+id.slice(1)}</a>`).join('')}</div></div></section>`:''}</main>
<footer class="footer"><div class="shell"><div class="footer-grid"><div>${logo(site.label)}<p>${escape(site.description)}</p></div>${site.footerGroups.map(([title,links])=>`<div><h3>${escape(title)}</h3><ul>${links.map(x=>`<li>${link(x,page.path)}</li>`).join('')}</ul></div>`).join('')}</div><div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} Qalori, LLC dba TXKPRO. Greater Texarkana.</span><div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/llms.txt">llms.txt</a><a href="/sitemap.xml">Sitemap</a></div></div></div></footer></body></html>\n`;
 };
 for (const page of pages) {
  const file=path.join(out,page.path==='/'?'index.html':`${page.path.slice(1)}.html`);
  fs.writeFileSync(file,render(page));
 }
 fs.writeFileSync(path.join(out,'404.html'),render({path:'/404',title:'Page not found',description:'Find your way back to TXKPRO.',heading:'Let’s get you back on track.',intro:'This page could not be found.',body:'<section class="section"><div class="shell"><a class="button blue" href="/">Return home</a></div></section>'},true));
 fs.writeFileSync(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p=>`<url><loc>${site.domain}${p.path}</loc></url>`).join('\n')}\n</urlset>\n`);
 fs.writeFileSync(path.join(out,'robots.txt'),publicIndexing?`User-agent: *\nAllow: /\nSitemap: ${site.domain}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');
 fs.writeFileSync(path.join(out,'llms.txt'),`# ${site.name}\n\n> ${site.description}\n\nOperated by Qalori, LLC dba TXKPRO. Geography: Greater Texarkana.\n${target==='workforce'?'The Workforce application is built in staging and undergoing testing. Production launch is not announced. Access and pilots are coordinated by TXKPRO. Self-reported, institution-verified, and employer-specific evidence remain distinct; there is no guarantee of employment.':'The Marketplace application is not built yet. The current build offers a waitlist; https://app.txkpro.com is its intended address after domain cutover. Service requests, contractor onboarding, estimates, jobs, and payments are planned, not available features.'}\n\n## Public pages\n${pages.map(p=>`- [${p.title}](${site.domain}${p.path}): ${p.description}`).join('\n')}\n\n## Boundaries\nPublic marketing information only. Research submissions, private account data, personalized research links, learner records, and application workspaces are not included in this guide or sitemap.\n`);
 console.log(`${target}: ${pages.length} pages → ${out}; production indexing ${publicIndexing?'enabled':'disabled'}`);
}
