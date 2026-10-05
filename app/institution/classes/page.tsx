import {requireInstitutionPageContext} from "@/lib/institution/auth";
import {classRpc,type ClassWorkspace} from "@/lib/classes/server";
import {ClassesWorkspace} from "@/components/classes/workspace";
import {Brand} from "@/components/brand";
import {ThemeToggle} from "@/components/theme-toggle";
import Link from "next/link";
import type {DirectoryData} from "@/components/classes/directory";
export const dynamic="force-dynamic";
export default async function Classes({searchParams}:{searchParams:Promise<{offset?:string}>}){const {offset}=await searchParams;const pageOffset=Math.max(0,Math.min(100000,Number(offset)||0));await requireInstitutionPageContext({capability:"students"});const [data,directory]=await Promise.all([classRpc<ClassWorkspace>("class_workspace",{p_offset:pageOffset}),classRpc<DirectoryData>("institution_connections")]);return <><header className="workspace-topbar"><Brand/><Link className="button" href="/institution">Workspace</Link><ThemeToggle/></header><main className="page-wrap"><div className="page-heading"><div><h1>Classes & rosters</h1><p className="card-sub">Invite students across cohorts; roster enrollment requires acceptance.</p></div></div><ClassesWorkspace data={data} people={directory.people}/><nav aria-label="Class pages" className="institution-action-bar">{data.offset>0?<Link className="button" href={`/institution/classes?offset=${Math.max(0,data.offset-20)}`}>Previous classes</Link>:null}{data.hasMore?<Link className="button" href={`/institution/classes?offset=${data.offset+20}`}>Next classes</Link>:null}</nav></main></>;}
