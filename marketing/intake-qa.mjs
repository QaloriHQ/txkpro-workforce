import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {allowedOrigin,validate,CONSENT_TEXT} from '../supabase/functions/marketing-intake/contract.mjs';

test('public intake validates product-specific roles, email and affirmative consent',()=>{
 assert.deepEqual(validate({product:'marketplace',email:' Person@Example.com ',role:'homeowner',consent:true}),{product:'marketplace',email:'person@example.com',role:'homeowner',honeypot:false});
 for(const change of [{consent:false},{consent:'true'},{email:'a\n@example.com'},{email:'bad'},{role:'admin'},{product:'__proto__'},{product:'workforce',role:'contractor'}])assert.throws(()=>validate({product:'marketplace',email:'a@example.com',role:'homeowner',consent:true,...change}));
 assert.equal(validate({website:'bot'}).honeypot,true);
 assert(allowedOrigin('https://txkpro-marketplace-waitlist-123-qaloris-projects.vercel.app'));
 for(const origin of ['https://attacker.example','https://txkpro-marketplace-waitlist-123-otherteam.vercel.app','http://txkpro-marketplace-marketing.vercel.app','https://txkpro.com','https://app.txkpro.com','null'])assert(!allowedOrigin(origin));
});

test('database denies public reads/writes/RPC and preserves consent, withdrawals and limits',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261021183219_marketing_native_intake.sql',import.meta.url),'utf8'));
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);
   for(const query of ['select * from marketing_interest_entries','select * from marketing_legacy_records',"select marketing_interest_submit('marketplace','private@example.com','homeowner','https://example.com',repeat('a',64))"]){await assert.rejects(db.query(query),/permission denied/);}
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const submit=(email='fixture@example.invalid',role='homeowner',bucket='a')=>db.query('select marketing_interest_submit($1,$2,$3,$4,$5)',['marketplace',email,role,'https://txkpro-marketplace-marketing.vercel.app',bucket.repeat(64)]);
  await submit();await submit();
  const before=(await db.query('select * from marketing_interest_entries')).rows;assert.equal(before.length,1);assert.equal(before[0].consent_text,CONSENT_TEXT);
  await db.exec('update marketing_interest_entries set withdrawn_at=now()');await submit();
  const after=(await db.query('select * from marketing_interest_entries')).rows[0];assert(after.withdrawn_at);assert.deepEqual(after.consented_at,before[0].consented_at);
  await assert.rejects(submit('fixture@example.invalid','admin','b'),/check constraint/);
  for(let i=3;i<20;i++)await submit();
  await assert.rejects(submit(),/Intake limit/);
  assert.equal((await db.query('select attempts from marketing_intake_limits where bucket_key=$1',['a'.repeat(64)])).rows[0].attempts,20);
 }finally{await db.close();}
});
