-- Cross-app public identity, publishing, social profile, and SEO foundation.
-- Public pages are a curated read model. Private Workforce tables remain authorization-scoped.
-- Direct anon/authenticated table access is intentionally withheld; public rendering is server-side.

create table if not exists public.wf_public_pages (
  id uuid primary key default gen_random_uuid(),
  public_page_id text not null unique default security.new_legacy_id('PUB'),
  entity_type text not null
    check (entity_type in (
      'student','educator','employer','institution',
      'course','lesson','credential','post'
    )),
  entity_id text not null,
  owner_user_id text references public.users(user_id) on delete set null,
  parent_public_page_id text references public.wf_public_pages(public_page_id) on delete set null,
  slug text not null
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  canonical_path text not null unique
    check (canonical_path ~ '^/[a-z0-9][a-z0-9/_-]*$'),
  visibility text not null default 'private'
    check (visibility in ('public','private','unlisted')),
  publication_status text not null default 'draft'
    check (publication_status in ('draft','published','unpublished')),
  robots_index boolean not null default false,
  robots_follow boolean not null default true,
  display_name text not null check (btrim(display_name) <> ''),
  headline text,
  summary text,
  profile_image_url text,
  share_image_url text,
  seo_title text,
  meta_description text,
  structured_data_override jsonb not null default '{}'::jsonb,
  locale text not null default 'en-US',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_type, entity_id)
);

create unique index if not exists wf_public_pages_parent_slug_unique
  on public.wf_public_pages(coalesce(parent_public_page_id,''), lower(slug));

create index if not exists wf_public_pages_public_index_idx
  on public.wf_public_pages(entity_type, published_at desc)
  where publication_status='published' and visibility='public' and robots_index=true;

create index if not exists wf_public_pages_owner_idx
  on public.wf_public_pages(owner_user_id)
  where owner_user_id is not null;

create index if not exists wf_public_pages_parent_idx
  on public.wf_public_pages(parent_public_page_id)
  where parent_public_page_id is not null;

