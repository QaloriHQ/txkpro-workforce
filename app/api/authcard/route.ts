import {boundedRequest,classError} from "@/lib/classes/request";
import {cardWorkspace,cardAction,editDetails,saveDetails,payment,identity,refresh,documents,paymentStatus} from "@/lib/authcard/server";
export const dynamic="force-dynamic";
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin')!==new URL(request.url).origin) throw new Response("Origin denied",{status:403});
    const input=await (await boundedRequest(request)).json();
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new Response("Request required",{status:400});
    let result;
    switch(input.op) {
      case 'workspace': result=await cardWorkspace();break;
      case 'edit': result=await editDetails();break;
      case 'details': result=await saveDetails(input);break;
      case 'payment': result=await payment();break;
      case 'status': result=await paymentStatus();break;
      case 'identity': result=await identity(input);break;
      case 'refresh': result=await refresh();break;
      case 'documents': result=await documents();break;
      case 'share':case 'decline':case 'revoke':case 'authorize':case 'deactivate': result=await cardAction(input);break;
      default: throw new Response("Unsupported operation",{status:400});
    }
    return Response.json(result,{headers:{'Cache-Control':'private, no-store'}});
  } catch(e) {return classError(e instanceof Response ? e : new Response("AuthCard request unconfirmed. Refresh the same request or contact support.",{status:503}));}
}
