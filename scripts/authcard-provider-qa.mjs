import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import ts from 'typescript';import {readFileSync} from 'node:fs';
import * as contracts from '../lib/authcard/contracts.ts';import {seal,unseal} from '../lib/rewards/contracts.ts';import {fundingDocuments} from '../lib/rewards/funding-documents.ts';
function fixture({minor=false,live=false,badBinding=false,identityUnavailable=false,resultsUnavailable=false,missingDOB=false,paid=true}={}) {
 const services=[],calls=[],key=Buffer.alloc(32,3).toString('base64');
 const c={id:'card',user_id:'student',status:'requires_input',payment_status:paid?'paid':'unpaid',payment_session:paid?'cs_test':null,identity_session:paid?'vs_test':null,payment_lease:'lease',identity_lease:'lease',details_encrypted:seal({firstName:'Candidate',lastName:'Entered',dob:'1990-01-01',address:'Private road',city:'Austin',state:'TX',postalCode:'78701',ssn:'123456789'},key,'authcard:student')};
 const session={id:'cs_test',client_reference_id:'card',livemode:live,currency:'usd',amount_total:500,metadata:{kyu_id:'card'},status:'open',payment_status:paid?'paid':'unpaid',client_secret:'test-secret'};
 const identity={id:'vs_test',client_reference_id:badBinding?'foreign-card':'card',livemode:live,type:'document',metadata:{kyu_id:'card'},status:'verified',verified_outputs:{dob:{year:minor?2014:1990,month:1,day:1},first_name:'Private Stripe',id_number:'stripe-sensitive'},client_secret:'identity-test'};
 const stripe={identity:{verificationSessions:{list:async()=>{calls.push('identity-capability');if(identityUnavailable)throw Error('unsupported');return{};},retrieve:async()=>{calls.push('identity-retrieve');return identity;},create:async(body,options)=>{calls.push({identity:body,options});return identity;}}},checkout:{sessions:{retrieve:async()=>session,create:async(body,options)=>{calls.push({payment:body,options});return session;}}},paymentIntents:{retrieve:async()=>({})}};
 function Stripe(apiKey){if(apiKey==='rk_test_results')return {identity:{verificationSessions:{retrieve:async(id,options)=>{calls.push({resultsRead:options,id});assert.equal(JSON.stringify(options.expand),'["verified_outputs.dob"]');if(resultsUnavailable)throw Error('restricted access denied');return {...identity,verified_outputs:missingDOB?{}:identity.verified_outputs};}}}};return stripe;}
 const service=async i=>{services.push(i);if(['read','provider_read','payment_claim','identity_claim'].includes(i.op))return {...c};if(i.op==='details')c.details_encrypted=i.encrypted;if(i.op==='payment_bind')c.payment_session=i.sessionId;if(i.op==='identity_bind')c.identity_session=i.sessionId;if(i.op==='payment_observe')c.payment_status=i.status;if(i.op==='identity_observe'){c.status=i.status;c.adult_verified=i.adult;}return{};};
 const require=name=>name==='server-only'?{}:name==='stripe'?Stripe:name==='./contracts'?contracts:name==='@/lib/rewards/contracts'?{seal,unseal}:name==='@/lib/rewards/funding-documents'?{fundingDocuments}:name==='@/lib/rewards/server'?{authenticatedRpc:async()=>({actor:'student'})}:name==='@/lib/supabase/admin'?{createAdminClient:()=>({rpc:async(_,{p_input})=>({data:await service(p_input)})})}:(()=>{throw Error(name);})();
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/authcard/server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,require,process:{env:{STRIPE_SANDBOX_SECRET_KEY:'sk_test_fixture',STRIPE_SANDBOX_PUBLISHABLE_KEY:'pk_test_fixture',REWARDS_SANDBOX_APP_ORIGIN:contracts.APP_ORIGIN,REWARDS_ENCRYPTION_KEY:key,...(!resultsUnavailable?{STRIPE_IDENTITY_SANDBOX_RESTRICTED_KEY:'rk_test_results'}:{})}},Buffer,Response,Date,console});
 return {api:mod.exports,services,calls,c,stripe,identity,session};
}
test('KYU retrieves status independently and retains only status plus adult flag, never Stripe data',async()=>{
 const f=fixture();await f.api.refresh();const observation=f.services.find(s=>s.op==='identity_observe');assert.equal(observation.status,'verified');assert.equal(observation.adult,true);
 const stored=JSON.stringify(f.services);assert.ok(!stored.includes('stripe-sensitive'));assert.ok(!stored.includes('Private Stripe'));assert.ok(!stored.includes('1990'));
 const minor=fixture({minor:true});await minor.api.refresh();assert.equal(minor.services.find(s=>s.op==='identity_observe').adult,false);
});
test('foreign and live Identity sessions rejected without recording verified state',async()=>{
 for(const options of [{badBinding:true},{live:true}]){const f=fixture(options);await assert.rejects(f.api.refresh());assert.equal(f.services.filter(s=>s.op==='identity_observe').length,0);}
});
test('Identity capability checked before one-time test checkout; no employer or PII in Stripe metadata',async()=>{
 const denied=fixture({paid:false,identityUnavailable:true});await assert.rejects(denied.api.payment());assert.ok(!denied.calls.some(c=>c.payment));
 const f=fixture({paid:false});await f.api.payment();const call=f.calls.find(c=>c.payment);assert.equal(call.payment.ui_mode,'elements');assert.equal(call.payment.line_items[0].price_data.unit_amount,500);assert.equal(call.options.idempotencyKey,'txkpro-kyu-fee-card');assert.deepEqual(Object.keys(call.payment.metadata),['kyu_id']);assert.ok(!JSON.stringify(call).includes('123456789'));
});
test('KYU signed-event routing binds exact sessions and never trusts stale event verified outputs',async()=>{
 const f=fixture();const event={livemode:false,type:'identity.verification_session.verified',data:{object:{...f.identity,verified_outputs:{dob:{year:1900,month:1,day:1}}}}};
 f.identity.status='processing';await f.api.processKyuEvent(event,f.stripe);assert.equal(f.services.find(s=>s.op==='identity_observe').status,'processing');
 await assert.rejects(f.api.processKyuEvent({...event,livemode:true},f.stripe));await assert.rejects(f.api.processKyuEvent({...event,data:{object:{...event.data.object,id:'foreign'}}},f.stripe));
});
test('owner editor masks saved SSN and no Stripe data is part of candidate-entered claims',async()=>{
 const f=fixture();const d=await f.api.editDetails();assert.equal(d.hasSSN,true);assert.equal(d.details.ssn,undefined);assert.equal(d.details.firstName,'Candidate');assert.ok(!JSON.stringify(d).includes('stripe-sensitive'));
});
test('incomplete details and unchecked adult confirmation never acquire a provider lease or charge',async()=>{
 const invalid=fixture();await assert.rejects(invalid.api.saveDetails({details:{...contracts.SANDBOX_DETAILS,ssn:'1234'}}),e=>e.status===400);assert.equal(invalid.services.length,0);
 const f=fixture({paid:false});f.c.details_encrypted=null;
 await assert.rejects(f.api.payment(),e=>e.status===400);
 assert.equal(f.services.some(s=>s.op==='payment_claim'),false);assert.equal(f.calls.length,0);
 const g=fixture();await assert.rejects(g.api.identity({adultConfirmed:false}));assert.equal(g.services.some(s=>s.op==='identity_claim'),false);assert.equal(g.calls.length,0);
 const h=fixture({paid:false});await assert.rejects(h.api.identity({adultConfirmed:true}));assert.equal(h.services.some(s=>s.op==='identity_claim'),false);assert.equal(h.calls.length,0);
});
test('candidate can prepare sample details, pay once, complete test verification and reconcile independently',async()=>{
 const f=fixture({paid:false});f.identity.status='requires_input';
 await f.api.saveDetails({details:contracts.SANDBOX_DETAILS});
 assert.equal(f.services.filter(s=>s.op==='details').length,1);
 const pay=await f.api.payment();assert.equal(pay.clientSecret,'test-secret');
 f.session.payment_status='paid';await f.api.refresh();assert.equal(f.c.payment_status,'paid');
 const verification=await f.api.identity({adultConfirmed:true});assert.equal(verification.identitySecret,'identity-test');
 const created=f.calls.find(c=>c.identity);assert.equal(created.identity.options.document.require_matching_selfie,true);
 assert.deepEqual(Object.keys(created.identity.metadata),['kyu_id']);
 f.identity.status='verified';await f.api.refresh();assert.equal(f.c.status,'verified');assert.equal(f.c.adult_verified,true);
 await f.api.payment();assert.equal(f.calls.filter(c=>c.payment).length,1);
 assert.ok(!JSON.stringify(f.calls).includes('123456789'));
});

