// Operator-only: use a private env file; never pass credentials in command arguments.
import fs from 'node:fs';
import path from 'node:path';
import {calendarConfig,oauthConfig,regions,exchangeAuthorizationCode,accessToken,bookingRequest,calendarAvailability} from '../lib/research/calendar.ts';
const [action,output]=process.argv.slice(2);
try{
 if(action==='exchange'){
  const {ZOHO_BOOKINGS_CLIENT_ID:clientId,ZOHO_BOOKINGS_CLIENT_SECRET:clientSecret,ZOHO_BOOKINGS_REGION:region,ZOHO_BOOKINGS_AUTHORIZATION_CODE:code}=process.env;
  if(!clientId||!clientSecret||!Object.hasOwn(regions,region)||!code||!output||!path.isAbsolute(output))throw Error('configuration');
  // Open exclusively before consuming the single-use code; never overwrite a private file.
  const fd=fs.openSync(output,'wx',0o600);
  try{
   const value=await exchangeAuthorizationCode({clientId,clientSecret,region},code);
   if(!/^[A-Za-z0-9._~-]{10,2048}$/.test(value.refreshToken))throw Error('calendar_unavailable');
   fs.writeFileSync(fd,'ZOHO_BOOKINGS_REFRESH_TOKEN='+value.refreshToken+'\n');
  }catch(error){fs.closeSync(fd);fs.unlinkSync(output);throw error;}
  fs.closeSync(fd);console.log('Refresh token saved to the requested private file. Add it to Vercel, then remove the authorization-code variable and private files. No credentials printed.');
 }else if(action==='discover'){
  const config=oauthConfig(process.env);if(!config)throw Error('configuration');
  const token=await accessToken(config);
  const workspaces=await bookingRequest(config,token,'workspaces',{});
  const list=workspaces.data;if(!Array.isArray(list)||list.length>25)throw Error('calendar_unavailable');
  const result=[];
  for(const w of list){
   if(typeof w.id!=='string'||!/^\d{5,30}$/.test(w.id))throw Error('calendar_unavailable');
   const services=await bookingRequest(config,token,'services',{workspace_id:w.id});
   if(!Array.isArray(services.data))throw Error('calendar_unavailable');
   for(const s of services.data)result.push({workspaceId:w.id,serviceId:s.id,name:s.name,duration:s.duration,buffer:s.buffertime,type:s.service_type,price:s.price,assignedStaffIds:s.assigned_staffs});
  }
  console.log(JSON.stringify({services:result},null,2));
 }else if(action==='check'){
  const config=calendarConfig(process.env);if(!config||!config.emailDisabled)throw Error('configuration');
  const result=await calendarAvailability(config);
  console.log(JSON.stringify({ok:true,provider:'zoho',date:result.date,timezone:result.timezone,duration:result.duration,slotCount:result.slots.length}));
 }else throw Error('configuration');
}catch(error){
 const reason=error instanceof Error&&error.message==='configuration'?'Missing or invalid setup fields. See docs/zoho-research-bookings.md.':'Zoho setup failed. No credentials or provider payload printed. Check region, code expiry, scopes and service settings. Do not retry an uncertain token exchange blindly.';
 console.error(reason);process.exitCode=1;
}
