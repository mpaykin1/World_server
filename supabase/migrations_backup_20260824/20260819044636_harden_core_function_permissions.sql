alter function public.set_updated_at() set search_path = '';

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.add_project_owner() from public, anon, authenticated;

-- These helper functions are intentionally callable only by roles that need them
-- for RLS evaluation. Remove PUBLIC defaults explicitly.
revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.can_manage_project(uuid) from public;
revoke all on function public.is_project_public(uuid) from public;

grant execute on function public.is_project_member(uuid) to anon, authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
grant execute on function public.is_project_public(uuid) to anon, authenticated;
