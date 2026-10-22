import * as module from '../../../lib/research/http.js';
type Handler=(request:Request)=>Promise<Response>;
// Accept the ESM namespace (and CommonJS interop in alternate local toolchains).
const handlers=('default' in module?module.default:module) as Record<string,Handler>;
export default {
 async fetch(request:Request){
  if(!['GET','POST','OPTIONS'].includes(request.method))return Response.json({ok:false,error:'Method not allowed.'},{status:405,headers:{'Cache-Control':'no-store'}});
  const handler=handlers[request.method];
  if(!handler)return Response.json({ok:false,error:'Method not allowed.'},{status:405,headers:{'Cache-Control':'no-store'}});
  return handler(request);
 }
};
