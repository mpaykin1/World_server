-- Improve World core schema

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  skills text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  vision text,
  visibility text not null default 'public' check (visibility in ('public','private')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  focus_area text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('lead','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','review','done')),
  priority smallint not null default 3 check (priority between 1 and 5),
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_improvements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  improvement_date date not null default (now() at time zone 'utc')::date,
  title text not null,
  description text,
  impact_percent numeric(5,2) not null default 1.00 check (impact_percent > 0 and impact_percent <= 100),
  proof_url text,
  status text not null default 'submitted' check (status in ('submitted','accepted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, author_id, improvement_date)
);

create index if not exists project_members_user_id_idx on public.project_members(user_id);
create index if not exists teams_project_id_idx on public.teams(project_id);
create index if not exists team_members_user_id_idx on public.team_members(user_id);
create index if not exists tasks_project_id_status_idx on public.tasks(project_id, status);
create index if not exists tasks_assignee_id_idx on public.tasks(assignee_id);
create index if not exists daily_improvements_project_date_idx on public.daily_improvements(project_id, improvement_date desc);
create index if not exists daily_improvements_author_id_idx on public.daily_improvements(author_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.add_project_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members(project_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role in ('owner','admin')
  );
$$;

create or replace function public.is_project_public(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.visibility = 'public'
  );
$$;

revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.can_manage_project(uuid) from public;
revoke all on function public.is_project_public(uuid) from public;
grant execute on function public.is_project_member(uuid) to anon, authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
grant execute on function public.is_project_public(uuid) to anon, authenticated;

create or replace trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create or replace trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create or replace trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace trigger daily_improvements_set_updated_at
before update on public.daily_improvements
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_project_created_add_owner on public.projects;
create trigger on_project_created_add_owner
after insert on public.projects
for each row execute function public.add_project_owner();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_improvements enable row level security;

-- Profiles
create policy "profiles_read_authenticated"
on public.profiles for select
to authenticated
using (true);

create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Projects
create policy "projects_read_public_or_member"
on public.projects for select
to anon, authenticated
using (visibility = 'public' or public.is_project_member(id));

create policy "projects_create_self"
on public.projects for insert
to authenticated
with check (created_by = auth.uid());

create policy "projects_update_admin"
on public.projects for update
to authenticated
using (public.can_manage_project(id))
with check (public.can_manage_project(id));

create policy "projects_delete_owner"
on public.projects for delete
to authenticated
using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = id and pm.user_id = auth.uid() and pm.role = 'owner'
  )
);

-- Project members
create policy "project_members_read_visible_project"
on public.project_members for select
to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "project_members_insert_admin"
on public.project_members for insert
to authenticated
with check (public.can_manage_project(project_id));

create policy "project_members_update_admin"
on public.project_members for update
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy "project_members_delete_admin"
on public.project_members for delete
to authenticated
using (public.can_manage_project(project_id));

-- Teams
create policy "teams_read_visible_project"
on public.teams for select
to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "teams_insert_admin"
on public.teams for insert
to authenticated
with check (public.can_manage_project(project_id) and created_by = auth.uid());

create policy "teams_update_admin"
on public.teams for update
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));

create policy "teams_delete_admin"
on public.teams for delete
to authenticated
using (public.can_manage_project(project_id));

-- Team members
create policy "team_members_read_visible_project"
on public.team_members for select
to anon, authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = team_id
      and (public.is_project_public(t.project_id) or public.is_project_member(t.project_id))
  )
);

create policy "team_members_insert_admin"
on public.team_members for insert
to authenticated
with check (
  exists (
    select 1 from public.teams t
    where t.id = team_id and public.can_manage_project(t.project_id)
  )
);

create policy "team_members_update_admin"
on public.team_members for update
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = team_id and public.can_manage_project(t.project_id)
  )
)
with check (
  exists (
    select 1 from public.teams t
    where t.id = team_id and public.can_manage_project(t.project_id)
  )
);

create policy "team_members_delete_admin"
on public.team_members for delete
to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = team_id and public.can_manage_project(t.project_id)
  )
);

-- Tasks
create policy "tasks_read_visible_project"
on public.tasks for select
to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "tasks_insert_member"
on public.tasks for insert
to authenticated
with check (public.is_project_member(project_id) and created_by = auth.uid());

create policy "tasks_update_member"
on public.tasks for update
to authenticated
using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create policy "tasks_delete_admin_or_creator"
on public.tasks for delete
to authenticated
using (public.can_manage_project(project_id) or created_by = auth.uid());

-- Daily improvements
create policy "improvements_read_visible_project"
on public.daily_improvements for select
to anon, authenticated
using (public.is_project_public(project_id) or public.is_project_member(project_id));

create policy "improvements_insert_self"
on public.daily_improvements for insert
to authenticated
with check (public.is_project_member(project_id) and author_id = auth.uid());

create policy "improvements_update_self_or_admin"
on public.daily_improvements for update
to authenticated
using (author_id = auth.uid() or public.can_manage_project(project_id))
with check (author_id = auth.uid() or public.can_manage_project(project_id));

create policy "improvements_delete_self_or_admin"
on public.daily_improvements for delete
to authenticated
using (author_id = auth.uid() or public.can_manage_project(project_id));

create or replace view public.daily_project_progress
with (security_invoker = true)
as
select
  project_id,
  improvement_date,
  count(*) filter (where status = 'accepted') as accepted_improvements,
  count(distinct author_id) filter (where status = 'accepted') as contributors,
  coalesce(sum(impact_percent) filter (where status = 'accepted'), 0)::numeric(8,2) as progress_percent
from public.daily_improvements
group by project_id, improvement_date;

grant usage on schema public to anon, authenticated;
grant select on public.projects, public.project_members, public.teams, public.team_members, public.tasks, public.daily_improvements, public.daily_project_progress to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant insert, update, delete on public.projects, public.project_members, public.teams, public.team_members, public.tasks, public.daily_improvements to authenticated;
