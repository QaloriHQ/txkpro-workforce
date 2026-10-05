import { redirect } from "next/navigation";
import { getStudentContext } from "@/lib/student/auth";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { StudentComingSoon } from "@/components/student/coming-soon";
export const dynamic = "force-dynamic";
export default async function Page() {
 const context = await getStudentContext();
 if (!context) redirect("/dashboard");
 return <><StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName} /><StudentWorkspaceNav active="feed" /><main className="page-wrap student-training-page"><div className="page-heading"><div><p className="eyebrow">Your workforce community</p><h1>Program Feed</h1><p className="card-sub">A private place to share questions, projects and updates with your program. This community is not available yet.</p></div></div><StudentComingSoon title="Program Feed" description="A private place to share questions, projects and updates with your program. This community is not available yet." /></main></>;
}
