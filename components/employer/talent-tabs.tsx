import Link from "next/link";
type Tab="candidates"|"saved"|"referrals"|"interviews"|"placements";
const tabs: {key:Tab;title:string;href:string}[]=[
  {key:"candidates",title:"Candidates",href:"/employer/talent"},
  {key:"saved",title:"Saved",href:"/employer/saved"},
  {key:"referrals",title:"Referrals",href:"/employer/referrals"},
  {key:"interviews",title:"Interviews",href:"/employer/interviews"},
  {key:"placements",title:"Placements",href:"/employer/placements"},
];
export function EmployerTalentTabs({active}:{active:Tab}){
 return <nav className="ats-talent-tabs" aria-label="Talent and hiring views">
  {tabs.map(t=><Link href={t.href} key={t.key} aria-current={active===t.key?"page":undefined}
   className={"button button-small "+(active===t.key?"button-dark":"button-ghost")}>{t.title}</Link>)}
 </nav>;
}
