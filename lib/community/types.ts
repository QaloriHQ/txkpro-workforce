export type CommunityFilter = "recent" | "following" | "nearby" | "topic";

export type CommunityPost = {
  id: string;
  postType: "post" | "article" | "update";
  authorUserId: string;
  authorName: string;
  authorImageUrl: string | null;
  authorProfilePath: string | null;
  authorHeadline: string | null;
  title: string | null;
  body: string;
  media: string[];
  topic: string | null;
  location: string | null;
  publishedAt: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewerLiked: boolean;
  viewerShared: boolean;
  viewerReposted: boolean;
  viewerSaved: boolean;
  viewerFollowsAuthor: boolean;
  isOwn: boolean;
};

export type CommunityComment = {
  id: string;
  authorUserId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  authorName: string;
  authorImageUrl: string | null;
  authorProfilePath: string | null;
  isOwn: boolean;
};

export type FeedCursor = { published_at: string; profile_post_id: string };
export type CommunityFeedResult = {
  items: CommunityPost[];
  nextCursor: FeedCursor | null;
  nearbyConfigured: boolean;
};
