// Server-only Zoho Bookings transport. Provider URLs come only from this allowlist.
export const regions={
 US:{accounts:'https://accounts.zoho.com',api:'https://www.zohoapis.com'},
 EU:{accounts:'https://accounts.zoho.eu',api:'https://www.zohoapis.eu'},
 IN:{accounts:'https://accounts.zoho.in',api:'https://www.zohoapis.in'},
 AU:{accounts:'https://accounts.zoho.com.au',api:'https://www.zohoapis.com.au'},
 CN:{accounts:'https://accounts.zoho.com.cn',api:'https://www.zohoapis.com.cn'},
 JP:{accounts:'https://accounts.zoho.jp',api:'https://www.zohoapis.jp'},
 CA:{accounts:'https://accounts.zohocloud.ca',api:'https://www.zohoapis.ca'},
 SA:{accounts:'https://accounts.zoho.sa',api:'https://www.zohoapis.sa'},
} as const;
type Env=Record<string,string|undefined>;
export type OAuthConfig={clientId:string;clientSecret:string;refreshToken:string;region:keyof typeof regions};
export type CalendarConfig=OAuthConfig & {workspaceId:string;serviceId:string;staffId:string;emailDisabled:boolean};
type Fetcher=typeof fetch;
const zone='America/Chicago';
const idPattern=/^\d{5,30}$/;
export function oauthConfig(env:Env):OAuthConfig|null {
 const {ZOHO_BOOKINGS_CLIENT_ID:clientId,ZOHO_BOOKINGS_CLIENT_SECRET:clientSecret,ZOHO_BOOKINGS_REFRESH_TOKEN:refreshToken,ZOHO_BOOKINGS_REGION:region}=env;
 if(!clientId||!clientSecret||!refreshToken||!region||!Object.hasOwn(regions,region))return null;
 return {clientId,clientSecret,refreshToken,region:region as keyof typeof regions};
}
export function calendarConfig(env:Env):CalendarConfig|null {
 const oauth=oauthConfig(env);
 const {ZOHO_BOOKINGS_WORKSPACE_ID:workspaceId,ZOHO_BOOKINGS_SERVICE_ID:serviceId,ZOHO_BOOKINGS_STAFF_ID:staffId}=env;
 if(!oauth||![workspaceId,serviceId,staffId].every(v=>v&&idPattern.test(v)))return null;
 return {...oauth,workspaceId:workspaceId!,serviceId:serviceId!,staffId:staffId!,emailDisabled:env.ZOHO_BOOKINGS_EMAIL_DISABLED==='true'};
}
async function json(response:Response) {
 if(!response.ok)throw Error('calendar_unavailable');
 const reader=response.body?.getReader();if(!reader)throw Error('calendar_unavailable');
 let size=0;let text='';const decoder=new TextDecoder();
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>200000){await reader.cancel();throw Error('calendar_unavailable');}text+=decoder.decode(part.value,{stream:true});}
 try{return JSON.parse(text+decoder.decode());}catch{throw Error('calendar_unavailable');}
}
export async function exchangeAuthorizationCode(config:Omit<OAuthConfig,'refreshToken'>,code:string,fetcher:Fetcher=fetch){
 if(!code||code.length>2048)throw Error('configuration');
 const value=await json(await fetcher(regions[config.region].accounts+'/oauth/v2/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code,grant_type:'authorization_code'}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)}));
 if(typeof value.refresh_token!=='string'||value.api_domain!==regions[config.region].api)throw Error('calendar_unavailable');
 return {refreshToken:value.refresh_token as string};
}
export async function accessToken(config:OAuthConfig,fetcher:Fetcher=fetch) {
 const value=await json(await fetcher(regions[config.region].accounts+'/oauth/v2/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)}));
 if(typeof value.access_token!=='string'||value.api_domain!==regions[config.region].api)throw Error('calendar_unavailable');
 return value.access_token as string;
}
export async function bookingRequest(config:OAuthConfig,token:string,path:'services'|'workspaces'|'staffs'|'availableslots'|'appointment',params:Record<string,string>,fetcher:Fetcher=fetch){
 const url=new URL(regions[config.region].api+'/bookings/v1/json/'+path);
 const body=new FormData();
 for(const [key,value]of Object.entries(params)){if(path==='appointment')body.set(key,value);else url.searchParams.set(key,value);}
 const data=await json(await fetcher(url.href,{method:path==='appointment'?'POST':'GET',headers:{Authorization:'Zoho-oauthtoken '+token},...(path==='appointment'?{body}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)}));
 if(data.response?.status!=='success'||!data.response.returnvalue||typeof data.response.returnvalue!=='object')throw Error('calendar_unavailable');
 return data.response.returnvalue;
}
export function chicagoDate(date:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function selectedDate(value:unknown,now=new Date()){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value))throw Error('fields');
 const day=new Date(value+'T12:00:00Z');const today=chicagoDate(now);
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==value||value<=today||value>chicagoDate(new Date(now.getTime()+30*86400000))||['Sat','Sun'].includes(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short'}).format(day)))throw Error('fields');
 return value;
}
export function nextResearchDate(now=new Date()){
 for(let d=1;d<=4;d++){const day=chicagoDate(new Date(now.getTime()+d*86400000));try{return selectedDate(day,now);}catch{}}
 throw Error('fields');
}
function zohoDate(day:string){const [year,month,date]=day.split('-');return date+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)-1]+'-'+year;}
export function slotFromZoho(day:string,value:unknown){
 if(typeof value!=='string')throw Error('calendar_unavailable');
 const m=/^(\d{1,2}):(\d\d)(?:\s*(AM|PM))?$/i.exec(value.trim());if(!m)throw Error('calendar_unavailable');
 let hour=Number(m[1]);const minute=Number(m[2]);if(minute>59||hour>(m[3]?12:23)||(m[3]&&hour<1))throw Error('calendar_unavailable');
 if(m[3])hour=hour%12+(m[3].toUpperCase()==='PM'?12:0);
 if(hour<9||hour>=16||minute%30!==0)return null;
 const noon=new Date(day+'T12:00:00Z');
 // Search both valid US Central offsets. Weekday working hours are never DST-ambiguous.
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(const offset of [5,6]){
  const start=new Date(Date.UTC(noon.getUTCFullYear(),noon.getUTCMonth(),noon.getUTCDate(),hour+offset,minute));
  if(chicagoDate(start)===day&&clock.format(start)===String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'))return {start:start.toISOString(),end:new Date(start.getTime()+20*60000).toISOString(),label:new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(start)};
 }
 throw Error('calendar_unavailable');
}
async function verifyService(config:CalendarConfig,token:string,fetcher:Fetcher){
 const value=await bookingRequest(config,token,'services',{workspace_id:config.workspaceId,service_id:config.serviceId},fetcher);
 const service=Array.isArray(value.data)?value.data.find((v:{id?:unknown})=>v.id===config.serviceId):null;
 if(!service||service.service_type!=='APPOINTMENT'||service.duration!=='20 mins'||!/^\d+ mins$/.test(service.buffertime)||Number.parseInt(service.buffertime)<10||Number(service.price)!==0||!Array.isArray(service.assigned_staffs)||!service.assigned_staffs.includes(config.staffId))throw Error('configuration');
}
export async function calendarAvailability(config:CalendarConfig,fetcher:Fetcher=fetch,now=new Date(),date?:string){
 const day=selectedDate(date??nextResearchDate(now),now);
 const token=await accessToken(config,fetcher);await verifyService(config,token,fetcher);
 const value=await bookingRequest(config,token,'availableslots',{service_id:config.serviceId,staff_id:config.staffId,selected_date:zohoDate(day)+' 00:00:00'},fetcher);
 if(value.time_zone!==zone||!Array.isArray(value.data)||value.data.length>200)throw Error('calendar_unavailable');
 const slots=value.data.map((v:unknown)=>slotFromZoho(day,v)).filter((v:ReturnType<typeof slotFromZoho>)=>v!==null);
 const unique=new Map<string,NonNullable<ReturnType<typeof slotFromZoho>>>();for(const slot of slots)unique.set(slot.start,slot);
 return {timezone:zone,duration:20,date:day,slots:[...unique.values()].sort((a,b)=>a.start.localeCompare(b.start))};
}
export async function createResearchBooking(config:CalendarConfig,input:{id:string;start:string;end:string;firstName:string;email:string},fetcher:Fetcher=fetch){
 if(!config.emailDisabled)throw Error('configuration');
 const token=await accessToken(config,fetcher);await verifyService(config,token,fetcher);
 const date=chicagoDate(new Date(input.start));const clock=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(input.start));
 // The provider has no documented idempotency key. Call once after the durable DB claim; uncertainties require review.
 const value=await bookingRequest(config,token,'appointment',{service_id:config.serviceId,staff_id:config.staffId,from_time:zohoDate(date)+' '+clock,timezone:zone,customer_details:JSON.stringify({name:input.firstName,email:input.email}),notes:'TXKPRO research reference '+input.id},fetcher);
 if(typeof value.booking_id!=='string'||!/^#[A-Za-z0-9_-]{1,80}$/.test(value.booking_id)||value.service_id!==config.serviceId||value.staff_id!==config.staffId||value.status!=='upcoming'||value.duration!=='20 mins'||value.time_zone!==zone||value.start_time!==zohoDate(date)+' '+clock||value.end_time!==zohoDate(date)+' '+new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(input.end)))throw Error('calendar_unavailable');
 return {bookingId:value.booking_id as string};
}
