type CalendarConfig={clientId:string;clientSecret:string;refreshToken:string;calendarId:string;busyCalendarIds:string[]};
type Busy={start:string;end:string};
type Fetcher=typeof fetch;
const zone='America/Chicago';
export function calendarConfig(env:Record<string,string|undefined>):CalendarConfig|null {
  const {GOOGLE_RESEARCH_CLIENT_ID:clientId,GOOGLE_RESEARCH_CLIENT_SECRET:clientSecret,GOOGLE_RESEARCH_REFRESH_TOKEN:refreshToken,GOOGLE_RESEARCH_CALENDAR_ID:calendarId,GOOGLE_RESEARCH_BUSY_CALENDAR_IDS:busy}=env;
  if(!clientId||!clientSecret||!refreshToken||!calendarId||!busy)return null;
  const busyCalendarIds=[...new Set([calendarId,...busy.split(',').map(s=>s.trim()).filter(Boolean)])];
  if(busyCalendarIds.length>5)return null;
  return {clientId,clientSecret,refreshToken,calendarId,busyCalendarIds};
}
async function json(response:Response) {
  if(!response.ok)throw Error('calendar_unavailable');
  const text=await response.text();
  if(text.length>200000)throw Error('calendar_unavailable');
  return JSON.parse(text);
}
async function accessToken(config:CalendarConfig,fetcher:Fetcher) {
  const value=await json(await fetcher('https://oauth2.googleapis.com/token',{
    method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'}),
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),
  }));
  if(typeof value.access_token!=='string')throw Error('calendar_unavailable');
  return value.access_token as string;
}
export function availableSlots(busy:Busy[],now=new Date()) {
  const candidates=[];
  // Build UTC candidates then inspect Chicago local time, including DST transitions.
  const start=new Date(now);start.setUTCMinutes(0,0,0);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const format=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  for(let offset=0;offset<30*48;offset++){
    const slot=new Date(start.getTime()+offset*30*60000);
    if(slot<=now)continue;
    const p=Object.fromEntries(format.formatToParts(slot).map(x=>[x.type,x.value]));
    const day=p.year+'-'+p.month+'-'+p.day;
    if(day===today||['Sat','Sun'].includes(p.weekday)||Number(p.hour)<9||Number(p.hour)>=16)continue;
    const end=new Date(slot.getTime()+20*60000);
    // A 10-minute buffer after every slot is respected across all calendars.
    if(busy.some(b=>Date.parse(b.start)<end.getTime()+10*60000&&Date.parse(b.end)+10*60000>slot.getTime()))continue;
    candidates.push({start:slot.toISOString(),end:end.toISOString(),label:new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(slot)});
    if(candidates.length===120)break;
  }
  return candidates;
}
export async function calendarAvailability(config:CalendarConfig,fetcher:Fetcher=fetch,now=new Date()) {
  const token=await accessToken(config,fetcher);
  const end=new Date(now.getTime()+31*86400000);
  const data=await json(await fetcher('https://www.googleapis.com/calendar/v3/freeBusy',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({timeMin:now.toISOString(),timeMax:end.toISOString(),timeZone:zone,items:config.busyCalendarIds.map(id=>({id}))}),
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),
  }));
  const busy:Busy[]=[];
  for(const id of config.busyCalendarIds){
    const value=data.calendars?.[id];
    if(!value||value.errors?.length||!Array.isArray(value.busy))throw Error('calendar_unavailable');
    for(const b of value.busy){if(!Number.isFinite(Date.parse(b.start))||!Number.isFinite(Date.parse(b.end))||Date.parse(b.end)<=Date.parse(b.start))throw Error('calendar_unavailable');busy.push(b);}
  }
  return {timezone:zone,duration:20,slots:availableSlots(busy,now)};
}
export async function createResearchEvent(config:CalendarConfig,input:{id:string;start:string;end:string;firstName:string},fetcher:Fetcher=fetch) {
  const token=await accessToken(config,fetcher);
  const base='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(config.calendarId)+'/events';
  const response=await fetcher(base+'?sendUpdates=none',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({id:input.id,summary:'TXKPRO Workforce Research Interview',description:'Research interview with '+input.firstName+'. Confirmation is sent separately via Twilio Email.',start:{dateTime:input.start,timeZone:zone},end:{dateTime:input.end,timeZone:zone}}),
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),
  });
  // Deterministic event IDs allow recovery after an uncertain prior insert.
  const data=response.status===409?await json(await fetcher(base+'/'+input.id,{headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)})):await json(response);
  if(data.id!==input.id||data.status==='cancelled'||Date.parse(data.start?.dateTime)!==Date.parse(input.start)||Date.parse(data.end?.dateTime)!==Date.parse(input.end))throw Error('calendar_unavailable');
  return {eventId:input.id};
}
