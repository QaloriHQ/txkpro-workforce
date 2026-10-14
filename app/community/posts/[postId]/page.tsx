import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCommunityPostView } from "@/components/community/public-community-post";
import { publicCommunityPost } from "@/lib/community/public-repository";
import { publicPageMetadata } from "@/lib/public/seo";
export const dynamic="force-dynamic";
type Props={params:Promise<{postId:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const post=await publicCommunityPost((await params).postId);if(!post.found||!post.canonicalPath)return{title:"Community post unavailable",robots:{index:false,follow:false}};
  return publicPageMetadata({title:post.title||`${post.authorName} on TXKPRO`,description:(post.body||"").slice(0,160),path:post.canonicalPath,index:post.robotsIndex,follow:post.robotsFollow,image:post.media?.[0],type:"website"});}
export default async function PublicPostPage({params}:Props){const post=await publicCommunityPost((await params).postId);if(!post.found||!post.canonicalPath)notFound();return <PublicCommunityPostView post={post}/>;}
