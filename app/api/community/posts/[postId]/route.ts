import { publicCommunityPost } from "@/lib/community/public-repository";
export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{postId:string}>}){try{const post=await publicCommunityPost((await params).postId);return post.found?Response.json(post,{headers:{"Cache-Control":"public, max-age=0, must-revalidate"}}):Response.json({error:"Post not found."},{status:404,headers:{"Cache-Control":"no-store"}});}catch{return Response.json({error:"Community post is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});}}
