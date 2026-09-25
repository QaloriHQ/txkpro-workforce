create index if not exists wf_profile_reviews_reviewer_user_idx
  on public.wf_profile_reviews(reviewer_user_id);

create index if not exists wf_profile_posts_author_user_idx
  on public.wf_profile_posts(author_user_id);

create index if not exists wf_profile_post_comments_author_user_idx
  on public.wf_profile_post_comments(author_user_id);

create index if not exists wf_profile_post_comments_author_page_idx
  on public.wf_profile_post_comments(author_public_page_id)
  where author_public_page_id is not null;

create index if not exists wf_profile_post_reactions_actor_user_idx
  on public.wf_profile_post_reactions(actor_user_id);

create index if not exists wf_profile_post_shares_actor_user_idx
  on public.wf_profile_post_shares(actor_user_id);
