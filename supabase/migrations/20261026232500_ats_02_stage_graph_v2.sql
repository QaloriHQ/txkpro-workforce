-- ATS-02 UX: backwards-compatible stage-aware graph publication.
-- This changes only the graph validator implementation; existing v1 published
-- snapshots and job->version bindings are not modified.
create or replace function security.wf_ats_graph_publishable(p_graph jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
#variable_conflict use_column
declare
  v_nodes jsonb; v_edges jsonb; n jsonb; e jsonb; v_id text; v_kind text;
  v_ids text[] := array[]::text[]; v_remaining text[]; v_selected text;
  v_starts integer := 0; v_ends integer := 0; v_count integer;
  v_stage_ids text[] := array[]::text[]; v_stage jsonb; v_stage_id text;
  v_entry text; v_allowed text[] := array[
    'start','end','application_form','assessment','video','consent',
    'contract_signature','interview_in_person','interview_online',
    'background_check','fingerprinting','drug_test','manual_review','decision','notification'];
begin
  if p_graph is null or jsonb_typeof(p_graph) is distinct from 'object'
    or p_graph->>'schemaVersion' not in ('1','2')
    or jsonb_typeof(p_graph->'nodes') is distinct from 'array'
    or jsonb_typeof(p_graph->'edges') is distinct from 'array' then return false; end if;
  v_nodes:=p_graph->'nodes'; v_edges:=p_graph->'edges';
  if jsonb_array_length(v_nodes) not between 2 and 100 or jsonb_array_length(v_edges)>200 then return false; end if;
  if p_graph->>'schemaVersion'='2' then
    if jsonb_typeof(p_graph->'stages') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_graph->'stages') not between 1 and 30 then return false; end if;
    for v_stage in select value from jsonb_array_elements(p_graph->'stages') loop
      v_stage_id:=v_stage->>'id';
      if v_stage_id is null or v_stage_id !~ '^[a-z][a-z0-9_-]{0,59}
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    if v_id is null or v_id !~ '^[a-z][a-z0-9_-]{0,59}$' or v_id=any(v_ids)
      or not (v_kind=any(v_allowed))
      or jsonb_typeof(n->'config') is distinct from 'object'
      or jsonb_typeof(n->'required') is distinct from 'boolean'
      or jsonb_typeof(n->'candidateVisible') is distinct from 'boolean'
      or jsonb_typeof(n->'x') is distinct from 'number'
      or jsonb_typeof(n->'y') is distinct from 'number' then return false; end if;
    if exists(select 1 from jsonb_object_keys(n->'config') k
      where k not in ('instructions','url','fields','disclosure','expectedMinutes','ownerRole','targetHours')) then return false; end if;
    if v_kind='consent' and nullif(btrim(n->'config'->>'disclosure'),'') is null then return false; end if;
    if v_kind<>'application_form' and n->'config' ? 'fields' then return false; end if;
    if v_kind='application_form' and n->'config' ? 'fields' and
      (jsonb_typeof(n->'config'->'fields') is distinct from 'array' or jsonb_array_length(n->'config'->'fields')>35) then return false; end if;
    if p_graph->>'schemaVersion'='2' and v_kind not in ('start','end') and
      (n->>'stageId' is null or not (n->>'stageId'=any(v_stage_ids))) then return false; end if;
    v_ids:=array_append(v_ids,v_id);
    if v_kind='start' then v_starts:=v_starts+1; end if;
    if v_kind='end' then v_ends:=v_ends+1; end if;
  end loop;
  if v_starts<>1 or v_ends<1 or not v_entry=any(v_ids) then return false; end if;
  if not exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=v_entry and n->>'kind'='start') then return false; end if;
  for e in select value from jsonb_array_elements(v_edges) loop
    if e->>'source' is null or e->>'target' is null
      or not (e->>'source'=any(v_ids)) or not (e->>'target'=any(v_ids))
      or e->>'source'=e->>'target' then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'source' and n->>'kind'='end') then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'target' and n->>'kind'='start') then return false; end if;
  end loop;
  if (select count(distinct e->>'id') from jsonb_array_elements(v_edges) e)<>jsonb_array_length(v_edges) then return false; end if;
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    v_count:=(select count(*) from jsonb_array_elements(v_edges) e where e->>'source'=v_id);
    if v_kind='end' and v_count<>0 then return false; end if;
    if v_kind not in ('end','decision') and v_count<>1 then return false; end if;
    if v_kind='decision' then
      if v_count<>2 or
        (select count(distinct e->>'outcome') from jsonb_array_elements(v_edges) e
         where e->>'source'=v_id and e->>'outcome' in ('yes','no'))<>2 then return false; end if;
    elsif exists(select 1 from jsonb_array_elements(v_edges) e where e->>'source'=v_id and e ? 'outcome') then return false;
    end if;
    if v_kind<>'start' and not exists (
      select 1 from jsonb_array_elements(v_edges) e where e->>'target'=v_id
    ) then return false; end if;
  end loop;
  -- Topological elimination rejects cycles. Acyclic + unique Start +
  -- incoming edge for all other nodes ensures full reachability.
  v_remaining:=v_ids;
  while cardinality(v_remaining)>0 loop
    v_selected:=null;
    select candidate into v_selected from unnest(v_remaining) candidate
      where not exists (select 1 from jsonb_array_elements(v_edges) e
        where e->>'target'=candidate and e->>'source'=any(v_remaining))
      limit 1;
    if v_selected is null then return false; end if;
    v_remaining:=array_remove(v_remaining,v_selected);
  end loop;
  return true;
