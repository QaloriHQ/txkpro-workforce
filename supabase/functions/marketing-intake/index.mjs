/* global Deno */
/* Public bounded intake only; service credentials never enter the client or response. */
import {allowedOrigin,validate} from './contract.mjs';
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
 if(!allowedOrigin(origin))return Response.json({error:'Request is not available.'},{status:403,headers});
 Object.assign(headers,{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'600'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405,headers});
 try{
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Use JSON.'},{status:415,headers});
  if(Number(request.headers.get('content-length')||0)>4000)return Response.json({error:'Request too large.'},{status:413,headers});
  const reader=request.body?.getReader();const parts=[];let bytes=0;
  if(!reader)throw new Error('fields');
  while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>4000){await reader.cancel();return Response.json({error:'Request too large.'},{status:413,headers});}parts.push(r.value);}
  const raw=new Uint8Array(bytes);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.length;}
  let data;try{data=validate(JSON.parse(new TextDecoder().decode(raw)));}catch{return Response.json({error:'Enter a valid email, choose your role, and agree to email updates.'},{status:400,headers});}
  if(data.honeypot)return Response.json({ok:true},{status:202,headers});
  const url=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return Response.json({error:'Signup is temporarily unavailable. Please try again.'},{status:503,headers});
  const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);
  const signed=await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode(new Date().toISOString().slice(0,10)+':'+ip));
  const bucket=Array.from(new Uint8Array(signed),b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch(url+'/rest/v1/rpc/marketing_interest_submit',{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({p_product:data.product,p_email:data.email,p_role:data.role,p_origin:origin,p_bucket:bucket}),signal:AbortSignal.timeout(6000)});
  if(!response.ok){const failure=await response.json().catch(()=>({}));return Response.json({error:failure.message==='Intake limit'?'Too many attempts. Please try again later.':'Signup is temporarily unavailable. Please try again.'},{status:failure.message==='Intake limit'?429:503,headers});}
  return Response.json({ok:true},{status:202,headers});
 }catch{return Response.json({error:'Signup is temporarily unavailable. Please try again.'},{status:503,headers});}
});
