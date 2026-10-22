import templates from './email-templates.json' with {type:'json'};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={student:'Student / learner',parent:'Parent / guardian',employer:'Employer',instructor:'Instructor / educator',community:'Community partner',other:'Other',all:'Test recipient'};
export const emailTemplates=templates;
export function renderEmailPreview(template,index){
 const vars={first_name:'Mark',email:'sample@example.invalid',email_or_not_provided:'sample@example.invalid',role_label:labels[template.role],subscriber_id:'SAMPLE-SUBSCRIBER',participant_id:'SAMPLE-PARTICIPANT',booking_id:'SAMPLE-BOOKING',booking_date:'SAMPLE DATE — no interview booked',booking_time:'SAMPLE TIME — no interview booked',answers_json:'{"preview":"No survey answers have been submitted."}'};
 const replace=value=>String(value||'').replace(/\{\{([^}]+)\}\}/g,(_,key)=>{if(!Object.hasOwn(vars,key))throw Error('Unknown template variable');return vars[key];});
 const destinations={survey:'https://txkpro.com/survey?role='+encodeURIComponent(template.role==='all'?'other':template.role),booking:'https://txkpro.com/booking?role='+encodeURIComponent(template.role==='all'?'other':template.role),home:'https://txkpro.com/workforce'};
 const links=[];
 const button=(label,target)=>{
  if(!label&&!target)return '';
  if(!label||!Object.hasOwn(destinations,target))throw Error('Invalid CTA');
  const href=destinations[target];links.push(href);
  return `<p style="margin:20px 0"><a href="${escape(href)}" style="display:inline-block;padding:12px 18px;background:#1173d4;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">${escape(replace(label))}</a></p>`;
 };
 const subject=`[TEST ${index+1}/${templates.length}] ${template.role} — ${replace(template.subject)}`;
 if(subject.length>200)throw Error('Subject too long');
 const heading=replace(template.heading)||'TXKPRO Workforce notification';
 const body=replace(template.body);
 const html=`<!doctype html><html lang="en"><body style="margin:0;background:#f4f4f1;color:#111;font:16px/1.6 Arial,sans-serif"><table role="presentation" style="width:100%;max-width:640px;margin:24px auto;background:#fff;border:1px solid #dedede;border-radius:12px"><tr><td style="padding:28px"><p style="font-size:12px;color:#626262">TEST EMAIL ${index+1}/${templates.length} · ${escape(template.role)} · ${escape(template.template_key)}</p><p style="padding:12px;background:#f4f4f1;font-size:13px">Preview only. No signup, survey, or interview was created. Dates and record IDs are sample data. Buttons open the native TXKPRO pages.</p><h1 style="font-size:26px;line-height:1.2">${escape(heading)}</h1><p>${escape(body).replaceAll('\n','<br>')}</p>${button(template.primary_cta_label,template.primary_cta_target)}${button(template.secondary_cta_label,template.secondary_cta_target)}<hr style="border:0;border-top:1px solid #dedede;margin-top:28px"><p style="font-size:12px;color:#626262">Qalori, LLC dba TXKPRO · Greater Texarkana<br><a href="https://txkpro.com/unsubscribe">Email preferences</a> · <a href="https://txkpro.com/privacy">Privacy</a></p></td></tr></table></body></html>`;
 const text=`TEST EMAIL ${index+1}/${templates.length}. No signup, survey or interview was created.\n\n${heading}\n\n${body}\n\n${links.join('\n')}\nEmail preferences: https://txkpro.com/unsubscribe`;
 for(const match of html.matchAll(/href="([^"]+)"/g)){
  const url=new URL(match[1].replaceAll('&amp;','&'));if(url.origin!=='https://txkpro.com')throw Error('Non-TXKPRO CTA');
 }
 if(/\{\{[^}]+\}\}/.test(html+subject)||/script\.google|googleusercontent/.test(html))throw Error('Unresolved legacy template');
 return {subject,html,text,links};
}