exception when others then
  raise;
end;
$$;

        or v_stage_id=any(v_stage_ids)
        or nullif(btrim(v_stage->>'name'),'') is null
        or length(v_stage->>'name')>80
        or (v_stage->>'color') !~ '^#[0-9a-fA-F]{6}
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    if v_id is null or v_id !~ '^[a-z][a-z0-9_-]{0,59}$' or v_id=any(v_ids)
      or not (v_kind=any(v_allowed))
      or jsonb_typeof(n->'config') is distinct from 'object'
      or jsonb_typeof(n->'required') is distinct from 'boolean'
      or jsonb_typeof(n->'candidateVisible') is distinct from 'boolean'
      or jsonb_typeof(n->'x') is distinct from 'number'
      or jsonb_typeof(n->'y') is distinct from 'number' then return false; end if;
    if exists(select 1 from jsonb_object_keys(n->'config') k
      where k not in ('instructions','url','fields','disclosure','expectedMinutes')) then return false; end if;
    if v_kind='consent' and nullif(btrim(n->'config'->>'disclosure'),'') is null then return false; end if;
    if v_kind<>'application_form' and n->'config' ? 'fields' then return false; end if;
    if v_kind='application_form' and n->'config' ? 'fields' and
      (jsonb_typeof(n->'config'->'fields') is distinct from 'array' or jsonb_array_length(n->'config'->'fields')>35) then return false; end if;
    v_ids:=array_append(v_ids,v_id);
    if v_kind='start' then v_starts:=v_starts+1; end if;
    if v_kind='end' then v_ends:=v_ends+1; end if;
  end loop;
  if v_starts<>1 or v_ends<1 or not v_entry=any(v_ids) then return false; end if;
  if not exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=v_entry and n->>'kind'='start') then return false; end if;
  for e in select value from jsonb_array_elements(v_edges) loop
    if e->>'source' is null or e->>'target' is null
      or not (e->>'source'=any(v_ids)) or not (e->>'target'=any(v_ids))
      or e->>'source'=e->>'target' then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'source' and n->>'kind'='end') then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'target' and n->>'kind'='start') then return false; end if;
  end loop;
  if (select count(distinct e->>'id') from jsonb_array_elements(v_edges) e)<>jsonb_array_length(v_edges) then return false; end if;
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    v_count:=(select count(*) from jsonb_array_elements(v_edges) e where e->>'source'=v_id);
    if v_kind='end' and v_count<>0 then return false; end if;
    if v_kind not in ('end','decision') and v_count<>1 then return false; end if;
    if v_kind='decision' then
      if v_count<>2 or
        (select count(distinct e->>'outcome') from jsonb_array_elements(v_edges) e
         where e->>'source'=v_id and e->>'outcome' in ('yes','no'))<>2 then return false; end if;
    elsif exists(select 1 from jsonb_array_elements(v_edges) e where e->>'source'=v_id and e ? 'outcome') then return false;
    end if;
    if v_kind<>'start' and not exists (
      select 1 from jsonb_array_elements(v_edges) e where e->>'target'=v_id
    ) then return false; end if;
  end loop;
  -- Topological elimination rejects cycles. Acyclic + unique Start +
  -- incoming edge for all other nodes ensures full reachability.
  v_remaining:=v_ids;
  while cardinality(v_remaining)>0 loop
    v_selected:=null;
    select candidate into v_selected from unnest(v_remaining) candidate
      where not exists (select 1 from jsonb_array_elements(v_edges) e
        where e->>'target'=candidate and e->>'source'=any(v_remaining))
      limit 1;
    if v_selected is null then return false; end if;
    v_remaining:=array_remove(v_remaining,v_selected);
  end loop;
  return true;
