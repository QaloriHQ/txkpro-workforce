import {getAccountContext} from "@/lib/auth";
import {redirect} from "next/navigation";
import {ClassJoin} from "@/components/classes/join";
export const dynamic="force-dynamic";
export default async function Join({searchParams}:{searchParams:Promise<{token?:string}>}) {const {token}=await searchParams;if(!token||! /^[a-f0-9]{64}$/.test(token))return <main className="page-wrap"><p>Join link unavailable.</p></main>;if(!await getAccountContext())redirect(`/login?next=${encodeURIComponent(`/classes/join?token=${token}`)}`);return <main className="page-wrap"><ClassJoin token={token}/></main>;}
