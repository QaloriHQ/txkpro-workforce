import questions from '../../marketing/research/questions.json' with {type:'json'};

export const roles = ['student','parent','employer','instructor','community','other'] as const;
export type ResearchRole = typeof roles[number];
export const surveys = questions;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function email(value: unknown) {
  if(typeof value!=='string'||value.length>254||! /^[^\s@<>\x00-\x1f\x7f]+@[^\s@<>\x00-\x1f\x7f]+\.[^\s@<>\x00-\x1f\x7f]+$/.test(value.trim())) throw Error('email');
  return value.trim().toLowerCase();
}
export function researchRole(value: unknown): ResearchRole {
  if(!roles.includes(value as ResearchRole))throw Error('role');
  return value as ResearchRole;
}
export function surveyInput(value: Record<string,unknown>) {
  const role=researchRole(value.role);
  if(typeof value.requestId!=='string'||!uuidPattern.test(value.requestId))throw Error('request');
  if(!value.answers||typeof value.answers!=='object'||Array.isArray(value.answers))throw Error('answers');
  const source=value.answers as Record<string,unknown>;
  if(Object.keys(source).length!==surveys[role].length)throw Error('answers');
  const answers: Record<string,string>={};
  for(const question of surveys[role]){
    const answer=source[question.id];
    if(typeof answer!=='string'||!question.options.includes(answer))throw Error('answers');
    answers[question.id]=answer;
  }
  return {requestId:value.requestId,role,answers};
}
export function bookingInput(value: Record<string,unknown>) {
  const role=researchRole(value.role);
  const address=email(value.email);
  if(typeof value.firstName!=='string'||!value.firstName.trim()||value.firstName.length>80||/[\x00-\x1f\x7f]/.test(value.firstName))throw Error('name');
  if(typeof value.requestId!=='string'||!uuidPattern.test(value.requestId))throw Error('request');
  if(typeof value.start!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/.test(value.start)||!Number.isFinite(Date.parse(value.start)))throw Error('start');
  if(value.consent!==true&&value.consent!==false)throw Error('consent');
  return {requestId:value.requestId,role,email:address,firstName:value.firstName.trim(),start:value.start,consent:value.consent};
}
export function allowedResearchOrigin(origin: string) {
  try {
    const url=new URL(origin);
    return url.origin===origin&&url.protocol==='https:'&&(
      ['txkpro.com','www.txkpro.com','workforce.txkpro.com'].includes(url.hostname)||
      /^txkpro-(marketplace-marketing|workforce-marketing)(-[a-z0-9-]+-qaloris-projects)?\.vercel\.app$/.test(url.hostname)
    );
  }catch{return false;}
}
