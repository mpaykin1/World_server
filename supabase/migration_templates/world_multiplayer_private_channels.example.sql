-- EXAMPLE ONLY: merge with the EXISTING multiplayer room-membership schema.
-- Do NOT apply blindly. Prefer the existing room-membership table discovered by multiplayer-contract-discovery.cjs.
-- Supabase production channels should be private and authorized on realtime.messages.
-- Replace public.EXISTING_ROOM_MEMBERS and columns below with the real existing table/columns.
/*
create policy "world room members receive broadcast presence"
on realtime.messages for select to authenticated
using (exists (
  select 1 from public.EXISTING_ROOM_MEMBERS m
  where m.user_id=(select auth.uid())
    and m.topic=(select realtime.topic())
    and realtime.messages.extension in ('broadcast','presence')
));
create policy "world room members send broadcast presence"
on realtime.messages for insert to authenticated
with check (exists (
  select 1 from public.EXISTING_ROOM_MEMBERS m
  where m.user_id=(select auth.uid())
    and m.topic=(select realtime.topic())
    and realtime.messages.extension in ('broadcast','presence')
));
*/
