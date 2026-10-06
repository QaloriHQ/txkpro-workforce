import { redirect } from "next/navigation";
import { getStudentContext } from "@/lib/student/auth";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { IncentiveWorkspace } from "@/components/pro-points/workspace";
import { RewardsPanel } from "@/components/rewards/panel";
import { rewardWorkspace } from "@/lib/rewards/server";
import { pointsWorkspace } from "@/lib/pro-points/server";
export const dynamic = "force-dynamic";
export default async function StudentPoints() {
  const context = await getStudentContext();
  if (!context) redirect("/dashboard");
  const [data, rewards] = await Promise.all([
    pointsWorkspace(),
    rewardWorkspace(),
  ]);
  return (
    <>
      <StudentWorkspaceHeader
        firstName={context.firstName}
        lastName={context.lastName}
      />
      <StudentWorkspaceNav active="workspace" />
      <main className="page-wrap student-training-page">
        <h1>Points & programs</h1>
        <p className="card-sub">
          Seasonal progress, lifetime levels and your accepted programs.
        </p>
        <IncentiveWorkspace data={data} />
        <RewardsPanel data={rewards} points={data} />
      </main>
    </>
  );
}
