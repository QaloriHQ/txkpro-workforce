import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {roles,surveys,surveyInput,bookingInput,allowedResearchOrigin} from '../lib/research/contract.ts';
import {calendarAvailability,createResearchBooking,calendarConfig,selectedDate,slotFromZoho,exchangeAuthorizationCode} from '../lib/research/calendar.ts';
import {emailTemplates,renderEmailPreview} from '../marketing/research/email-preview.mjs';
const id='fbb11aa7-2e94-4be2-9139-801130ed6193';
const config={clientId:'fixture',clientSecret:'fixture-secret',refreshToken:'fixture-refresh',region:'US',workspaceId:'12345678',serviceId:'23456789',staffId:'34567890',emailDisabled:true};
const service={id:config.serviceId,service_type:'APPOINTMENT',duration:'20 mins',buffertime:'10 mins',price:0,assigned_staffs:[config.staffId]};
const now=new Date('2026-10-30T20:00:00Z');
const fake=async(url,init)=>{
 assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
 if(String(url).endsWith('/token'))return json({access_token:'fixture-access',api_domain:'https://www.zohoapis.com'});
 assert.equal(new URL(url).origin,'https://www.zohoapis.com');
 assert.equal(init.headers.Authorization,'Zoho-oauthtoken fixture-access');
 if(new URL(url).pathname.endsWith('/services'))return json({response:{status:'success',returnvalue:{data:[service]}}});
 return json({response:{status:'success',returnvalue:{data:['09:00','09:15','09:30','10:00 AM','16:00'],time_zone:'America/Chicago'}}});
};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

test('all six source surveys preserve seven validated choices and reject invalid roles/options/extra data',()=>{
 for(const role of roles){
  assert.equal(surveys[role].length,7);
  const input={requestId:id,role,answers:Object.fromEntries(surveys[role].map(q=>[q.id,q.options[0]]))};
  assert.equal(surveyInput(input).role,role);
  assert.throws(()=>surveyInput({...input,answers:{...input.answers,extra:'private'}}));
  assert.throws(()=>surveyInput({...input,answers:{...input.answers,[surveys[role][0].id]:'unapproved'}}));
 }
 assert.throws(()=>surveyInput({requestId:id,role:'admin',answers:{}}));
 for(const origin of ['https://txkpro.com','https://workforce.txkpro.com','https://txkpro-workforce-marketing-ab-qaloris-projects.vercel.app'])assert(allowedResearchOrigin(origin));
 for(const origin of ['https://txkpro.com.evil.invalid','https://txkpro-workforce-marketing-ab-otherteam.vercel.app','http://txkpro.com','null'])assert(!allowedResearchOrigin(origin));
 const booking={requestId:id,role:'student',email:'Person@Example.invalid',firstName:'Mark',start:'2026-10-26T14:00:00.000Z',consent:false};
 assert.equal(bookingInput(booking).email,'person@example.invalid');
 for(const change of [{email:'bad'},{consent:'false'},{firstName:'x\nBCC'},{start:'bad'},{requestId:'bad'}])assert.throws(()=>bookingInput({...booking,...change}));
});

