-- Security hardening, found via Supabase's advisor lints while provisioning
-- a fresh preview/test project from these migrations:
-- handle_new_user() is a SECURITY DEFINER trigger function with no EXECUTE
-- revoke, so PostgREST auto-exposes it as a public RPC
-- (/rest/v1/rpc/handle_new_user) callable directly by anon/authenticated,
-- not just by its actual caller — the on_auth_user_created trigger on
-- auth.users, which invokes it regardless of these grants (trigger
-- invocation doesn't require the triggering role to hold EXECUTE on the
-- trigger function). Anyone could otherwise call this function directly and
-- run its logic (inserting/upserting arbitrary profiles rows) outside the
-- normal signup flow.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
