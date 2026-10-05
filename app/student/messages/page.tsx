import { redirect } from "next/navigation";
import { getStudentContext } from "@/lib/student/auth";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { StudentComingSoon } from "@/components/student/coming-soon";
export const dynamic = "force-dynamic";
export default async function Page() {
 const context = await getStudentContext();
 if (!context) redirect("/dashboard");
 return <><StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} /><StudentWorkspaceNav active="messages" /><main className="page-wrap student-training-page"><div className="page-heading"><div><p className="eyebrow">Trusted workforce communication</p><h1>Messages</h1><p className="card-sub">Direct conversations tied to your workforce relationships. Messaging is not available yet.</p></div></div><StudentComingSoon title="Messages" description="Direct conversations tied to your workforce relationships. Messaging is not available yet." /></main></>;
}
