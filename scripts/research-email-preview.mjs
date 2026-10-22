// Run only with reviewed source and secure server environment. Never logs a recipient or credentials.
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {readTwilioEmailConfig,sendTwilioEmail,getTwilioEmailOperation} from '../lib/email/twilio-email.ts';
import {emailTemplates,renderEmailPreview} from '../marketing/research/email-preview.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const mode=process.argv[2];const batch=process.argv[3];
if(!['--check','--send','--status'].includes(mode)||! /^[a-f0-9-]{36}$/.test(batch||''))throw Error('Use --check|--send|--status <batch UUID>');
const recipient=process.env.TXKPRO_EMAIL_PREVIEW_TO;
if(!recipient||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw Error('Missing approved private test recipient');
const sourceHash=sha(JSON.stringify(emailTemplates));const recipientHash=sha(recipient.trim().toLowerCase());
const config=readTwilioEmailConfig(process.env);if(!config)throw Error('Email transport is not enabled/configured');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const rendered=emailTemplates.map(renderEmailPreview);
const prior=await db.from('marketing_email_preview_deliveries').select('source_hash,recipient_hash').eq('batch_id',batch);
if(prior.error)throw Error('Batch ledger unavailable');
if(prior.data.some(row=>row.source_hash!==sourceHash||row.recipient_hash!==recipientHash))throw Error('Batch source/recipient mismatch');
if(mode!=='--status'){
 const urls=new Set(rendered.flatMap(m=>[...m.html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'))));
 for(const url of urls){
  let destination=url;let response;
  for(let i=0;i<5;i++){
   const u=new URL(destination);if(u.protocol!=='https:'||!['txkpro.com','workforce.txkpro.com'].includes(u.hostname))throw Error('Non-TXKPRO destination');
   response=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(15000),cache:'no-store'});
   if(response.status>=300&&response.status<400){destination=new URL(response.headers.get('location'),u).href;await response.body?.cancel();continue;}break;
  }
  if(response?.status!==200)throw Error('CTA destination is not ready');
  const html=await response.text();
  if(['/survey','/booking','/unsubscribe'].includes(new URL(url).pathname)){
   const api=html.match(/data-research-api="([^"]+)"/)?.[1];
   if(!api||api.includes('staging-'))throw Error('Live native research backend is not active');
   const endpoint=new URL(api,destination);if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.txkpro.com'))throw Error('Unexpected research backend');
   const check=await fetch(endpoint.href+'?action=availability',{headers:{Origin:'https://workforce.txkpro.com'},signal:AbortSignal.timeout(25000),cache:'no-store'});
   if(!check.ok)throw Error('Live calendar readiness is not verified');
   const data=await check.json();if(!Array.isArray(data.slots))throw Error('Live calendar response unavailable');
  }
 }
 console.log(JSON.stringify({preflight:'passed',templates:rendered.length,checkedLinks:urls.size,batch}));
 if(mode==='--check')process.exit(0);
}
if(mode==='--send'){
 for(const [i,template]of emailTemplates.entries()){
  const {error}=await db.from('marketing_email_preview_deliveries').insert({batch_id:batch,template_id:template.template_id,source_hash:sourceHash,recipient_hash:recipientHash});
  if(error){if(error.code==='23505')continue;throw Error('Delivery claim unavailable');}
  const result=await sendTwilioEmail(config,{to:recipient,...rendered[i]});
  const {error:writeError}=await db.from('marketing_email_preview_deliveries').update({outcome:result.ok?'accepted':result.outcome,operation_id:result.ok?result.operationId:null}).eq('batch_id',batch).eq('template_id',template.template_id);
  if(writeError)throw Error('Delivery result unavailable; inspect existing claim before any retry');
  console.log(JSON.stringify({index:i+1,total:emailTemplates.length,outcome:result.outcome,operationId:result.ok?result.operationId:null}));
  if(!result.ok)throw Error('Batch paused; inspect provider evidence before resuming');
  await new Promise(r=>setTimeout(r,500));
 }
}
const {data,error}=await db.from('marketing_email_preview_deliveries').select('template_id,source_hash,recipient_hash,operation_id,outcome').eq('batch_id',batch);
if(error)throw Error('Batch ledger unavailable');
if(data.some(row=>row.source_hash!==sourceHash||row.recipient_hash!==recipientHash))throw Error('Batch source/recipient mismatch');
let delivered=0;let failed=0;
for(const row of data){
 if(!row.operation_id)continue;
 const state=await getTwilioEmailOperation(config,row.operation_id);
 if(!state.ok)continue;
 const {error}=await db.from('marketing_email_preview_deliveries').update({provider_stats:state.stats}).eq('batch_id',batch).eq('template_id',row.template_id);
 if(error)throw Error('Provider status ledger unavailable');
 delivered+=state.stats.delivered||0;failed+=(state.stats.failed||0)+(state.stats.undelivered||0);
}
console.log(JSON.stringify({batch,claimed:data.length,expected:emailTemplates.length,delivered,failed}));
