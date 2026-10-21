/* Public community media is user-supplied HTTPS content and remains unoptimized. */
/* eslint-disable @next/next/no-img-element */
import { Fragment } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { absolutePublicUrl,serializeJsonLd } from "@/lib/public/seo";
import type { PublicCommunityPost } from "@/lib/community/public-repository";
import { CommunityRichContent } from "@/components/community/community-rich-content";
import { ArticleGallery } from "@/components/community/article-gallery";
import { SponsoredPlacement } from "@/components/ads/sponsored-placement";

export function PublicCommunityPostView({post, relatedPosts = []}:{post:PublicCommunityPost; relatedPosts?: PublicCommunityPost[]}) {
  const path=post.canonicalPath!; const title=post.title || `${post.authorName} on TXKPRO`;
  const schema={"@context":"https://schema.org","@type":post.postType==="article"?"Article":"SocialMediaPosting",headline:title,
    articleBody:post.body,datePublished:post.publishedAt,dateModified:post.updatedAt,url:absolutePublicUrl(path),
    author:{"@type":"Person",name:post.authorName,url:post.authorProfilePath?absolutePublicUrl(post.authorProfilePath):undefined},
    comment:(post.comments||[]).map(c=>({"@type":"Comment",text:c.body,dateCreated:c.createdAt,author:{"@type":"Person",name:c.authorName}}))};
  return <><header className="topbar"><Brand/><div className="header-actions"><ThemeToggle/><Link href="/login">Sign in</Link></div></header>
    <main className={`page-wrap community-public-page ${post.postType==="article"?"community-public-article":""}`}>
      <nav aria-label="Breadcrumb"><Link href="/">TXKPRO</Link><span> / </span><Link href="/community">Community</Link><span> / </span><span aria-current="page">{post.postType==="article"?"Article":"Post"}</span></nav>
      <article className="community-public-card"><header><span className="community-avatar">{post.authorImageUrl?<img src={post.authorImageUrl} alt=""/>:(post.authorName||"TX").slice(0,2).toUpperCase()}</span><div>{post.authorProfilePath?<Link href={post.authorProfilePath}><strong>{post.authorName}</strong></Link>:<strong>{post.authorName}</strong>}{post.authorHeadline?<p>{post.authorHeadline}</p>:null}<p>{new Date(post.publishedAt!).toLocaleDateString("en-US",{dateStyle:"long"})}{post.location?` · ${post.location}`:""}</p></div></header>
        <div className="community-public-copy"><span className="community-content-type">{post.postType}</span>{post.topic?<span className="community-topic">{post.topic}</span>:null}<h1>{title}</h1>{post.postType==="article"?<CommunityRichContent content={post.body||""}/>:<>{(post.body||"").split(/\n{2,}/).map((block,index)=><p key={index}>{block}</p>)}</>}</div>
        <div className="community-public-gallery">{(post.media||[]).map((url,index)=><img className="community-post-media" src={url} alt={`Attachment ${index+1} for ${title}`} key={url}/>)}</div>
        <footer>{post.likeCount||0} likes · {(post.comments||[]).length} comments · {post.shareCount||0} shares</footer>
      </article>
      <section className="community-public-comments" aria-labelledby="public-comments"><h2 id="public-comments">Comments</h2>{post.comments?.length?post.comments.map((c,index)=><Fragment key={c.id}><article key={c.id} className={c.parentId?"community-comment community-comment-reply":"community-comment"}><div><strong>{c.authorProfilePath?<Link href={c.authorProfilePath}>{c.authorName}</Link>:c.authorName}</strong><p>{c.body}</p><small>{new Date(c.createdAt).toLocaleDateString()}</small></div></article>{index===2?<SponsoredPlacement placement="in_comments" contentId={post.id} itemCount={post.comments?.length || 0} listKind="comments" listItemIds={post.comments?.map(comment => comment.id)} />:null}</Fragment>):<p className="card-sub">No public comments yet.</p>}<p><Link className="button" href="/login">Sign in to participate</Link></p></section>
      {relatedPosts.length ? <section><h2>More articles</h2><ArticleGallery items={relatedPosts} contentId={post.id} /></section> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(schema)}}/>
    </main></>;
}
