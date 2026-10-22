import {allowedResearchOrigin,email} from './contract';
import {bookResearchInterview,confirmResearchUnsubscribe,requestResearchUnsubscribe,researchAvailability,researchCalendarFile,researchLimit,submitResearchSurvey} from './service';
const baseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
function originHeaders(request:Request){
 const origin=request.headers.get('origin')??(request.method==='GET'?new URL(request.url).origin:'');
 if(!allowedResearchOrigin(origin))return null;
 return {...baseHeaders,'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'content-type'};
}
export async function OPTIONS(request:Request){const headers=originHeaders(request);return new Response(null,{status:headers?204:403,headers:headers??baseHeaders});}
async function handle(request:Request){
 const headers=originHeaders(request);
 if(!headers)return Response.json({ok:false,error:'Request unavailable.'},{status:403,headers:baseHeaders});
 if(process.env.MARKETING_RESEARCH_ENABLED!=='true')return Response.json({ok:false,error:'Research forms are temporarily unavailable.'},{status:503,headers});
 try{
  const action=new URL(request.url).searchParams.get('action');
  if(!['availability','survey','booking','calendar','unsubscribe_request','unsubscribe_confirm'].includes(action??''))throw Error('fields');
  if((request.method==='GET')!==(action==='availability'))return Response.json({ok:false,error:'Method not allowed.'},{status:405,headers});
  let body:Record<string,unknown>={};
  if(request.method==='POST'){
   if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('fields');
   const reader=request.body?.getReader();if(!reader)throw Error('fields');let bytes=0;const parts:Uint8Array[]=[];
   while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>16000){await reader.cancel();throw Error('fields');}parts.push(part.value);}
   const buffer=new Uint8Array(bytes);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.byteLength;}
   const parsed=JSON.parse(new TextDecoder().decode(buffer));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('fields');body=parsed;
   if(body.website)return Response.json({ok:true,message:'Request received.'},{status:202,headers});
  }
  const ip=(request.headers.get('x-forwarded-for')??'unknown').split(',')[0].trim();
  await researchLimit(ip,action!,action==='booking'||action==='unsubscribe_request'?email(body.email):undefined);
  const result=action==='availability'?await researchAvailability():action==='survey'?await submitResearchSurvey(body):action==='booking'?await bookResearchInterview(body):action==='calendar'?await researchCalendarFile(body):action==='unsubscribe_request'?await requestResearchUnsubscribe(body):await confirmResearchUnsubscribe(body);
  return Response.json(result,{status:200,headers});
 }catch(error){
  const code=error instanceof Error?error.message:'';
  const errors:Record<string,[number,string]>={storage:[503,'This service is temporarily unavailable. Please try again later.'],preview_recipient:[403,'Preview email is restricted to the authorized test recipient.'],configuration:[503,'This service is temporarily unavailable. Please check back soon.'],calendar_unavailable:[503,'Live calendar availability could not be verified. Please try again later.'],request_limit:[429,'Too many attempts. Please try again later.'],token:[400,'This preferences link is invalid or expired. Request a new link.'],slot_unavailable:[409,'This time is no longer available. Choose another time.'],conflict:[409,'This request changed. Please refresh and try again.'],booking_pending:[409,'Your booking needs review. Please contact TXKPRO before trying another booking.'],email_unconfirmed:[503,'Email delivery could not be confirmed. Please wait before requesting another link.']};
  const [status,message]=errors[code]??[400,'Please check the form and try again.'];
  if(status>=500)console.warn('marketing_research_request_failed',{outcome:Object.hasOwn(errors,code)?code:'unavailable',status});
  return Response.json({ok:false,error:message},{status,headers});
 }
}
export const GET=handle;
export const POST=handle;
