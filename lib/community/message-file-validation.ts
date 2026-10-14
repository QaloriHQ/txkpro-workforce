export const maxMessageFileBytes=10*1024*1024;
export const messageFileTypes=new Set(["image/jpeg","image/png","image/webp","application/pdf","text/plain"]);
export function validateMessageFile(bytes:Uint8Array,mime:string){
  if(!bytes.length||bytes.length>maxMessageFileBytes)throw new Error("Attachments must be 10 MB or smaller.");
  if(!messageFileTypes.has(mime))throw new Error("Use JPG, PNG, WebP, PDF, or plain text attachments.");
  const pdf=bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==="%PDF-";
  const png=bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
  const jpg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if((mime==="application/pdf"&&!pdf)||(mime==="image/png"&&!png)||(mime==="image/jpeg"&&!jpg)||(mime==="image/webp"&&!webp))throw new Error("The attachment content does not match its file type.");
}
