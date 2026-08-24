create index if not exists world_entities_created_by_idx on public.world_entities(created_by);
create index if not exists world_entities_source_task_idx on public.world_entities(source_task_id) where source_task_id is not null;
create index if not exists world_entity_revisions_author_idx on public.world_entity_revisions(author_id);
create index if not exists world_entity_revisions_task_idx on public.world_entity_revisions(task_id) where task_id is not null;
create index if not exists world_entity_revisions_improvement_idx on public.world_entity_revisions(daily_improvement_id) where daily_improvement_id is not null;

-- Avoid duplicate permissive SELECT policies from FOR ALL admin policies.
drop policy if exists "feature_specs_manage_admin" on public.feature_specs;
create policy "feature_specs_insert_admin" on public.feature_specs for insert to authenticated with check (private.can_manage_project(project_id));
create policy "feature_specs_update_admin" on public.feature_specs for update to authenticated using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy "feature_specs_delete_admin" on public.feature_specs for delete to authenticated using (private.can_manage_project(project_id));

drop policy if exists "repository_context_manage_admin" on public.repository_context;
create policy "repository_context_insert_admin" on public.repository_context for insert to authenticated with check (private.can_manage_project(project_id));
create policy "repository_context_update_admin" on public.repository_context for update to authenticated using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy "repository_context_delete_admin" on public.repository_context for delete to authenticated using (private.can_manage_project(project_id));

drop policy if exists "project_documents_manage_admin" on public.project_documents;
create policy "project_documents_insert_admin" on public.project_documents for insert to authenticated with check (private.can_manage_project(project_id));
create policy "project_documents_update_admin" on public.project_documents for update to authenticated using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy "project_documents_delete_admin" on public.project_documents for delete to authenticated using (private.can_manage_project(project_id));

drop policy if exists "project_principles_manage_admin" on public.project_principles;
create policy "project_principles_insert_admin" on public.project_principles for insert to authenticated with check (private.can_manage_project(project_id));
create policy "project_principles_update_admin" on public.project_principles for update to authenticated using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy "project_principles_delete_admin" on public.project_principles for delete to authenticated using (private.can_manage_project(project_id));

-- Cache auth.uid() once per statement in direct RLS expressions.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "projects_create_self" on public.projects;
create policy "projects_create_self" on public.projects for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner" on public.projects for delete to authenticated
using (exists(select 1 from public.project_members pm where pm.project_id=id and pm.user_id=(select auth.uid()) and pm.role='owner'));

drop policy if exists "teams_insert_admin" on public.teams;
create policy "teams_insert_admin" on public.teams for insert to authenticated
with check (private.can_manage_project(project_id) and created_by=(select auth.uid()));

drop policy if exists "tasks_insert_member" on public.tasks;
create policy "tasks_insert_member" on public.tasks for insert to authenticated
with check (private.is_project_member(project_id) and created_by=(select auth.uid()));

drop policy if exists "tasks_delete_admin_or_creator" on public.tasks;
create policy "tasks_delete_admin_or_creator" on public.tasks for delete to authenticated
using (private.can_manage_project(project_id) or created_by=(select auth.uid()));

drop policy if exists "improvements_insert_self" on public.daily_improvements;
create policy "improvements_insert_self" on public.daily_improvements for insert to authenticated
with check (private.is_project_member(project_id) and author_id=(select auth.uid()));

drop policy if exists "improvements_update_self_or_admin" on public.daily_improvements;
create policy "improvements_update_self_or_admin" on public.daily_improvements for update to authenticated
using (author_id=(select auth.uid()) or private.can_manage_project(project_id))
with check (author_id=(select auth.uid()) or private.can_manage_project(project_id));

drop policy if exists "improvements_delete_self_or_admin" on public.daily_improvements;
create policy "improvements_delete_self_or_admin" on public.daily_improvements for delete to authenticated
using (author_id=(select auth.uid()) or private.can_manage_project(project_id));

drop policy if exists "world_entities_insert_member" on public.world_entities;
create policy "world_entities_insert_member" on public.world_entities for insert to authenticated
with check (private.is_project_member(project_id) and created_by=(select auth.uid()));

drop policy if exists "world_entities_update_author_or_admin" on public.world_entities;
create policy "world_entities_update_author_or_admin" on public.world_entities for update to authenticated
using (created_by=(select auth.uid()) or private.can_manage_project(project_id))
with check (created_by=(select auth.uid()) or private.can_manage_project(project_id));

drop policy if exists "world_entities_delete_author_or_admin" on public.world_entities;
create policy "world_entities_delete_author_or_admin" on public.world_entities for delete to authenticated
using (created_by=(select auth.uid()) or private.can_manage_project(project_id));

drop policy if exists "world_entity_revisions_insert_member" on public.world_entity_revisions;
create policy "world_entity_revisions_insert_member" on public.world_entity_revisions for insert to authenticated
with check (author_id=(select auth.uid()) and exists(select 1 from public.world_entities e where e.id=entity_id and private.is_project_member(e.project_id)));
