import {createHash,createHmac,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {normalizeServerSecret} from '../supabase/server-secret.js';
import {readTwilioEmailConfig,sendTwilioEmail} from '../email/twilio-email.js';
import {bookingInput,email,surveyInput} from './contract.js';
import {calendarAvailability,calendarConfig,createResearchEvent} from './calendar.js';

// Server entry points only. This module is never imported by marketing browser assets.
const createAdminClient=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||'',normalizeServerSecret(process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY),{auth:{persistSession:false,autoRefreshToken:false}});
const sendEmail=(message:{to:string;subject:string;html:string;text?:string})=>sendTwilioEmail(readTwilioEmailConfig(process.env),message);
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const secret=()=>{
 const value=process.env.RESEARCH_LINK_SECRET;
 if(!value||value.length<32)throw Error('configuration');
 return value;
};
export async function researchLimit(ip:string,action:string,recipient?:string){
 const db=createAdminClient();
 const bucket=createHmac('sha256',secret()).update(new Date().toISOString().slice(0,10)+':research:'+action+':'+ip.slice(0,100)).digest('hex');
 const {error}=await db.rpc('marketing_research_rate_limit',{p_bucket:bucket,p_limit:recipient?12:60});
 if(error)throw Error('request_limit');
 if(recipient){
  const bucket=createHmac('sha256',secret()).update(new Date().toISOString().slice(0,10)+':recipient:'+recipient).digest('hex');
  const {error}=await db.rpc('marketing_research_rate_limit',{p_bucket:bucket,p_limit:3});
  if(error)throw Error('request_limit');
 }
}
export async function researchAvailability(){
 const config=calendarConfig(process.env);
 if(!config)throw Error('configuration');
 const availability=await calendarAvailability(config);
 const {data,error}=await createAdminClient().from('marketing_research_bookings').select('start_at').gte('start_at',new Date().toISOString()).lte('start_at',new Date(Date.now()+31*86400000).toISOString());
 if(error)throw Error('storage');
 const reserved=new Set(data.map(row=>new Date(row.start_at).toISOString()));
 return {...availability,slots:availability.slots.filter(slot=>!reserved.has(slot.start))};
}
export async function submitResearchSurvey(input:Record<string,unknown>){
 const value=surveyInput(input);const requestHash=hash(JSON.stringify(value));const db=createAdminClient();
 const {error}=await db.from('marketing_research_surveys').insert({request_id:value.requestId,request_hash:requestHash,research_role:value.role,question_version:'legacy-v7',answers:value.answers});
 if(error){
  if(error.code!=='23505')throw Error('storage');
  const {data,error:readError}=await db.from('marketing_research_surveys').select('request_hash').eq('request_id',value.requestId).single();
  if(readError||data.request_hash!==requestHash)throw Error('conflict');
 }
 return {ok:true,message:'Thank you. Your survey response has been recorded.'};
}
function requireMail(){if(!readTwilioEmailConfig(process.env))throw Error('configuration');}
function testRecipient(address:string){
 if(process.env.VERCEL_ENV==='preview'&&address!==process.env.RESEARCH_EMAIL_TEST_TO?.trim().toLowerCase())throw Error('preview_recipient');
}
export async function requestResearchUnsubscribe(input:Record<string,unknown>){
 requireMail();const address=email(input.email);const token=randomBytes(32).toString('base64url');
 testRecipient(address);
 const {error}=await createAdminClient().from('marketing_research_tokens').insert({token_hash:hash(token),email:address,purpose:'unsubscribe',expires_at:new Date(Date.now()+90*86400000).toISOString()});
 if(error)throw Error('storage');
 const url='https://txkpro.com/unsubscribe#token='+token;
 const result=await sendEmail({to:address,subject:'Your TXKPRO Workforce email preferences',html:`<p>Use this link to stop TXKPRO Workforce marketing updates. Research participation and account access are not affected.</p><p><a href="${url}">Manage email preferences</a></p><p>If you did not request this, you can ignore this email.</p>`,text:'Manage TXKPRO Workforce email preferences: '+url});
 if(!result.ok)throw Error('email_unconfirmed');
 return {ok:true,message:'Check your email for a link to manage Workforce updates.'};
}
export async function confirmResearchUnsubscribe(input:Record<string,unknown>){
 if(typeof input.token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(input.token))throw Error('token');
 const {data,error}=await createAdminClient().rpc('marketing_research_unsubscribe',{p_token_hash:hash(input.token)});
 if(error)throw Error('storage');if(data!==true)throw Error('token');
 return {ok:true,message:'You will no longer receive TXKPRO Workforce marketing updates.'};
}
export async function bookResearchInterview(input:Record<string,unknown>){
 requireMail();const value=bookingInput(input);const config=calendarConfig(process.env);if(!config)throw Error('configuration');
 testRecipient(value.email);
 const db=createAdminClient();const requestHash=hash(JSON.stringify(value));
 const {data:existing,error:readError}=await db.from('marketing_research_bookings').select('*').eq('request_id',value.requestId).maybeSingle();
 if(readError)throw Error('storage');
 if(existing){if(existing.request_hash!==requestHash)throw Error('conflict');if(existing.reservation_state==='booked')return {ok:true,message:'Your research interview is confirmed.',start:existing.start_at,receipt:existing.receipt_outcome};throw Error('booking_pending');}
 const available=await researchAvailability();const slot=available.slots.find(slot=>slot.start===value.start);if(!slot)throw Error('slot_unavailable');
 const eventId=hash('txkpro-research:'+value.requestId);
 const calendarToken=randomBytes(32).toString('base64url');
 const calendarLink='https://txkpro.com/booking#calendar='+calendarToken;
 const {error}=await db.from('marketing_research_bookings').insert({request_id:value.requestId,request_hash:requestHash,first_name:value.firstName,email:value.email,research_role:value.role,start_at:slot.start,end_at:slot.end,google_event_id:eventId,calendar_token_hash:hash(calendarToken),email_consent:value.consent});
 if(error)throw Error(error.code==='23505'?'slot_unavailable':'storage');
 try{
  // Recheck all calendars after acquiring the database reservation. Google event insert is not atomic with free/busy.
  const live=await calendarAvailability(config);
  if(!live.slots.some(s=>s.start===slot.start))throw Error('calendar_changed');
  await createResearchEvent(config,{id:eventId,start:slot.start,end:slot.end,firstName:value.firstName});
 }catch{
  await db.from('marketing_research_bookings').update({reservation_state:'needs_review'}).eq('request_id',value.requestId);
  throw Error('booking_pending');
 }
 const {error:confirmError}=await db.from('marketing_research_bookings').update({reservation_state:'booked'}).eq('request_id',value.requestId);
 if(confirmError)throw Error('booking_pending');
 if(value.consent){
  const {error}=await db.rpc('marketing_interest_submit',{p_product:'workforce',p_email:value.email,p_role:value.role==='instructor'?'educator':value.role,p_origin:'research_interview_explicit_opt_in',p_bucket:hash('optin:'+value.requestId)});
  if(error)throw Error('booking_pending');
 }
 const {data:claim,error:claimError}=await db.from('marketing_research_bookings').update({receipt_claimed_at:new Date().toISOString()}).eq('request_id',value.requestId).is('receipt_claimed_at',null).select('request_id');
 if(claimError)throw Error('booking_pending');
 let receipt='pending';
 if(claim.length){
  const when=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'}).format(new Date(slot.start));
  const result=await sendEmail({to:value.email,subject:'Your TXKPRO Workforce research interview',html:`<p>Hi ${escape(value.firstName)},</p><p>Your 20-minute research interview is confirmed for ${escape(when)} (America/Chicago).</p><p>Video/phone interview — details provided after booking.</p><p><a href="${calendarLink}">Add interview to your calendar</a></p><p>For changes, visit <a href="https://txkpro.com/contact">TXKPRO contact</a>.</p>`,text:'Your 20-minute TXKPRO Workforce research interview is confirmed for '+when+' (America/Chicago). Video/phone interview — details provided after booking. Add to calendar: '+calendarLink+' For changes: https://txkpro.com/contact'});
  receipt=result.ok?'accepted':result.outcome;
  const {error}=await db.from('marketing_research_bookings').update({receipt_outcome:receipt,receipt_operation_id:result.ok?result.operationId:null}).eq('request_id',value.requestId);
  if(error)throw Error('booking_pending');
 }
 return {ok:true,message:'Your research interview is confirmed.',start:slot.start,receipt,calendarLink};
}
export async function researchCalendarFile(input:Record<string,unknown>){
 if(typeof input.token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(input.token))throw Error('token');
 const {data,error}=await createAdminClient().from('marketing_research_bookings').select('google_event_id,start_at,end_at,reservation_state').eq('calendar_token_hash',hash(input.token)).maybeSingle();
 if(error||!data||data.reservation_state!=='booked')throw Error('token');
 const stamp=(date:string)=>new Date(date).toISOString().replaceAll(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const calendar=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TXKPRO//Research//EN','BEGIN:VEVENT','UID:'+data.google_event_id+'@txkpro.com','DTSTAMP:'+stamp(new Date().toISOString()),'DTSTART:'+stamp(data.start_at),'DTEND:'+stamp(data.end_at),'SUMMARY:TXKPRO Workforce Research Interview','DESCRIPTION:Video/phone interview. Details provided after booking. For changes visit https://txkpro.com/contact','END:VEVENT','END:VCALENDAR',''].map(line=>(line.match(/.{1,73}/g)||['']).join('\r\n ')).join('\r\n');
 return {ok:true,calendar};
}
