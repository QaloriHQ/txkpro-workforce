
create or replace function security.workforce_public_slugify(
  p_value text,
  p_fallback text default 'item'
)
returns text
language sql
immutable
set search_path=''
as $$
  select coalesce(
    nullif(
      trim(
        both '-' from regexp_replace(
          lower(coalesce(p_value,'')),
          '[^a-z0-9]+',
          '-',
          'g'
        )
      ),
      ''
    ),
    p_fallback
  );
$$;

create or replace function security.employer_certification_public_path(
  p_credential_id text,
  p_issuer_name text,
  p_certification_title text
)
returns text
language sql
immutable
set search_path=''
as $$
  select '/credentials/' ||
    security.workforce_public_slugify(p_issuer_name,'employer') ||
    '/' ||
    security.workforce_public_slugify(
      p_certification_title,
      'certification'
    ) ||
    '-' ||
    security.workforce_public_slugify(
      lower(coalesce(p_credential_id,'credential')),
      'credential'
    );
$$;

create or replace function security.sync_employer_certification_public_page(
  p_certification_award_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_award public.wf_employer_certification_awards%rowtype;
  v_page public.wf_public_pages%rowtype;
  v_student public.wf_student_profiles%rowtype;
  v_student_page public.wf_public_pages%rowtype;
  v_issuer_name text;
  v_title text;
  v_description text;
  v_course_title text;
  v_learner_name text;
  v_path text;
  v_slug text;
  v_old_path text;
  v_action text;
begin
  select * into v_award
  from public.wf_employer_certification_awards a
  where a.certification_award_id=p_certification_award_id;

  if not found then
    raise exception 'Employer Certification award not found';
  end if;

  select * into v_student
  from public.wf_student_profiles s
  where s.student_id=v_award.student_id;

  select * into v_student_page
  from public.wf_public_pages p
  where p.entity_type='student'
    and p.entity_id=v_award.student_id
    and p.publication_status='published'
    and p.visibility in ('public','unlisted')
  limit 1;

  v_issuer_name:=coalesce(
    nullif(btrim(v_award.verification_metadata->>'issuerNameSnapshot'),''),
    'Employer'
  );
  v_title:=coalesce(
    nullif(btrim(v_award.verification_metadata->>'certificationTitleSnapshot'),''),
    'Employer Certification'
  );
  v_description:=nullif(
    btrim(v_award.verification_metadata->>'certificationDescriptionSnapshot'),
    ''
  );
  v_course_title:=coalesce(
    nullif(btrim(v_award.verification_metadata->>'courseTitleSnapshot'),''),
    'Employer Training'
  );

  v_learner_name:=coalesce(
    nullif(btrim(v_student_page.display_name),''),
    nullif(
      btrim(
        concat_ws(
          ' ',
          nullif(btrim(coalesce(v_student.first_name_public,'')),''),
          nullif(btrim(coalesce(v_student.last_initial_public,'')),'')
        )
      ),
      ''
    ),
    'Credential holder'
  );

  v_path:=security.employer_certification_public_path(
    v_award.credential_id,
    v_issuer_name,
    v_title
  );
  v_slug:=split_part(v_path,'/',4);

  select * into v_page
  from public.wf_public_pages p
  where p.entity_type='credential'
    and p.entity_id=v_award.certification_award_id
  for update;

  if not found then
    insert into public.wf_public_pages(
      public_page_id,
      entity_type,
      entity_id,
      owner_user_id,
      parent_public_page_id,
      slug,
      canonical_path,
      visibility,
      publication_status,
      robots_index,
      robots_follow,
      display_name,
      headline,
      summary,
      share_image_url,
      seo_title,
      meta_description,
      structured_data_override,
      locale,
      published_at,
      created_at,
      updated_at
    ) values(
      security.new_legacy_id('PUB'),
      'credential',
      v_award.certification_award_id,
      v_student.user_id,
      null,
      v_slug,
      v_path,
      'public',
      'published',
      false,
      true,
      v_title,
      v_issuer_name || ' Employer Certification',
      coalesce(
        v_description,
        'Employer-issued certification based on passed ' ||
          v_course_title || ' completion evidence.'
      ),
      '/og/txkpro-workforce.jpg',
      v_title || ' — ' || v_learner_name,
      'Verify ' || v_learner_name || '''s ' || v_title ||
        ' issued by ' || v_issuer_name || '.',
      jsonb_build_object(
        'credentialCategory','Employer Certification',
        'evidenceCategory','employer_training',
        'technicalSkillVerified',false
      ),
      'en-US',
      v_award.issued_at,
      now(),
      now()
    )
    returning * into v_page;

    v_action:='EMPLOYER_CERTIFICATION_PUBLIC_PAGE_PUBLISHED';
    v_old_path:=null;
  else
    v_old_path:=v_page.canonical_path;

    if v_old_path is distinct from v_path then
      update public.wf_public_page_redirects
      set to_path=v_path,
          active=true
      where public_page_id=v_page.public_page_id
        and from_path<>v_path;

      insert into public.wf_public_page_redirects(
        redirect_id,
        public_page_id,
        from_path,
        to_path,
        status_code,
        active,
        created_at
      ) values(
        security.new_legacy_id('RED'),
        v_page.public_page_id,
        v_old_path,
        v_path,
        308,
        true,
        now()
      )
      on conflict(from_path)
      do update set
        public_page_id=excluded.public_page_id,
        to_path=excluded.to_path,
        status_code=excluded.status_code,
        active=true;
    end if;

    update public.wf_public_pages
    set slug=v_slug,
        canonical_path=v_path,
        owner_user_id=coalesce(owner_user_id,v_student.user_id),
        display_name=v_title,
        headline=v_issuer_name || ' Employer Certification',
        summary=coalesce(
          v_description,
          'Employer-issued certification based on passed ' ||
            v_course_title || ' completion evidence.'
        ),
        share_image_url=coalesce(share_image_url,'/og/txkpro-workforce.jpg'),
        seo_title=v_title || ' — ' || v_learner_name,
        meta_description='Verify ' || v_learner_name || '''s ' || v_title ||
          ' issued by ' || v_issuer_name || '.',
        structured_data_override=coalesce(structured_data_override,'{}'::jsonb)
          || jsonb_build_object(
            'credentialCategory','Employer Certification',
            'evidenceCategory','employer_training',
            'technicalSkillVerified',false
          ),
        published_at=coalesce(published_at,v_award.issued_at),
        updated_at=now()
    where public_page_id=v_page.public_page_id
    returning * into v_page;

    v_action:=case
      when v_old_path is distinct from v_path
        then 'EMPLOYER_CERTIFICATION_PUBLIC_PATH_UPDATED'
      else 'EMPLOYER_CERTIFICATION_PUBLIC_PAGE_SYNCED'
    end;
  end if;

  insert into public.platform_audit_events(
    actor_auth_user_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    source,
    employer_id,
    student_id,
    result,
    before_json,
    after_json,
    metadata
  ) values(
    null,
    null,
    v_action,
    'public_page',
    v_page.public_page_id,
    'workforce-public-credential',
    v_award.employer_id,
    v_award.student_id,
    'success',
    case
      when v_old_path is null then null
      else jsonb_build_object('canonicalPath',v_old_path)
    end,
    jsonb_build_object(
      'canonicalPath',v_page.canonical_path,
      'visibility',v_page.visibility,
      'publicationStatus',v_page.publication_status,
      'robotsIndex',v_page.robots_index
    ),
    jsonb_build_object(
      'credentialId',v_award.credential_id,
      'certificationAwardId',v_award.certification_award_id,
      'evidenceCategory','employer_training',
      'technicalSkillVerified',false,
      'source','W11-09B'
    )
  );

  return jsonb_build_object(
    'publicPageId',v_page.public_page_id,
    'canonicalPath',v_page.canonical_path,
    'visibility',v_page.visibility,
    'publicationStatus',v_page.publication_status,
    'robotsIndex',v_page.robots_index
  );
end;
$$;

create or replace function security.employer_certification_public_page_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform security.sync_employer_certification_public_page(
    new.certification_award_id
  );
  return new;
end;
$$;

drop trigger if exists trg_wf_employer_certification_public_page
  on public.wf_employer_certification_awards;

create trigger trg_wf_employer_certification_public_page
after insert or update of verification_metadata,status,issued_at,expires_at,revoked_at
on public.wf_employer_certification_awards
for each row
execute function security.employer_certification_public_page_trigger();

create or replace function public.employer_certification_public_verify(
  p_lookup text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_lookup text:=btrim(coalesce(p_lookup,''));
  v_page public.wf_public_pages%rowtype;
  v_redirect public.wf_public_page_redirects%rowtype;
  v_award public.wf_employer_certification_awards%rowtype;
  v_student public.wf_student_profiles%rowtype;
  v_student_page public.wf_public_pages%rowtype;
  v_employer_page public.wf_public_pages%rowtype;
  v_course_page public.wf_public_pages%rowtype;
  v_issuer_name text;
  v_learner_name text;
  v_title text;
  v_description text;
  v_course_title text;
  v_course_version integer;
  v_completed_at text;
  v_expected_digest text;
  v_stored_digest text;
begin
  if v_lookup='' then
    return jsonb_build_object('found',false);
  end if;

  if left(v_lookup,1)='/' then
    select r.* into v_redirect
    from public.wf_public_page_redirects r
    join public.wf_public_pages p
      on p.public_page_id=r.public_page_id
    where r.from_path=v_lookup
      and r.active=true
      and p.entity_type='credential'
      and p.publication_status='published'
      and p.visibility in ('public','unlisted')
    limit 1;

    if found then
      select * into v_page
      from public.wf_public_pages p
      where p.public_page_id=v_redirect.public_page_id;

      return jsonb_build_object(
        'found',true,
        'redirectPath',v_page.canonical_path
      );
    end if;

    select * into v_page
    from public.wf_public_pages p
    where p.entity_type='credential'
      and p.canonical_path=v_lookup
    limit 1;

    if not found then
      return jsonb_build_object('found',false);
    end if;

    select * into v_award
    from public.wf_employer_certification_awards a
    where a.certification_award_id=v_page.entity_id;
  else
    select * into v_award
    from public.wf_employer_certification_awards a
    where lower(a.credential_id)=lower(v_lookup)
    limit 1;

    if not found then
      return jsonb_build_object(
        'found',false,
        'credentialId',v_lookup
      );
    end if;

    select * into v_page
    from public.wf_public_pages p
    where p.entity_type='credential'
      and p.entity_id=v_award.certification_award_id
    limit 1;
  end if;

  if v_page.public_page_id is null
     or v_page.publication_status<>'published'
     or v_page.visibility not in ('public','unlisted') then
    return jsonb_build_object(
      'found',false,
      'credentialId',case
        when v_award.credential_id is null then v_lookup
        else v_award.credential_id
      end
    );
  end if;

  select * into v_student
  from public.wf_student_profiles s
  where s.student_id=v_award.student_id;

  select * into v_student_page
  from public.wf_public_pages p
  where p.entity_type='student'
    and p.entity_id=v_award.student_id
    and p.publication_status='published'
    and p.visibility in ('public','unlisted')
  limit 1;

  select * into v_employer_page
  from public.wf_public_pages p
  where p.entity_type='employer'
    and p.entity_id=v_award.employer_id
    and p.publication_status='published'
    and p.visibility in ('public','unlisted')
  limit 1;

  select * into v_course_page
  from public.wf_public_pages p
  where p.entity_type='course'
    and p.entity_id=v_award.micro_cert_id
    and p.publication_status='published'
    and p.visibility in ('public','unlisted')
  limit 1;

  v_issuer_name:=coalesce(
    nullif(btrim(v_award.verification_metadata->>'issuerNameSnapshot'),''),
    'Employer'
  );
  v_learner_name:=coalesce(
    nullif(btrim(v_student_page.display_name),''),
    nullif(
      btrim(
        concat_ws(
          ' ',
          nullif(btrim(coalesce(v_student.first_name_public,'')),''),
          nullif(btrim(coalesce(v_student.last_initial_public,'')),'')
        )
      ),
      ''
    ),
    'Credential holder'
  );
  v_title:=coalesce(
    nullif(btrim(v_award.verification_metadata->>'certificationTitleSnapshot'),''),
    v_page.display_name,
    'Employer Certification'
  );
  v_description:=coalesce(
    nullif(btrim(v_award.verification_metadata->>'certificationDescriptionSnapshot'),''),
    nullif(btrim(v_page.summary),'')
  );
  v_course_title:=coalesce(
    nullif(btrim(v_award.verification_metadata->>'courseTitleSnapshot'),''),
    'Employer Training'
  );
  v_course_version:=coalesce(
    nullif(v_award.verification_metadata->>'courseVersionNumber','')::integer,
    1
  );
  v_completed_at:=nullif(v_award.evidence->>'completedAt','');

  v_expected_digest:=security.employer_certification_digest(
    v_award.credential_id,
    v_award.employer_id,
    v_award.student_id,
    v_award.certification_definition_id,
    v_award.completion_id,
    v_award.micro_cert_version_id,
    v_award.issued_at,
    v_award.expires_at
  );
  v_stored_digest:=v_award.verification_metadata->>'issuanceDigest';

  return jsonb_build_object(
    'found',true,
    'canonicalPath',v_page.canonical_path,
    'credentialId',v_award.credential_id,
    'status',security.employer_certification_effective_status(
      v_award.status,
      v_award.expires_at
    ),
    'issuedAt',v_award.issued_at,
    'expiresAt',v_award.expires_at,
    'revokedAt',v_award.revoked_at,
    'issuer',jsonb_build_object(
      'name',v_issuer_name,
      'publicPath',v_employer_page.canonical_path
    ),
    'learner',jsonb_build_object(
      'name',v_learner_name,
      'publicPath',v_student_page.canonical_path
    ),
    'certification',jsonb_build_object(
      'title',v_title,
      'description',v_description,
      'definitionVersion',coalesce(
        nullif(v_award.verification_metadata->>'certificationVersion','')::integer,
        1
      )
    ),
    'course',jsonb_build_object(
      'title',v_course_title,
      'versionNumber',v_course_version,
      'publicPath',v_course_page.canonical_path
    ),
    'evidence',jsonb_build_object(
      'type','Employer Training completion',
      'category','employer_training',
      'outcome','passed',
      'completedAt',v_completed_at,
      'summary',
        'Completed the issuer''s required Employer Training for the exact course version shown on this credential.',
      'technicalSkillVerified',false
    ),
    'verification',jsonb_build_object(
      'integrityVerified',coalesce(v_stored_digest=v_expected_digest,false),
      'method','TXKPRO canonical credential record'
    ),
    'page',jsonb_build_object(
      'visibility',v_page.visibility,
      'robotsIndex',v_page.robots_index,
      'robotsFollow',v_page.robots_follow,
      'locale',v_page.locale,
      'seoTitle',v_page.seo_title,
      'metaDescription',v_page.meta_description,
      'shareImageUrl',v_page.share_image_url
    )
  );
end;
$$;

revoke all on function security.workforce_public_slugify(text,text)
  from public,anon,authenticated;
revoke all on function security.employer_certification_public_path(text,text,text)
  from public,anon,authenticated;
revoke all on function security.sync_employer_certification_public_page(text)
  from public,anon,authenticated;
revoke all on function security.employer_certification_public_page_trigger()
  from public,anon,authenticated;

grant execute on function security.workforce_public_slugify(text,text)
  to service_role;
grant execute on function security.employer_certification_public_path(text,text,text)
  to service_role;
grant execute on function security.sync_employer_certification_public_page(text)
  to service_role;
grant execute on function security.employer_certification_public_page_trigger()
  to service_role;

revoke all on function public.employer_certification_public_verify(text)
  from public,anon,authenticated;
grant execute on function public.employer_certification_public_verify(text)
  to service_role;

do $$
declare
  v_award record;
begin
  for v_award in
    select certification_award_id
    from public.wf_employer_certification_awards
  loop
    perform security.sync_employer_certification_public_page(
      v_award.certification_award_id
    );
  end loop;
end;
$$;

comment on function public.employer_certification_public_verify(text) is
  'W11-09B service-role-only curated public Employer Certification verifier. HTTP pages may be unauthenticated, but private Workforce tables and this RPC remain inaccessible to anon/authenticated roles.';
comment on function security.sync_employer_certification_public_page(text) is
  'W11-09B public credential page synchronizer. Creates a stable human-readable page, defaults shareability to public but noindex, preserves explicit page visibility/index controls on subsequent sync, and records 308 redirects when canonical slugs change.';
