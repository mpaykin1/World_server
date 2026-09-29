-- Reconciliation mutates shared worker health and has no worker token parameter.
revoke execute on function public.browser_ai_reconcile_worker_health(integer) from public, anon, authenticated;
grant execute on function public.browser_ai_reconcile_worker_health(integer) to service_role;