test('Zoho dates enforce tomorrow, weekdays and horizon; slots handle DST and source schedule',()=>{
 assert.equal(selectedDate('2026-11-02',now),'2026-11-02');
 for(const day of ['2026-10-30','2026-10-31','2026-11-01','2026-12-02','2026-11-31','bad'])assert.throws(()=>selectedDate(day,now));
 assert.equal(slotFromZoho('2026-11-02','09:00').start,'2026-11-02T15:00:00.000Z');
 assert.equal(slotFromZoho('2026-10-30','09:00 AM').start,'2026-10-30T14:00:00.000Z');
 assert.equal(slotFromZoho('2026-11-02','03:30 PM').start,'2026-11-02T21:30:00.000Z');
 assert.equal(slotFromZoho('2026-11-02','09:15'),null);assert.equal(slotFromZoho('2026-11-02','16:00'),null);
 assert.throws(()=>slotFromZoho('2026-11-02','25:00'));assert.throws(()=>slotFromZoho('2026-11-02','09:90'));
});
test('Zoho availability uses verified service, staff, timezone and provider slots; no Google calls or guessed slots',async()=>{
 assert.equal(calendarConfig({}),null);assert.equal(calendarConfig({ZOHO_BOOKINGS_REGION:'https://attacker.invalid'}),null);
 const result=await calendarAvailability(config,fake,now,'2026-11-02');
 assert.deepEqual(result.slots.map(s=>s.start),['2026-11-02T15:00:00.000Z','2026-11-02T15:30:00.000Z','2026-11-02T16:00:00.000Z']);
 for(const change of [{duration:'30 mins'},{buffertime:'0 mins'},{price:10},{assigned_staffs:[]}])await assert.rejects(calendarAvailability(config,async(u,i)=>String(u).includes('/services')?json({response:{status:'success',returnvalue:{data:[{...service,...change}]}}}):fake(u,i),now),/configuration/);
 await assert.rejects(calendarAvailability(config,async()=>json({access_token:'fixture',api_domain:'https://attacker.invalid'}),now),/unavailable/);
 await assert.rejects(calendarAvailability(config,async(u,i)=>String(u).includes('/availableslots')?json({response:{status:'success',returnvalue:{data:['09:00'],time_zone:'UTC'}}}):fake(u,i),now),/unavailable/);
 await assert.rejects(calendarAvailability(config,async()=>json({response:{status:'failure'}}),now),/unavailable/);
});
test('Zoho booking requires disabled provider emails, verified appointment and exactly one POST on uncertainty',async()=>{
 const input={id,start:'2026-11-02T15:00:00.000Z',end:'2026-11-02T15:20:00.000Z',firstName:'Fixture',email:'fixture@example.invalid'};
 let posts=0;
 const create=async(u,i)=>{
  if(String(u).endsWith('/appointment')){posts++;assert(i.body instanceof FormData);assert.equal(i.body.get('from_time'),'02-Nov-2026 09:00:00');assert.equal(i.body.get('timezone'),'America/Chicago');assert.deepEqual(JSON.parse(i.body.get('customer_details')),{name:input.firstName,email:input.email});assert(i.body.get('notes').includes(id));return json({response:{status:'success',returnvalue:{booking_id:'#TX-0001',service_id:config.serviceId,staff_id:config.staffId,duration:'20 mins',status:'upcoming',time_zone:'America/Chicago',start_time:'02-Nov-2026 09:00:00',end_time:'02-Nov-2026 09:20:00'}}});}
  return fake(u,i);
 };
 assert.equal((await createResearchBooking(config,input,create)).bookingId,'#TX-0001');assert.equal(posts,1);
 await assert.rejects(createResearchBooking({...config,emailDisabled:false},input,()=>{throw Error('must not fetch')}),/configuration/);
 posts=0;await assert.rejects(createResearchBooking(config,input,async(u,i)=>{if(String(u).endsWith('/appointment')){posts++;throw Error('timeout');}return fake(u,i);}));assert.equal(posts,1);
});
test('authorization code exchange sends secrets in POST body to regional allowlist only',async()=>{
 const result=await exchangeAuthorizationCode(config,'fixture-code',async(u,i)=>{assert.equal(u,'https://accounts.zoho.com/oauth/v2/token');assert.equal(i.body.get('grant_type'),'authorization_code');assert.equal(i.body.get('code'),'fixture-code');assert.equal(i.redirect,'error');return json({refresh_token:'fixture-refresh-token',api_domain:'https://www.zohoapis.com'});});
 assert.equal(result.refreshToken,'fixture-refresh-token');
});

