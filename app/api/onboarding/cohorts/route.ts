import {classRpc} from "@/lib/classes/server";
import {jsonError} from "@/lib/http";
import {boundedRequest} from "@/lib/classes/request";
export async function GET(request:Request) {try {return Response.json({data:await classRpc("onboarding_cohorts",{p_institution:new URL(request.url).searchParams.get("institutionId")})},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return jsonError(e);}}
export async function POST(request:Request) {try {const body=await (await boundedRequest(request)).json();return Response.json({data:await classRpc("cohort_assistance",{p_institution:body.institutionId})});}catch(e){return jsonError(e);}}
