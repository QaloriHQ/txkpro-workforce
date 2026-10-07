-- Additive staging advisor remediation. Applied core migration remains immutable.
create index wf_auth_orders_actor on security.wf_auth_orders(actor);
create index wf_auth_payments_scope on security.wf_auth_payments(owner_type,owner_id);
