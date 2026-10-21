import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestMgidAd, mgidPublicPage } from '../lib/mgid/native-feed.ts';
const row={Id:'123',category:'108',title:'Useful product',description:'Details',image:'https://imgg-cdn.mgid.com/a.jpg',link:'//www.mgid.com/ghits/123',icon:'https://c.mgid.com/c?private=1',cpc:0.5};
const input={token:'test-only-token',ip:'203.0.113.10',userAgent:'Browser /1 (test)',language:'en-US',page:'https://txkpro.com/community',sourceId:'txkpro.com:in_feed',excludedCategories:[]};
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('real-time fixed feed uses encoded request fields and minimizes result',async()=>{
 let calls=0;
 const fetcher=async(url,init)=>{calls++;assert.equal(url.origin,'https://api-wa.mgid.com');assert.equal(url.pathname,'/2099644');assert.equal(url.searchParams.get('ua'),input.userAgent);assert.equal(url.searchParams.get('cn'),'1');assert.equal(init.headers.Referer,input.page);assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');return response([row]);};
 const ad=await requestMgidAd({...input,fetcher}); assert.equal(ad.creativeId,'123');assert.equal(ad.destinationUrl,'https://www.mgid.com/ghits/123');assert.doesNotMatch(JSON.stringify(ad),/icon|cpc|private|test-only-token/);
 await requestMgidAd({...input,fetcher});assert.equal(calls,2);
});
test('invalid visitors do not call provider',async()=>{let calls=0;for(const patch of [{ip:'bad'},{userAgent:''},{token:''},{userAgent:'x'.repeat(1025)}])assert.equal(await requestMgidAd({...input,...patch,fetcher:async()=>{calls++;return response([row]);}}),null);assert.equal(calls,0);});
test('unsafe creatives, excluded categories and malformed responses fail closed',async()=>{for(const data of [[],{},[row,row],[{...row,link:'javascript:alert(1)'}],[{...row,link:'https://evil.test'}],[{...row,image:'https://127.0.0.1/a'}],[{...row,title:'x'.repeat(201)}]])assert.equal(await requestMgidAd({...input,fetcher:async()=>response(data)}),null);assert.equal(await requestMgidAd({...input,excludedCategories:['108'],fetcher:async()=>response([row])}),null);});
test('provider failure and unbounded bodies return safe no fill',async()=>{for(const fetcher of [async()=>{throw new Error('private');},async()=>new Response('error',{status:429}),async()=>new Response('html'),async()=>response(['x'.repeat(70000)])])assert.equal(await requestMgidAd({...input,fetcher}),null);});
test('only approved same-origin public paths; no query/fragment disclosure',()=>{const req=referer=>new Request('https://txkpro.com/api/ads/delivery',{headers:{referer}});for(const path of ['/student/messages','/groups/private','/student/screening','/admin','/employer/community'])assert.equal(mgidPublicPage(req('https://txkpro.com'+path),null),null);assert.equal(mgidPublicPage(req('https://evil.test/community'),null),null);assert.equal(mgidPublicPage(req('https://txkpro.com/community?private=1#secret'),null),'https://txkpro.com/community');assert.equal(mgidPublicPage(req('https://txkpro.com/community/posts/abc'),'abc'),'https://txkpro.com/community/posts/abc');});
test('fallback preserves direct/context gate, production/filter gates and never invokes icon',()=>{const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');assert.match(read('app/api/ads/delivery/route.ts'),/direct.ad \|\| direct.reason !== "no_fill"/);const server=read('lib/mgid/delivery.ts');assert.match(server,/!config.filtersConfirmed/);assert.match(server,/MGID_PRODUCTION_AUTHORIZED/);assert.match(server,/x-vercel-forwarded-for/);assert.doesNotMatch(server,/headers.get\("x-forwarded-for"/);assert.doesNotMatch(read('components/ads/sponsored-placement.tsx'),/MGID_FEED_TOKEN|\.icon/);});
test('workspace public article placement discloses only its public article URL',()=>{
 const req=referer=>new Request('https://txkpro.com/api/ads/delivery',{headers:{referer}});
 assert.equal(mgidPublicPage(req('https://txkpro.com/student?interview=private#training'),null),'https://txkpro.com/articles');
 assert.equal(mgidPublicPage(req('https://other.test/student'),null),null);
 for(const path of ['/student/profile','/student/points','/student/opportunities','/student/employer-training/secret'])assert.equal(mgidPublicPage(req('https://txkpro.com'+path),null),null);
});
test('no-fill diagnostics distinguish provider failures without leaking response or visitor data',async()=>{
 const cases=[['http_error',async()=>new Response('secret provider body',{status:403})],['empty',async()=>response([])],['invalid_response',async()=>new Response('<html>secret</html>')],['unsafe_url',async()=>response([{...row,image:'https://blocked.example/secret'}])],['network_error',async()=>{throw new Error('token=secret&ip=private');}],['timeout',async()=>{throw new DOMException('private','TimeoutError');}]];
 for(const [outcome,fetcher] of cases){const diagnostics=[];assert.equal(await requestMgidAd({...input,fetcher,onDiagnostic:d=>diagnostics.push(d)}),null);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].outcome,outcome);assert.doesNotMatch(JSON.stringify(diagnostics),/secret|private|test-only-token|203\.0\.113|Browser/);if(outcome==='http_error')assert.equal(diagnostics[0].status,403);}
});
test('valid bounded JSON is accepted even with an upstream text MIME label; non-JSON remains rejected',async()=>{
 const ad=await requestMgidAd({...input,fetcher:async()=>new Response(JSON.stringify([row]),{headers:{'content-type':'text/plain'}})});assert.equal(ad.creativeId,'123');
 assert.equal(await requestMgidAd({...input,fetcher:async()=>new Response('<script>private()</script>',{headers:{'content-type':'text/plain'}})}),null);
});
test('operational logger emits only fixed codes and valid HTTP status',async()=>{
 const {logMgidDiagnostic}=await import('../lib/mgid/diagnostics.ts');const old=console.info;const logged=[];console.info=(...args)=>logged.push(args);
 try{logMgidDiagnostic({outcome:'http_error',status:403,token:'secret',ip:'private',body:'secret response'});logMgidDiagnostic({outcome:'network_error',status:999});}finally{console.info=old;}
 assert.deepEqual(logged,[['mgid_native_delivery',{outcome:'http_error',status:403}],['mgid_native_delivery',{outcome:'network_error'}]]);
});
test('non-rendering provider metadata may be absent or non-numeric without discarding safe ads',async()=>{
 for(const patch of [{Id:undefined,category:undefined},{Id:null,category:null},{Id:'creative.123',category:'IAB5-3'},{Id:123,category:108},{Id:{unexpected:true},category:[]}]){
  const ad=await requestMgidAd({...input,fetcher:async()=>response([{...row,...patch}])});assert.ok(ad);assert.equal(ad.headline,row.title);assert.equal(ad.destinationUrl,'https://www.mgid.com/ghits/123');assert.equal(ad.imageUrl,row.image);
  if(patch.Id===undefined||patch.Id===null||typeof patch.Id==='object')assert.equal(ad.creativeId,null);
 }
});
test('missing metadata never defeats configured local exclusions, required copy or safe URLs',async()=>{
 for(const category of [undefined,null,'IAB5-3','108'])assert.equal(await requestMgidAd({...input,excludedCategories:['108'],fetcher:async()=>response([{...row,category}])}),null);
 for(const patch of [{title:null},{title:''},{description:{}},{link:'https://unsafe.test/ad'},{image:'https://unsafe.test/image'}])assert.equal(await requestMgidAd({...input,fetcher:async()=>response([{...row,Id:null,category:null,...patch}])}),null);
 const diagnostics=[];await requestMgidAd({...input,fetcher:async()=>response([{...row,title:null}]),onDiagnostic:d=>diagnostics.push(d)});assert.deepEqual(diagnostics,[{outcome:'invalid_creative',field:'title'}]);
});
test('documented MGID image proxy and legacy HTTP assets normalize to HTTPS without changing tracking parameters',async()=>{
 const ad=await requestMgidAd({...input,fetcher:async()=>response([{...row,link:'http://www.mgid.com/ghits/123?rid=opaque%2Bvalue',image:'http://imggprx.mgid.com/creative.jpg?size=492x328'}])});
 assert.equal(ad.destinationUrl,'https://www.mgid.com/ghits/123?rid=opaque%2Bvalue');assert.equal(ad.imageUrl,'https://imggprx.mgid.com/creative.jpg?size=492x328');
 for(const image of ['http://imgg-cdn.mgid.com/image.jpg','//imggprx.mgid.com/image.jpg'])assert.ok(await requestMgidAd({...input,fetcher:async()=>response([{...row,image}])}));
 for(const image of ['https://imggprx.mgid.com.evil.test/image','http://127.0.0.1/image','https://user:secret@imggprx.mgid.com/image','https://imggprx.mgid.com:8080/image','javascript:alert(1)'])assert.equal(await requestMgidAd({...input,fetcher:async()=>response([{...row,image}])}),null);
});
test('URL diagnostics identify only field and hostname, and logger excludes paths, secrets and IPs',async()=>{
 const diagnostics=[];await requestMgidAd({...input,fetcher:async()=>response([{...row,image:'https://media.example.com/private?token=secret'}]),onDiagnostic:d=>diagnostics.push(d)});assert.deepEqual(diagnostics,[{outcome:'unsafe_url',field:'image_url',host:'media.example.com'}]);
 const {logMgidDiagnostic}=await import('../lib/mgid/diagnostics.ts');const old=console.info;const logged=[];console.info=(...args)=>logged.push(args);
 try{logMgidDiagnostic(diagnostics[0]);logMgidDiagnostic({outcome:'unsafe_url',field:'click_url',host:'127.0.0.1',url:'https://secret',token:'secret'});}finally{console.info=old;}
 assert.deepEqual(logged,[['mgid_native_delivery',diagnostics[0]],['mgid_native_delivery',{outcome:'unsafe_url',field:'click_url'}]]);assert.doesNotMatch(JSON.stringify(logged),/secret|private|127\.0\.0\.1/);
});
test('real visitor MGID click host is accepted exactly and tracked query is preserved',async()=>{
 for(const link of ['https://clck.mgid.com/ghits/123?rid=opaque%2Bvalue','//clck.mgid.com/ghits/123?rid=opaque%2Bvalue','http://clck.mgid.com/ghits/123?rid=opaque%2Bvalue']){
  const ad=await requestMgidAd({...input,fetcher:async()=>response([{...row,link}])});assert.ok(ad);assert.equal(ad.destinationUrl,'https://clck.mgid.com/ghits/123?rid=opaque%2Bvalue');
 }
 for(const link of ['https://clck.mgid.com.evil.test/ghits/123','https://clck-mgid.com/ghits/123','https://secret@clck.mgid.com/ghits/123','https://clck.mgid.com:8443/ghits/123'])assert.equal(await requestMgidAd({...input,fetcher:async()=>response([{...row,link}])}),null);
});
test('both rejected URL fields are diagnosed in one real request rather than concealing the second failure',async()=>{
 const diagnostics=[];assert.equal(await requestMgidAd({...input,fetcher:async()=>response([{...row,link:'https://click.example.com/secret?token=private',image:'https://media.example.com/secret?token=private'}]),onDiagnostic:d=>diagnostics.push(d)}),null);
 assert.deepEqual(diagnostics,[{outcome:'unsafe_url',field:'click_url',host:'click.example.com'},{outcome:'unsafe_url',field:'image_url',host:'media.example.com'}]);
});
test('complete live provider host pair supports all rendered formats without dropping the creative',async()=>{
 const ad=await requestMgidAd({...input,fetcher:async()=>response([{...row,Id:null,category:null,link:'https://clck.mgid.com/ghits/123?rid=opaque%2Bvalue',image:'https://s-img.mgid.com/gid/creative.jpg'}])});assert.ok(ad);assert.equal(ad.destinationUrl,'https://clck.mgid.com/ghits/123?rid=opaque%2Bvalue');assert.equal(ad.imageUrl,'https://s-img.mgid.com/gid/creative.jpg');
 for(const image of ['https://s-img.mgid.com.evil.test/image.jpg','https://s-img-mgid.com/image.jpg','https://secret@s-img.mgid.com/image.jpg','https://s-img.mgid.com:8080/image.jpg'])assert.equal(await requestMgidAd({...input,fetcher:async()=>response([{...row,image}])}),null);
});