test('117 previews resolve placeholders, isolate sample data and link only to owned apex routes',()=>{
 assert.equal(emailTemplates.length,117);const paths=new Set();
 for(const [i,t]of emailTemplates.entries()){
  const value=renderEmailPreview(t,i);assert(value.subject.startsWith('[TEST '));assert(!/\{\{/.test(value.html));
  for(const m of value.html.matchAll(/href="([^"]+)"/g)){const u=new URL(m[1].replaceAll('&amp;','&'));assert.equal(u.origin,'https://txkpro.com');paths.add(u.pathname);}
 }
 assert.deepEqual([...paths].sort(),['/booking','/privacy','/survey','/unsubscribe','/workforce']);
});

test('private research persistence denies public access, prevents duplicate slots, and makes withdrawal durable',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261021183219_marketing_native_intake.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261022005356_marketing_research.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261022024229_marketing_zoho_bookings.sql',import.meta.url),'utf8'));
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const table of ['surveys','bookings','tokens','suppressions'])await assert.rejects(db.query('select * from marketing_research_'+table),/permission denied/);
   for(const table of ['marketing_research_surveys','marketing_research_bookings','marketing_research_tokens','marketing_research_suppressions','marketing_email_preview_deliveries']){
    await assert.rejects(db.query('delete from '+table),/permission denied/);
    await assert.rejects(db.query('insert into '+table+' default values'),/permission denied/);
   }
   await assert.rejects(db.query("select marketing_research_unsubscribe(repeat('a',64))"),/permission denied/);
   await assert.rejects(db.query("select marketing_research_rate_limit(repeat('a',64),60)"),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query("insert into marketing_research_tokens values(repeat('a',64),'fixture@example.invalid','unsubscribe',now(),now()+interval '1 day',null)");
  assert.equal((await db.query("select marketing_research_unsubscribe(repeat('b',64)) as ok")).rows[0].ok,false);
  for(let i=0;i<2;i++)assert.equal((await db.query("select marketing_research_unsubscribe(repeat('a',64)) as ok")).rows[0].ok,true);
  await db.query("select marketing_interest_submit('workforce','fixture@example.invalid','student','fixture',repeat('c',64))");
  assert((await db.query('select withdrawn_at from marketing_interest_entries')).rows[0].withdrawn_at);
  await db.query('update marketing_interest_entries set withdrawn_at=null');
  assert((await db.query('select withdrawn_at from marketing_interest_entries')).rows[0].withdrawn_at);
  const insert="insert into marketing_research_bookings(request_id,request_hash,first_name,email,research_role,start_at,end_at,google_event_id,calendar_token_hash) values($1,repeat('d',64),'Fixture','fixture@example.invalid','student','2026-10-26T14:00:00Z','2026-10-26T14:20:00Z',$2,$2)";
  await db.query(insert,[id,'d'.repeat(64)]);
  await db.query("update marketing_research_bookings set booking_provider='zoho',provider_booking_id='#TX-0001' where request_id=$1",[id]);
  assert.equal((await db.query('select booking_provider from marketing_research_bookings')).rows[0].booking_provider,'zoho');
  await assert.rejects(db.query(insert,['c7edc3e2-9c8e-41a5-8277-2af31cb075d7','e'.repeat(64)]),/unique constraint/);
  for(let i=0;i<3;i++)await db.query("select marketing_research_rate_limit(repeat('f',64),3)");
  await assert.rejects(db.query("select marketing_research_rate_limit(repeat('f',64),3)"),/limit/);
  await db.query("insert into marketing_email_preview_deliveries(batch_id,template_id,source_hash,recipient_hash) values($1,'template-fixture',repeat('a',64),repeat('b',64))",[id]);
  await assert.rejects(db.query("insert into marketing_email_preview_deliveries(batch_id,template_id,source_hash,recipient_hash) values($1,'template-fixture',repeat('a',64),repeat('b',64))",[id]),/unique constraint/);
 }finally{await db.close();}
});
