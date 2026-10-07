import test from 'node:test';
import assert from 'node:assert/strict';
import {adultDate,privateDetails,validPurpose,consentAccepted,fixtureOnly,PURPOSES} from '../lib/authcard/contracts.ts';
import {mockRequest,PRODUCTS} from '../lib/authenticate/contracts.ts';
import {seal,unseal} from '../lib/rewards/contracts.ts';
test('adult eligibility rejects minors, invalid dates and future dates',()=>{
 const now=new Date('2026-10-07T20:00:00Z');
 assert.equal(adultDate('2008-10-07',now),true);assert.equal(adultDate('2008-10-08',now),false);
 for(const dob of ['2010-01-01','2000-02-31','1899-01-01','2027-01-01','2000/01/01',null])assert.equal(adultDate(dob,now),false);
});
test('certifications must be explicit booleans and documented transaction purpose',()=>{
 for(const p of PURPOSES)assert.equal(validPurpose({purpose:p.id,transactionCertified:true,nonEligibilityCertified:true}),true);
 for(const bad of [{purpose:'employment'},{transactionCertified:'true'},{nonEligibilityCertified:false},{description:'x'.repeat(501)}])assert.equal(validPurpose({purpose:'fraud_prevention',transactionCertified:true,nonEligibilityCertified:true,...bad}),false);
});
test('private details use allowlist, encryption binds candidate, no Stripe fields retained',()=>{
 const details=privateDetails({firstName:'Test',lastName:'Candidate',dob:'1990-01-01',address:'123 Test',city:'Austin',state:'TX',postalCode:'78701',ssn:'123456789',stripeIdentity:{id:'secret'},employerId:'private'});
 assert.equal(details.stripeIdentity,undefined);assert.equal(details.employerId,undefined);
 const key=Buffer.alloc(32,8).toString('base64'),encrypted=seal(details,key,'authcard:user');
 assert.ok(!encrypted.includes('123456789'));assert.deepEqual(unseal(encrypted,key,'authcard:user'),details);
 assert.throws(()=>unseal(encrypted,key,'authcard:foreign'));
 assert.throws(()=>privateDetails({...details,ssn:'abc'}));
});
test('consent requires exactly all parties without duplicates or stale/extra parties',()=>{
 const parties=[{id:'txkpro'},{id:'workspace'},{id:'authenticate'}];
 assert.equal(consentAccepted(['authenticate','txkpro','workspace'],parties),true);
 for(const ids of [[],['txkpro'],['txkpro','txkpro','workspace'],['txkpro','workspace','authenticate','hidden'],null])assert.equal(consentAccepted(ids,parties),false);
});
test('Authenticate egress rejects employer metadata, candidate details and Stripe data',()=>{
 for(const p of PRODUCTS){const r=mockRequest(p.id);assert.deepEqual(fixtureOnly(r.body,r.body),r.body);for(const extra of [{ownerId:'private-employer'},{employerName:'Requester LLC'},{email:'candidate@example.com'},{purpose:'fraud_prevention'},{stripeData:{dob:'1990-01-01'}}])assert.throws(()=>fixtureOnly({...r.body,...extra},r.body));}
});
test('sandbox sample is complete without SSN and partial SSN explains the exact blocker',async()=>{
 const {SANDBOX_DETAILS}=await import('../lib/authcard/contracts.ts');
 assert.equal(privateDetails(SANDBOX_DETAILS).ssn,undefined);
 assert.throws(()=>privateDetails({...SANDBOX_DETAILS,ssn:'1234'}),/all 9 digits.*optional/);
 assert.throws(()=>privateDetails({...SANDBOX_DETAILS,dob:'2014-01-01'}),/18 or older/);
 assert.throws(()=>privateDetails({...SANDBOX_DETAILS,postalCode:'bad'}),/ZIP code/);
 assert.throws(()=>privateDetails({...SANDBOX_DETAILS,firstName:''}),/First name is required/);
});
