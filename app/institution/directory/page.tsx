import Link from "next/link";
import { requireInstitutionPageContext } from "@/lib/institution/auth";
import { InstitutionDirectory,type DirectoryData } from "@/components/classes/directory";
import { classRpc } from "@/lib/classes/server";
export const dynamic="force-dynamic";
export default async function Directory() {
  await requireInstitutionPageContext({capability:"students"}); const data=await classRpc<DirectoryData>("institution_connections");
  return <main className="page-wrap"><h1>Institution directory</h1><div className="institution-action-bar"><Link className="button" href="/institution/students">Students</Link><Link className="button" href="/institution/classes">Classes & rosters</Link></div><InstitutionDirectory data={data}/></main>;
}