test('processing is synchronized without any sensitive-results expansion',async()=>{
 const f=fixture({resultsUnavailable:true});f.identity.status='processing';await f.api.refresh();assert.equal(f.c.status,'processing');assert.equal(f.calls.some(c=>c.resultsRead),false);
});
test('resuming a completed Identity session reconciles saved AuthCard state',async()=>{
 const f=fixture();const result=await f.api.identity({adultConfirmed:true});assert.equal(result.identitySecret,undefined);assert.equal(f.c.status,'verified');assert.equal(f.c.adult_verified,true);
});
test('missing results access or DOB retains session and fee without recording adult verification',async()=>{
 for(const options of [{resultsUnavailable:true},{missingDOB:true}]){const f=fixture(options);await assert.rejects(f.api.refresh(),e=>e.status===503);assert.equal(f.c.status,'requires_input');assert.equal(f.c.payment_status,'paid');assert.equal(f.c.identity_session,'vs_test');assert.equal(f.services.some(s=>s.op==='identity_observe'),false);}
 const unpaid=fixture({paid:false,resultsUnavailable:true});await assert.rejects(unpaid.api.payment(),e=>e.status===503);assert.equal(unpaid.services.some(s=>s.op==='payment_claim'),false);assert.equal(unpaid.calls.some(c=>c.payment),false);
 const paid=fixture({resultsUnavailable:true});await paid.api.payment();assert.equal(paid.calls.some(c=>c.payment),false);
});
test('already verified adult avoids repeated DOB reads but redaction removes verification',async()=>{
 const f=fixture({resultsUnavailable:true});f.c.status='verified';f.c.adult_verified=true;await f.api.refresh();assert.equal(f.calls.some(c=>c.resultsRead),false);assert.equal(f.c.status,'verified');
 f.identity.redaction={status:'redacted'};await f.api.refresh();assert.equal(f.c.status,'cancelled');assert.equal(f.c.adult_verified,false);
});
