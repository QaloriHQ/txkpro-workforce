import { Brand } from "@/components/brand";
import { EmployerWorkspaceNav } from "@/components/employer/workspace-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { requireEmployerContext } from "@/lib/employer/auth";
import { EmployerIntegrationsGallery } from "@/components/employer/integrations-gallery";
import "../pipelines/pipeline-editor.css";
export const dynamic="force-dynamic";
export default async function IntegrationsPage(){
 const context=await requireEmployerContext({approved:true});
 return <>
  <header className="topbar"><Brand/><EmployerWorkspaceNav active="integrations"/><ThemeToggle/><SignOutButton/></header>
  <main className="page-wrap">
   <div className="page-heading"><div><p className="eyebrow">Employer · Integrations</p><h1>Integrations</h1>
   <p className="card-sub">Connect services once, then configure their workflow components after adding them to a pipeline.</p></div></div>
   <EmployerIntegrationsGallery employerId={context.employerId}/>
  </main>
 </>;
}
