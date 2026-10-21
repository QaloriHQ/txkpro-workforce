export const CONSENT_TEXT='I agree to receive email updates from TXKPRO about the selected program, development progress, and availability. I can unsubscribe at any time.';
export function allowedOrigin(origin) {
 try {
  const u=new URL(origin);
  if(u.protocol!=='https:'||u.origin!==origin)return false;
  return /^(txkpro-(marketplace-marketing|workforce-marketing|marketplace-waitlist))(-[a-z0-9-]+-qaloris-projects)?\.vercel\.app$/.test(u.hostname);
 } catch {return false;}
}
export function validate(input) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('fields');
 if(input.website)return {honeypot:true};
 const roles={marketplace:['homeowner','contractor'],workforce:['student','employer','educator','community','parent','other']};
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\x00-\x1f\x7f]/.test(email)||input.consent!==true||!Object.hasOwn(roles,input.product)||!roles[input.product].includes(input.role))throw new Error('fields');
 return {product:input.product,email,role:input.role,honeypot:false};
}
