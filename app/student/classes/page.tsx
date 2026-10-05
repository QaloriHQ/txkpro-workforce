import {requireStudentContext} from "@/lib/student/auth";
import {StudentWorkspaceHeader} from "@/components/student/workspace-header";
import {StudentWorkspaceNav} from "@/components/student/workspace-nav";
import {classRpc,type ClassWorkspace} from "@/lib/classes/server";
import Link from "next/link";
export const dynamic="force-dynamic";
export default async function Classes(){const context=await requireStudentContext();const data=await classRpc<ClassWorkspace>("class_workspace");return <><StudentWorkspaceHeader firstName={context.firstName} lastName={context.lastName}/><StudentWorkspaceNav active="workspace"/><main className="page-wrap student-training-page"><h1>My classes</h1><Link className="button" href="/student/institution">Institution directory</Link>{data.classes.map(c=><section className="card" key={c.classId}><h2>{c.name}</h2><p>{c.status} · {c.courseName}</p><p>Instructors: {c.instructors?.map(i=>i.name).join(", ")}</p><p>{c.enrollments.map(e=>e.status).join(", ")}</p></section>)}{!data.classes.length?<p>No accepted classes yet. Use your instructor’s email or QR invitation to join.</p>:null}</main></>;}
