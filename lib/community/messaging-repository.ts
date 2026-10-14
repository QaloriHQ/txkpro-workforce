import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DirectMessage, MessagePerson, MessagingInbox, UploadedMessageAttachment } from "@/lib/community/messaging-types";

const fail = (error:{message?:string}|null,fallback:string) => {
  const value=error?.message||"";
  if(value.includes("MESSAGE_BLOCKED"))return new Response("Messaging is unavailable for this relationship.",{status:403});
  if(value.includes("MESSAGE_REQUEST_COOLDOWN"))return new Response("This person declined the request. You can try again after 30 days.",{status:409});
  if(value.includes("INCOMING_MESSAGE_REQUEST_EXISTS"))return new Response("This person already sent you a request. Review your request inbox.",{status:409});
  if(value.includes("MESSAGE_ALREADY_CONNECTED"))return new Response("Open your existing conversation with this person.",{status:409});
  if(value.includes("NOT_FOUND")||value.includes("UNAVAILABLE"))return new Response("This message is unavailable.",{status:404});
  if(value.includes("INVALID_"))return new Response("Check the message and attachments, then try again.",{status:400});
  return new Response(fallback,{status:503});
};

async function rpc<T>(name:string,args?:Record<string,unknown>,fallback="Messaging is temporarily unavailable."){
  const client=await createServerSupabaseClient();
  const {data,error}=await client.rpc(name,args);
  if(error)throw fail(error,fallback);
  return data as T;
}

export const messagingInbox=()=>rpc<MessagingInbox>("community_messaging_inbox");
export const messagePeople=(query:string)=>rpc<MessagePerson[]>("community_message_people",{p_query:query||null});
export const createMessageRequest=(input:{recipientUserId:string;body:string;attachments:UploadedMessageAttachment[];clientKey:string})=>rpc<{requestId:string;status:string}>("community_message_request_create",{p_recipient_user_id:input.recipientUserId,p_body:input.body,p_attachments:input.attachments,p_client_key:input.clientKey},"The message request could not be sent.");
export const resolveMessageRequest=(requestId:string,decision:"accept"|"decline"|"block"|"report")=>rpc<{requestId:string;status:string;conversationId?:string}>("community_message_request_resolve",{p_request_id:requestId,p_decision:decision},"The message request could not be updated.");
export const conversationMessages=(conversationId:string)=>rpc<DirectMessage[]>("community_conversation_messages",{p_conversation_id:conversationId});
export const sendDirectMessage=(input:{conversationId:string;body:string;attachments:UploadedMessageAttachment[];clientKey:string})=>rpc<{messageId:string;sentAt:string}>("community_message_send",{p_conversation_id:input.conversationId,p_body:input.body,p_attachments:input.attachments,p_client_key:input.clientKey},"The message could not be sent.");
export const markConversationRead=(conversationId:string)=>rpc<{read:boolean}>("community_conversation_read",{p_conversation_id:conversationId});
export const redactDirectMessage=(messageId:string)=>rpc<{messageId:string;status:string}>("community_message_redact",{p_message_id:messageId},"The message could not be removed.");
export const reportDirectMessage=(messageId:string,reason:string,details?:string)=>rpc<{reported:boolean;caseId:string}>("community_message_report",{p_message_id:messageId,p_reason:reason,p_details:details||null},"The report could not be submitted.");
export const authorizedMessageAttachment=(scope:"message"|"request",id:string,index:number)=>rpc<{storagePath:string;name:string;mime:string;size:number}|null>("community_message_attachment",{p_scope:scope,p_id:id,p_index:index},"The attachment is unavailable.");
