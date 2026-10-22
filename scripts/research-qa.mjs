import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {roles,surveys,surveyInput,bookingInput,allowedResearchOrigin} from '../lib/research/contract.ts';
import {availableSlots,calendarAvailability,createResearchEvent,calendarConfig} from '../lib/research/calendar.ts';
import {emailTemplates,renderEmailPreview} from '../marketing/research/email-preview.mjs';
const id='fbb11aa7-2e94-4be2-9139-801130ed6193';
const config={clientId:'fixture',clientSecret:'fixture-secret',refreshToken:'fixture-refresh',calendarId:'interviews',busyCalendarIds:['interviews','primary']};
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

test('Chicago schedule handles weekends, DST, 20 minute slots, and 10 minute busy buffers',()=>{
 const now=new Date('2026-10-30T20:00:00Z');
 const slots=availableSlots([],now);
 assert(slots.length>0);assert(slots[0].start.startsWith('2026-11-02T15:00:00'));
 assert.equal(Date.parse(slots[0].end)-Date.parse(slots[0].start),20*60000);
 const blocked=availableSlots([{start:'2026-11-02T15:00:00Z',end:'2026-11-02T15:25:00Z'}],now);
 assert(!blocked.some(s=>s.start==='2026-11-02T15:30:00.000Z'));
 assert(blocked.some(s=>s.start==='2026-11-02T16:00:00.000Z'));
 for(const s of slots){const local=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',hourCycle:'h23'}).format(s.start?new Date(s.start):now);assert(!/Sat|Sun/.test(local));}
});

test('missing calendar access never produces guessed slots; both calendars must succeed',async()=>{
 assert.equal(calendarConfig({}),null);
 let calls=0;
 const fetcher=async(url,init)=>{
  calls++;assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
  if(String(url).startsWith('https://oauth2.googleapis.com'))return json({access_token:'fixture-access'});
  assert.equal(url,'https://www.googleapis.com/calendar/v3/freeBusy');
  assert.deepEqual(JSON.parse(init.body).items,[{id:'interviews'},{id:'primary'}]);
  return json({calendars:{interviews:{busy:[]},primary:{busy:[]}}});
 };
 assert((await calendarAvailability(config,fetcher,new Date('2026-10-21T15:00:00Z'))).slots.length>0);assert.equal(calls,2);
 await assert.rejects(calendarAvailability(config,async url=>String(url).includes('/token')?json({access_token:'fixture'}):json({calendars:{interviews:{busy:[]},primary:{errors:[{reason:'forbidden'}]}}})),/unavailable/);
});

test('Google event insert suppresses Google mail, has no attendees, and recovers deterministic duplicate IDs',async()=>{
 const input={id:'a'.repeat(64),start:'2026-10-26T14:00:00.000Z',end:'2026-10-26T14:20:00.000Z',firstName:'Fixture'};
 const event={id:input.id,start:{dateTime:input.start},end:{dateTime:input.end},status:'confirmed'};
 const result=await createResearchEvent(config,input,async(url,init)=>{
  assert.equal(init.redirect,'error');
  if(String(url).endsWith('/token'))return json({access_token:'fixture'});
  if(init.method==='POST'){
   assert(String(url).endsWith('?sendUpdates=none'));assert.equal(JSON.parse(init.body).attendees,undefined);return json({},409);
  }
  assert(String(url).endsWith('/'+input.id));return json(event);
 });
 assert.equal(result.eventId,input.id);
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
  await assert.rejects(db.query(insert,['c7edc3e2-9c8e-41a5-8277-2af31cb075d7','e'.repeat(64)]),/unique constraint/);
  for(let i=0;i<3;i++)await db.query("select marketing_research_rate_limit(repeat('f',64),3)");
  await assert.rejects(db.query("select marketing_research_rate_limit(repeat('f',64),3)"),/limit/);
  await db.query("insert into marketing_email_preview_deliveries(batch_id,template_id,source_hash,recipient_hash) values($1,'template-fixture',repeat('a',64),repeat('b',64))",[id]);
  await assert.rejects(db.query("insert into marketing_email_preview_deliveries(batch_id,template_id,source_hash,recipient_hash) values($1,'template-fixture',repeat('a',64),repeat('b',64))",[id]),/unique constraint/);
 }finally{await db.close();}
});
