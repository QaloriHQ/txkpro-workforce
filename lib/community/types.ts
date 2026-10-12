export type CommunityFilter = "recent" | "following" | "nearby" | "topic";

export type CommunityPost = {
  id: string;
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
  viewerSaved: boolean;
  viewerFollowsAuthor: boolean;
  isOwn: boolean;
};

export type FeedCursor = { published_at: string; profile_post_id: string };
export type CommunityFeedResult = {
  items: CommunityPost[];
  nextCursor: FeedCursor | null;
  nearbyConfigured: boolean;
};
