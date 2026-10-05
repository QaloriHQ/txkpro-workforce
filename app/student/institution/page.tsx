import Link from "next/link";
import { requireStudentContext } from "@/lib/student/auth";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import { StudentWorkspaceNav } from "@/components/student/workspace-nav";
import { InstitutionDirectory, type DirectoryData } from "@/components/classes/directory";
import { classRpc } from "@/lib/classes/server";
export const dynamic="force-dynamic";
export default async function Directory() {
  const context=await requireStudentContext(); const data=await classRpc<DirectoryData>("institution_connections");
  return <><StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName}/><StudentWorkspaceNav active="workspace"/><main className="page-wrap student-training-page"><h1>My institution</h1><Link className="button" href="/student/classes">My classes</Link><InstitutionDirectory data={data}/></main></>;
}
