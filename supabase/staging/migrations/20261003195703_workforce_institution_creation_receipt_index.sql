-- Cover the receipt foreign key without changing the applied provisioning migration.
begin;
create index wf_institution_creation_receipts_institution_idx
 on public.wf_institution_creation_receipts(institution_id);
commit;
