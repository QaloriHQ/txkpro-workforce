-- #368: staging-only native retention/expiry/allowance scheduler. No live provider endpoint.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('txkpro-incentives-hourly','5 * * * *','select security.incentive_tick()');
