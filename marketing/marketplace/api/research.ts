import * as module from '../../../lib/research/http.js';
type Handler=(request:Request)=>Promise<Response>;
const handlers=('default' in module?module.default:module) as Record<string,Handler>;
const api={
 async fetch(request:Request){
  if(!['GET','POST','OPTIONS'].includes(request.method))return Response.json({ok:false,error:'Method not allowed.'},{status:405,headers:{'Cache-Control':'no-store'}});
  const handler=handlers[request.method];
  if(!handler)return Response.json({ok:false,error:'Method not allowed.'},{status:405,headers:{'Cache-Control':'no-store'}});
  // Reuse the private research service in this deployment; no external navigation/proxy.
  return handler(request);
 }
};
export default api;