exception when others then
  raise;
end;
$$;

        or jsonb_typeof(v_stage->'sortOrder') is distinct from 'number'
        or (v_stage->>'sortOrder')::integer not between 0 and 29
        or jsonb_typeof(v_stage->'candidateVisible') is distinct from 'boolean'
        or v_stage->>'completionRule' not in ('all_required','manual')
      then return false; end if;
      v_stage_ids:=array_append(v_stage_ids,v_stage_id);
    end loop;
    if (select count(distinct s->>'sortOrder') from jsonb_array_elements(p_graph->'stages') s)
      <>jsonb_array_length(p_graph->'stages') then return false; end if;
  end if;
  v_entry:=p_graph->>'entryNodeId';
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    if v_id is null or v_id !~ '^[a-z][a-z0-9_-]{0,59}$' or v_id=any(v_ids)
      or not (v_kind=any(v_allowed))
      or jsonb_typeof(n->'config') is distinct from 'object'
      or jsonb_typeof(n->'required') is distinct from 'boolean'
      or jsonb_typeof(n->'candidateVisible') is distinct from 'boolean'
      or jsonb_typeof(n->'x') is distinct from 'number'
      or jsonb_typeof(n->'y') is distinct from 'number' then return false; end if;
    if exists(select 1 from jsonb_object_keys(n->'config') k
      where k not in ('instructions','url','fields','disclosure','expectedMinutes')) then return false; end if;
    if v_kind='consent' and nullif(btrim(n->'config'->>'disclosure'),'') is null then return false; end if;
    if v_kind<>'application_form' and n->'config' ? 'fields' then return false; end if;
    if v_kind='application_form' and n->'config' ? 'fields' and
      (jsonb_typeof(n->'config'->'fields') is distinct from 'array' or jsonb_array_length(n->'config'->'fields')>35) then return false; end if;
    v_ids:=array_append(v_ids,v_id);
    if v_kind='start' then v_starts:=v_starts+1; end if;
    if v_kind='end' then v_ends:=v_ends+1; end if;
  end loop;
  if v_starts<>1 or v_ends<1 or not v_entry=any(v_ids) then return false; end if;
  if not exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=v_entry and n->>'kind'='start') then return false; end if;
  for e in select value from jsonb_array_elements(v_edges) loop
    if e->>'source' is null or e->>'target' is null
      or not (e->>'source'=any(v_ids)) or not (e->>'target'=any(v_ids))
      or e->>'source'=e->>'target' then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'source' and n->>'kind'='end') then return false; end if;
    if exists(select 1 from jsonb_array_elements(v_nodes) n
      where n->>'id'=e->>'target' and n->>'kind'='start') then return false; end if;
  end loop;
  if (select count(distinct e->>'id') from jsonb_array_elements(v_edges) e)<>jsonb_array_length(v_edges) then return false; end if;
  for n in select value from jsonb_array_elements(v_nodes) loop
    v_id:=n->>'id'; v_kind:=n->>'kind';
    v_count:=(select count(*) from jsonb_array_elements(v_edges) e where e->>'source'=v_id);
    if v_kind='end' and v_count<>0 then return false; end if;
    if v_kind not in ('end','decision') and v_count<>1 then return false; end if;
    if v_kind='decision' then
      if v_count<>2 or
        (select count(distinct e->>'outcome') from jsonb_array_elements(v_edges) e
         where e->>'source'=v_id and e->>'outcome' in ('yes','no'))<>2 then return false; end if;
    elsif exists(select 1 from jsonb_array_elements(v_edges) e where e->>'source'=v_id and e ? 'outcome') then return false;
    end if;
    if v_kind<>'start' and not exists (
      select 1 from jsonb_array_elements(v_edges) e where e->>'target'=v_id
    ) then return false; end if;
  end loop;
  -- Topological elimination rejects cycles. Acyclic + unique Start +
  -- incoming edge for all other nodes ensures full reachability.
  v_remaining:=v_ids;
  while cardinality(v_remaining)>0 loop
    v_selected:=null;
    select candidate into v_selected from unnest(v_remaining) candidate
      where not exists (select 1 from jsonb_array_elements(v_edges) e
        where e->>'target'=candidate and e->>'source'=any(v_remaining))
      limit 1;
    if v_selected is null then return false; end if;
    v_remaining:=array_remove(v_remaining,v_selected);
  end loop;
  return true;
exception when others then
  raise;
end;
$$;

revoke all on function security.wf_ats_graph_publishable(jsonb) from public,anon,authenticated;
