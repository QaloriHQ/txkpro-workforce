import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { adListEligible } from '../lib/ads/list-policy.ts';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
function load(relative,mocks={}){
 const source=fs.readFileSync(path.join(root,relative),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const compiledModule={exports:{}};
 const resolve=name=>name in mocks?mocks[name]:name==='@/lib/ads/list-policy'?{adListEligible}:name==='next/link'?{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}:name.startsWith('@/')?load(name.slice(2)+(fs.existsSync(path.join(root,name.slice(2)+'.tsx'))?'.tsx':'.ts'),mocks):require(name);
 new Function('require','module','exports',js)(resolve,compiledModule,compiledModule.exports);return compiledModule.exports;
}
const placement=load('components/ads/sponsored-placement.tsx');
test('actual sponsored component renders no unit or fetch placeholder below three; three renders preview',()=>{
 for(const n of [0,1,2,-1,2.5,NaN])assert.equal(renderToStaticMarkup(React.createElement(placement.SponsoredPlacement,{placement:'in_feed',itemCount:n,preview:true})), '');
 assert.match(renderToStaticMarkup(React.createElement(placement.SponsoredPlacement,{placement:'in_feed',itemCount:3,preview:true})),/Sponsored/);
 for(const n of [3,4,200])assert.equal(adListEligible(n),true);
});
test('event and poll galleries insert exactly one unit only for 3+ filtered visible records',()=>{
 const gallery=load('components/community/student-discovery-gallery.tsx',{'@/components/ads/sponsored-placement':{SponsoredPlacement:props=>props.itemCount>=3?React.createElement('aside',{'data-ad':true}):null}});
 const event={title:'Sample',description:'Review',startsAt:'2028-01-01T12:00:00Z',endsAt:'2028-01-01T14:00:00Z',timezone:'America/Chicago',locationType:'physical',status:'published',counts:{going:0,interested:0}};
 const poll={question:'Sample?',status:'open',closesAt:'2028-01-01T12:00:00Z',selectionMode:'single',options:[],totalBallots:0};
 for(const n of [0,1,2,3,6])for(const [Component,item] of [[gallery.StudentEventGallery,event],[gallery.StudentPollGallery,poll]]){
   const html=renderToStaticMarkup(React.createElement(Component,{nowIso:'2026-10-21T00:00:00Z',items:Array.from({length:n},(_,i)=>({...item,id:String(i)}))}));
   assert.equal((html.match(/data-ad="true"/g)||[]).length,n>=3?1:0);
 }
});
test('server verifies three distinct public IDs, expected kind and comments on the actual parent',async()=>{
 const fixtures={a:{found:true,postType:'article',comments:[{id:'c1'},{id:'c2'},{id:'c3'}]},b:{found:true,postType:'article'},c:{found:true,postType:'article'},private:{found:false}};
 const {publicAdListContext}=load('lib/ads/list-context.ts',{'server-only':{},'@/lib/community/public-repository':{publicCommunityPost:async id=>fixtures[id]||{found:false}},'@/lib/community/public-group-context':{publicGroupPostIds:async ids=>ids.filter(id=>id!=='private-group')}});
 assert.equal(await publicAdListContext('articles',['a','b','c'],null),true);
 for(const ids of [['a','b'],['a','a','b'],['a','b','private'],['a','b','private-group']])assert.equal(await publicAdListContext('posts',ids,null),false);
 assert.equal(await publicAdListContext('events',['a','b','c'],null),false);
 assert.equal(await publicAdListContext('comments',['c1','c2','c3'],'a'),true);
 assert.equal(await publicAdListContext('comments',['c1','c2','other'],'a'),false);
 assert.equal(await publicAdListContext('comments',['c1','c2','c3'],null),false);
});
test('delivery route refuses insufficient context before invoking any selector/provider',async()=>{
 let calls=0;const route=load('app/api/ads/delivery/route.ts',{'@/lib/ads/list-context':{publicAdListContext:async()=>false},'@/lib/ads/delivery-repository':{selectNativeAd:async()=>{calls++;return{ad:null,reason:'no_fill'};}},'@/lib/mgid/delivery':{selectMgidAd:async()=>{calls++;return null;}}});
 const old=process.env.ADS_DELIVERY_ENABLED;process.env.ADS_DELIVERY_ENABLED='true';
 try{for(const n of [0,1,2,3]){const response=await route.GET(new Request('https://txkpro.com/api/ads/delivery?'+new URLSearchParams({placement:'in_feed',requestKey:'00000000-0000-4000-8000-000000000001',itemCount:String(n),listKind:'posts',listIds:JSON.stringify(['a','b','c'])})));assert.equal((await response.json()).reason,'invalid_context');}assert.equal(calls,0);}finally{if(old===undefined)delete process.env.ADS_DELIVERY_ENABLED;else process.env.ADS_DELIVERY_ENABLED=old;}
});
test('public group context rejects private, inactive and failed lookups without disclosing them',async()=>{
 let fail=false;
 const from=table=>{
  const query={select(){return this;},in(){return this;},eq(){return this;},then(resolve){return Promise.resolve(resolve(fail?{error:new Error('unavailable')}:{data:table==='wf_community_post_audiences'?[{profile_post_id:'a',group_id:'public'},{profile_post_id:'b',group_id:'private'}]:[{group_id:'public'}]}));}};return query;
 };
 const {publicGroupPostIds}=load('lib/community/public-group-context.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>({from})}});
 assert.deepEqual(await publicGroupPostIds(['a','b','ungrouped']),['a','ungrouped']);fail=true;assert.deepEqual(await publicGroupPostIds(['a']),[]);
});

test('all native layouts identify ads with the same Sponsored pill and support image/text variants',()=>{
 const cases=[['in_feed','posts','feed','community-post'],['in_feed','events','events','student-discovery-card'],['in_feed','polls','polls','student-discovery-card'],['in_article','articles','articles','student-discovery-card'],['in_comments','comments','comments','community-comment'],['multiplex','posts','sidebar','community-card']];
 for(const [unit,listKind,layout,cardClass] of cases)for(const previewMedia of ['image','text']){
   const html=renderToStaticMarkup(React.createElement(placement.SponsoredPlacement,{placement:unit,listKind,itemCount:3,preview:true,previewMedia}));
   assert.match(html,new RegExp('data-ad-layout="'+layout+'"'));
   assert.match(html,new RegExp(cardClass));assert.match(html,/class="sponsored-badge">Sponsored<\/span>/);
   assert.equal((html.match(/<img/g)||[]).length,previewMedia==='image'?1:0);
   if(layout==='comments'){assert.match(html,/sponsored-comment-body/);assert.match(html,/sponsored-media-comments|sponsored-comment-copy/);assert.doesNotMatch(html,/<h2/);}
 }
});
test('normalized MGID creative uses each layout without fabricated member actions or tracking pixels',()=>{
 const renderer=load('components/ads/native-ad-presentation.tsx');
 const ad={provider:'mgid',advertiserName:'Example advertiser',headline:'Provider headline',body:'Provider description',imageUrl:'https://imgg-cdn.mgid.com/example.jpg',imageAlt:'',destinationUrl:'https://www.mgid.com/ghits/example',ctaLabel:'Learn more'};
 for(const layout of ['feed','events','polls','articles','comments','sidebar']){const html=renderToStaticMarkup(React.createElement(renderer.NativeAdPresentation,{ad,layout,preview:false,onClick:()=>{}}));assert.match(html,/Sponsored<\/span>/);assert.match(html,/Provider headline/);assert.match(html,/rel="noopener noreferrer sponsored"/);assert.match(html,/imgg-cdn.mgid.com/);assert.doesNotMatch(html,/c.mgid.com|RSVP|Vote now|likes|Reply/);}
});

test('Student ad testing is restricted to active canonical Students on staging previews',()=>{
 const {stagingStudentAdTesting:enabled}=load('lib/ads/test-mode.ts');
 const staging={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'staging'};
 assert.equal(enabled(staging,'student','active'),true);
 for(const [env,role,status] of [[{...staging,VERCEL_ENV:'production'},'student','active'],[{...staging,VERCEL_GIT_COMMIT_REF:'feature'},'student','active'],[staging,'admin','active'],[staging,'student','inactive'],[staging,null,'active']])assert.equal(enabled(env,role,status),false);
});
test('actual Student surfaces render image samples with the same threshold and disabled provider actions',()=>{
 const mocks={'next/navigation':{usePathname:()=>'/student/community'},react:{...React,useState:()=>['image',()=>{}]}};
 const testing=load('components/ads/student-ad-testing.tsx',mocks);
 const sponsored=load('components/ads/sponsored-placement.tsx',{'@/components/ads/student-ad-testing':testing});
 const render=(enabled,n)=>renderToStaticMarkup(React.createElement(testing.StudentAdTesting,{enabled},React.createElement(sponsored.SponsoredPlacement,{placement:'in_comments',listKind:'comments',itemCount:n})));
 const sample=render(true,3);assert.match(sample,/Staging ad testing/);assert.match(sample,/sponsored-badge">Sponsored/);assert.match(sample,/sample-creative.svg/);assert.match(sample,/Preview/);assert.match(sample,/disabled=""/);assert.match(sample,/Sample comments/);
 assert.doesNotMatch(render(true,2),/sponsored-badge/);assert.doesNotMatch(render(false,3),/Staging ad testing|sample-creative.svg|sponsored-badge/);
 const privateTesting=load('components/ads/student-ad-testing.tsx',{'next/navigation':{usePathname:()=>'/student/messages'}});
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(privateTesting.StudentAdTesting,{enabled:true},'Private content')),/Staging ad testing/);
});
test('Student workspace uses public articles and the existing Admin preview keeps its role gate',()=>{
 const workspace=fs.readFileSync(path.join(root,'app/student/page.tsx'),'utf8');assert.match(workspace,/adTesting \? listPublicArticles\(\) : Promise.resolve\(\[\]\)/);assert.match(workspace,/<ArticleGallery items=\{articles\}/);
 assert.match(fs.readFileSync(path.join(root,'app/admin/ads/preview/page.tsx'),'utf8'),/requireRole\(\["admin"\]\)/);
});
test('Student display selection switches between text samples and live placeholders',()=>{
 for(const mode of ['text','live']){
  const testing=load('components/ads/student-ad-testing.tsx',{'next/navigation':{usePathname:()=>'/student'},react:{...React,useState:()=>[mode,()=>{}]}});
  const sponsored=load('components/ads/sponsored-placement.tsx',{'@/components/ads/student-ad-testing':testing});
  const html=renderToStaticMarkup(React.createElement(testing.StudentAdTesting,{enabled:true},React.createElement(sponsored.SponsoredPlacement,{placement:'in_article',listKind:'articles',itemCount:3})));
  assert.doesNotMatch(html,/sample-creative.svg/);
  if(mode==='text'){assert.match(html,/sponsored-badge/);assert.match(html,/Preview/);}else{assert.doesNotMatch(html,/sponsored-badge|Preview/);assert.match(html,/Normal tracking applies/);}
 }
});

test('new Student sessions default to live and every eligible mount fetches fresh inventory before viewability',async()=>{
 const testing=load('components/ads/student-ad-testing.tsx',{'next/navigation':{usePathname:()=>'/student/community'}});
 const ssr=renderToStaticMarkup(React.createElement(testing.StudentAdTesting,{enabled:true},'list'));
 assert.match(ssr,/Live inventory: provider ads/);assert.doesNotMatch(ssr,/Sample ads: no provider/);
 const effects=[];const calls=[];const old=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return {ok:true,json:async()=>({ad:null})};};
 try{
  const component=load('components/ads/sponsored-placement.tsx',{'@/components/ads/student-ad-testing':{useAdTestMode:()=> 'live'},react:{...React,useEffect:callback=>effects.push(callback)}});
  for(let session=0;session<2;session++){
   renderToStaticMarkup(React.createElement(component.SponsoredPlacement,{placement:'in_feed',itemCount:3,listItemIds:['a','b','c']}));
   const delivery=effects.splice(0);for(const run of delivery)run();
  }
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);assert.notEqual(new URL(calls[0].url,'https://local.test').searchParams.get('requestKey'),new URL(calls[1].url,'https://local.test').searchParams.get('requestKey'));
  for(const call of calls){assert.equal(call.init.cache,'no-store');assert.match(call.url,/itemCount=3/);assert.doesNotMatch(call.url,/events|report/);}
  renderToStaticMarkup(React.createElement(component.SponsoredPlacement,{placement:'in_feed',itemCount:2}));assert.equal(effects.length,0);
  renderToStaticMarkup(React.createElement(component.SponsoredPlacement,{placement:'in_feed',itemCount:3,preview:true}));for(const run of effects.splice(0))run();assert.equal(calls.length,2);
 }finally{globalThis.fetch=old;}
});
