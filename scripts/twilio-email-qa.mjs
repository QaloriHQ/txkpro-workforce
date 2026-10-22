import test from 'node:test';
import assert from 'node:assert/strict';
import { readTwilioEmailConfig,sendTwilioEmail,getTwilioEmailOperation } from '../lib/email/twilio-email.ts';

const config={accountSid:'AC'+'a'.repeat(32),authToken:'test-secret-for-mocked-request',fromAddress:'sender@example.invalid',fromName:'TXKPRO'};
const message={to:'recipient@example.invalid',subject:'Test subject',html:'<p>Test</p>'};
const operationId='comms_operation_01h9krwprkeee8fzqspvwy6nq8';
const response=(json,status=202)=>new Response(JSON.stringify(json),{status,headers:{'content-type':'application/json'}});

test('disabled, incomplete and malformed configuration fail closed before network access',async()=>{
  const env={TWILIO_EMAIL_ENABLED:'true',TWILIO_EMAIL_ACCOUNT_SID:config.accountSid,TWILIO_EMAIL_AUTH_TOKEN:config.authToken,TWILIO_EMAIL_FROM_ADDRESS:config.fromAddress,TWILIO_EMAIL_FROM_NAME:config.fromName};
  assert.deepEqual(readTwilioEmailConfig(env),config);
  assert.equal(readTwilioEmailConfig({...env,TWILIO_EMAIL_ENABLED:'false'}),null);
  assert.equal(readTwilioEmailConfig({...env,TWILIO_EMAIL_AUTH_TOKEN:undefined}),null);
  assert.equal(readTwilioEmailConfig({...env,TWILIO_EMAIL_FROM_ADDRESS:'bad\r\naddress'}),null);
  assert.equal(readTwilioEmailConfig({TWILIO_ACCOUNT_SID:config.accountSid,TWILIO_AUTH_TOKEN:config.authToken}),null);
  let calls=0;
  const result=await sendTwilioEmail(null,message,async()=>{calls++;throw Error('unexpected');});
  assert.equal(result.ok,false);assert.equal(calls,0);
});

test('one bounded request authenticates to the fixed provider and reports acceptance separately from delivery',async()=>{
  let calls=0;
  const result=await sendTwilioEmail(config,message,async(url,init)=>{
    calls++;assert.equal(url,'https://comms.twilio.com/v1/Emails');
    assert.equal(init.headers.Authorization,'Basic '+btoa(config.accountSid+':'+config.authToken));
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body),{from:{address:config.fromAddress,name:config.fromName},to:[{address:message.to}],content:{subject:message.subject,html:message.html}});
    return response({operationId,operationLocation:'https://attacker.invalid/secret'});
  });
  assert.equal(calls,1);assert.deepEqual(result,{ok:true,outcome:'accepted',delivery:'unverified',operationId});
  assert.ok(!JSON.stringify(result).includes(config.authToken));
});

test('invalid destinations, header injection, empty content and excessive content never send',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected');};
  for(const change of [{to:'bad'},{to:'a@example.invalid\r\nbcc: x@example.invalid'},{subject:'hello\nBcc: private'},{html:''},{html:'x'.repeat(100001)},{text:42}]){
    assert.equal((await sendTwilioEmail(config,{...message,...change},fetcher)).outcome,'invalid_message');
  }
  assert.equal(calls,0);
});

test('ambiguous sends are never automatically retried and provider details stay private',async()=>{
  for(const status of [200,301,401,403,429,500]){
    let calls=0;
    const result=await sendTwilioEmail(config,message,async()=>{calls++;return response({error:config.authToken},status);});
    assert.equal(calls,1);assert.equal(result.ok,false);
    assert.equal(result.outcome,status>=400&&status<500?'rejected':'send_unconfirmed');
    assert.ok(!JSON.stringify(result).includes(config.authToken));
  }
  let calls=0;
  const result=await sendTwilioEmail(config,message,async()=>{calls++;throw new Error(config.authToken);});
  assert.equal(calls,1);assert.deepEqual(result,{ok:false,outcome:'send_unconfirmed'});
  for(const body of [{}, {operationId:'https://attacker.invalid'}, {operationId:'x'.repeat(33000)}]){
    assert.equal((await sendTwilioEmail(config,message,async()=>response(body))).outcome,'send_unconfirmed');
  }
  assert.equal((await sendTwilioEmail(config,message,async()=>new Response('<html/>',{status:202}))).ok,false);
});

test('operation tracking cannot redirect credentials and retains delivery failures',async()=>{
  const stats={total:1,queued:0,sent:0,scheduled:0,delivered:0,opened:0,undelivered:1,failed:0,canceled:0};
  const result=await getTwilioEmailOperation(config,operationId,async(url,init)=>{
    assert.equal(url,'https://comms.twilio.com/v1/Emails/Operations/'+operationId);
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    return response({id:operationId,status:'COMPLETED',stats,privateData:config.authToken},200);
  });
  assert.deepEqual(result,{ok:true,operationId,status:'COMPLETED',stats});
  let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected');};
  assert.equal((await getTwilioEmailOperation(config,'../../other',fetcher)).ok,false);
  assert.equal(calls,0);
  for(const body of [{id:operationId,status:'COMPLETED'}, {id:'wrong',status:'COMPLETED',stats}, {id:operationId,status:'COMPLETED',stats:{...stats,delivered:-1}}]){
    assert.equal((await getTwilioEmailOperation(config,operationId,async()=>response(body,200))).ok,false);
  }
});
