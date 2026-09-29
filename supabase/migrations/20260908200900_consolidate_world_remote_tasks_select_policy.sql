-- Preserve the previous permissive OR semantics in one SELECT policy.
drop policy if exists world_remote_tasks_select_own on public.world_remote_tasks;
drop policy if exists world_remote_tasks_worker_select on public.world_remote_tasks;
create policy world_remote_tasks_select_authorized
on public.world_remote_tasks
for select
to anon, authenticated
using (
  requester_uid = (select auth.uid())
  or (select private.remote_inbox_worker_authorized())
);