create table if not exists public.wf_public_page_redirects (
  id uuid primary key default gen_random_uuid(),
  redirect_id text not null unique default security.new_legacy_id('RED'),
  public_page_id text not null
    references public.wf_public_pages(public_page_id) on delete cascade,
  from_path text not null unique
    check (from_path ~ '^/[a-z0-9][a-z0-9/_-]*$'),
  to_path text not null
    check (to_path ~ '^/[a-z0-9][a-z0-9/_-]*$'),
  status_code integer not null default 301 check (status_code in (301,308)),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists wf_public_page_redirects_page_idx
  on public.wf_public_page_redirects(public_page_id, active);

create table if not exists public.wf_public_profile_sections (
  id uuid primary key default gen_random_uuid(),
  public_profile_section_id text not null unique default security.new_legacy_id('PSEC'),
  public_page_id text not null
    references public.wf_public_pages(public_page_id) on delete cascade,
  section_key text not null check (btrim(section_key) <> ''),
  section_type text not null
    check (section_type in (
      'bio','institution','programs','specialties','credentials',
      'portfolio','reviews','posts','activity','contact','custom'
    )),
  title text,
  content jsonb not null default '{}'::jsonb,
  sequence_no integer not null default 1 check (sequence_no > 0),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(public_page_id, section_key)
);

create index if not exists wf_public_profile_sections_page_idx
  on public.wf_public_profile_sections(public_page_id, visible, sequence_no);

create table if not exists public.wf_public_profile_preferences (
  id uuid primary key default gen_random_uuid(),
  public_profile_preference_id text not null unique default security.new_legacy_id('PPREF'),
  public_page_id text not null unique
    references public.wf_public_pages(public_page_id) on delete cascade,
  show_reviews boolean not null default true,
  show_rating_summary boolean not null default true,
  show_posts boolean not null default true,
  show_activity_history boolean not null default true,
  show_like_history boolean not null default true,
  show_comment_history boolean not null default true,
  show_share_history boolean not null default true,
  show_repost_history boolean not null default true,
  show_contact_actions boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_profile_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_review_id text not null unique default security.new_legacy_id('REV'),
  target_public_page_id text not null
    references public.wf_public_pages(public_page_id) on delete cascade,
  reviewer_user_id text not null references public.users(user_id) on delete cascade,
  reviewer_public_page_id text references public.wf_public_pages(public_page_id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  review_title text,
  review_body text,
  relationship_context text,
  verified_relationship boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','published','hidden','removed')),
  moderation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_public_page_id, reviewer_user_id)
);

create index if not exists wf_profile_reviews_target_status_idx
  on public.wf_profile_reviews(target_public_page_id, status, created_at desc);
create index if not exists wf_profile_reviews_reviewer_page_idx
  on public.wf_profile_reviews(reviewer_public_page_id)
  where reviewer_public_page_id is not null;

create table if not exists public.wf_profile_posts (
  id uuid primary key default gen_random_uuid(),
  profile_post_id text not null unique default security.new_legacy_id('POST'),
  author_public_page_id text not null
    references public.wf_public_pages(public_page_id) on delete cascade,
  author_user_id text not null references public.users(user_id) on delete cascade,
  post_type text not null default 'post'
    check (post_type in ('post','article','update')),
  title text,
  body text not null check (btrim(body) <> ''),
  media jsonb not null default '[]'::jsonb,
  visibility text not null default 'public'
    check (visibility in ('public','private','unlisted')),
  status text not null default 'draft'
    check (status in ('draft','published','hidden','removed')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wf_profile_posts_author_status_idx
  on public.wf_profile_posts(author_public_page_id, status, published_at desc);

create table if not exists public.wf_profile_post_comments (
  id uuid primary key default gen_random_uuid(),
  profile_post_comment_id text not null unique default security.new_legacy_id('CMT'),
  profile_post_id text not null references public.wf_profile_posts(profile_post_id) on delete cascade,
  author_user_id text not null references public.users(user_id) on delete cascade,
  author_public_page_id text references public.wf_public_pages(public_page_id) on delete set null,
  body text not null check (btrim(body) <> ''),
  status text not null default 'published'
    check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wf_profile_post_comments_post_idx
  on public.wf_profile_post_comments(profile_post_id, status, created_at);

create table if not exists public.wf_profile_post_reactions (
  id uuid primary key default gen_random_uuid(),
  profile_post_reaction_id text not null unique default security.new_legacy_id('REACT'),
  profile_post_id text not null references public.wf_profile_posts(profile_post_id) on delete cascade,
  actor_user_id text not null references public.users(user_id) on delete cascade,
  actor_public_page_id text references public.wf_public_pages(public_page_id) on delete set null,
  reaction_type text not null default 'like'
    check (reaction_type in ('like')),
  created_at timestamptz not null default now(),
  unique(profile_post_id, actor_user_id, reaction_type)
);

create index if not exists wf_profile_post_reactions_actor_page_idx
  on public.wf_profile_post_reactions(actor_public_page_id, created_at desc)
  where actor_public_page_id is not null;

create table if not exists public.wf_profile_post_shares (
  id uuid primary key default gen_random_uuid(),
  profile_post_share_id text not null unique default security.new_legacy_id('SHR'),
  profile_post_id text not null references public.wf_profile_posts(profile_post_id) on delete cascade,
  actor_user_id text not null references public.users(user_id) on delete cascade,
  actor_public_page_id text references public.wf_public_pages(public_page_id) on delete set null,
  share_type text not null check (share_type in ('share','repost')),
  commentary text,
  created_at timestamptz not null default now(),
  unique(profile_post_id, actor_user_id, share_type)
);

create index if not exists wf_profile_post_shares_actor_page_idx
  on public.wf_profile_post_shares(actor_public_page_id, created_at desc)
  where actor_public_page_id is not null;

alter table public.wf_public_pages enable row level security;
alter table public.wf_public_page_redirects enable row level security;
alter table public.wf_public_profile_sections enable row level security;
alter table public.wf_public_profile_preferences enable row level security;
alter table public.wf_profile_reviews enable row level security;
alter table public.wf_profile_posts enable row level security;
alter table public.wf_profile_post_comments enable row level security;
alter table public.wf_profile_post_reactions enable row level security;
alter table public.wf_profile_post_shares enable row level security;

revoke all on table
  public.wf_public_pages,
  public.wf_public_page_redirects,
  public.wf_public_profile_sections,
  public.wf_public_profile_preferences,
  public.wf_profile_reviews,
  public.wf_profile_posts,
  public.wf_profile_post_comments,
  public.wf_profile_post_reactions,
  public.wf_profile_post_shares
from public, anon, authenticated;

grant all on table
  public.wf_public_pages,
  public.wf_public_page_redirects,
  public.wf_public_profile_sections,
  public.wf_public_profile_preferences,
  public.wf_profile_reviews,
  public.wf_profile_posts,
  public.wf_profile_post_comments,
  public.wf_profile_post_reactions,
  public.wf_profile_post_shares
to service_role;

comment on table public.wf_public_pages is
  'Curated public-page registry for human-readable shareable URLs and SEO. Never treat publication as authorization to private Workforce data.';
comment on column public.wf_public_pages.robots_index is
  'Controls search-engine indexing independently from shareability. Public Student profiles may still be noindex according to product policy.';
comment on table public.wf_public_profile_preferences is
  'Presentation/privacy controls for public professional profiles, including hideable activity history.';
comment on table public.wf_profile_reviews is
  'Moderated professional-profile reviews/ratings. Rating aggregates must be derived from published reviews.';
