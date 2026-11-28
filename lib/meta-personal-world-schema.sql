-- Deployment candidate: isolated META personal-world tables, service-role only.
begin;
create table public.mgw_accounts (
  id bigint primary key check(id>0), crystals integer not null default 100 check(crystals between 0 and 1000000),
  claimed_on date, created_at timestamptz not null default now()
);
create table public.mgw_assets (
  id uuid primary key default gen_random_uuid(), owner_id bigint not null references public.mgw_accounts(id),
  kind text not null check(kind in ('granary','school','monastery','guild')), created_at timestamptz not null default now()
);
create index mgw_assets_owner on public.mgw_assets(owner_id);
create table public.mgw_islands (
  owner_id bigint primary key references public.mgw_accounts(id), revision bigint not null default 1,
  objects jsonb not null check(jsonb_typeof(objects)='array' and jsonb_array_length(objects)<=120 and octet_length(objects::text)<=24000),
  share_code uuid unique, updated_at timestamptz not null default now()
);
create table public.mgw_offers (
  id uuid primary key default gen_random_uuid(), seller bigint not null references public.mgw_accounts(id),
  buyer bigint not null references public.mgw_accounts(id), asset_id uuid not null references public.mgw_assets(id),
  price integer not null check(price between 0 and 10000), status text not null default 'open' check(status in ('open','accepted','cancelled')),
  created_at timestamptz not null default now(), check(seller<>buyer)
);
create unique index mgw_one_open_offer on public.mgw_offers(asset_id) where status='open';
create index mgw_offer_seller on public.mgw_offers(seller,status);
create index mgw_offer_buyer on public.mgw_offers(buyer,status);
create table public.mgw_requests (
  actor bigint not null references public.mgw_accounts(id), request_id uuid not null, action text not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(actor,request_id)
);
alter table public.mgw_accounts enable row level security;
alter table public.mgw_assets enable row level security;
alter table public.mgw_islands enable row level security;
alter table public.mgw_offers enable row level security;
alter table public.mgw_requests enable row level security;
revoke all on public.mgw_accounts,public.mgw_assets,public.mgw_islands,public.mgw_offers,public.mgw_requests from public,anon,authenticated;
grant select,insert,update,delete on public.mgw_accounts,public.mgw_assets,public.mgw_islands,public.mgw_offers,public.mgw_requests to service_role;

-- Server-only transactional RPC. Caller identity is authenticated by Telegram HMAC at the API.
-- A single transaction advisory lock serializes wallet and offer mutations for this small free-tier sandbox.
create function public.mgw_action(p_actor bigint,p_request uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  result jsonb; prev record; a public.mgw_assets%rowtype; o public.mgw_offers%rowtype;
  target bigint; cost integer; k text; oid uuid; today date := (now() at time zone 'UTC')::date;
  rev bigint; published uuid; obj jsonb;
begin
  if p_actor is null or p_actor<=0 or p_request is null or p_action is null or p_data is null then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(7865042701::bigint);
  insert into public.mgw_accounts(id) values(p_actor) on conflict do nothing;
  select r.action,r.result into prev from public.mgw_requests r where actor=p_actor and request_id=p_request;
  if found then
    if prev.action<>p_action then raise exception 'REQUEST_REUSED'; end if;
    return prev.result;
  end if;
  case p_action
  when 'state' then
    return jsonb_build_object('account', (select to_jsonb(q) from (select id::text as id,crystals,claimed_on from public.mgw_accounts where id=p_actor) q),
      'assets',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,kind from public.mgw_assets where owner_id=p_actor order by created_at limit 120) q),'[]'::jsonb),
      'offers',coalesce((select jsonb_agg(to_jsonb(q)) from (select f.id,f.seller::text as seller,f.buyer::text as buyer,f.asset_id,f.price,f.status,a.kind from public.mgw_offers f join public.mgw_assets a on a.id=f.asset_id where (seller=p_actor or buyer=p_actor) and status='open' order by f.created_at desc limit 100) q),'[]'::jsonb),
      'island',(select jsonb_build_object('revision',revision,'objects',objects,'share_code',share_code) from public.mgw_islands where owner_id=p_actor));
  when 'daily' then
    update public.mgw_accounts set crystals=crystals+10,claimed_on=today where id=p_actor and claimed_on is distinct from today and crystals<=999990;
    if not found then raise exception 'DAILY_ALREADY_CLAIMED'; end if;
    result=jsonb_build_object('credited',10);
  when 'buy' then
    k=p_data->>'kind'; cost=case k when 'granary' then 20 when 'school' then 30 when 'monastery' then 40 when 'guild' then 25 else null end;
    if cost is null then raise exception 'UNKNOWN_ASSET'; end if;
    if (select count(*) from public.mgw_assets where owner_id=p_actor)>=120 then raise exception 'INVENTORY_FULL'; end if;
    update public.mgw_accounts set crystals=crystals-cost where id=p_actor and crystals>=cost;
    if not found then raise exception 'INSUFFICIENT_CRYSTALS'; end if;
    insert into public.mgw_assets(owner_id,kind) values(p_actor,k) returning id into oid;
    result=jsonb_build_object('asset_id',oid,'kind',k);
  when 'offer' then
    target=(p_data->>'buyer')::bigint; oid=(p_data->>'asset_id')::uuid; cost=(p_data->>'price')::integer;
    if target is null or target=p_actor or cost is null or cost not between 0 and 10000 or not exists(select 1 from public.mgw_accounts where id=target) then raise exception 'INVALID_OFFER'; end if;
    select * into a from public.mgw_assets where id=oid and owner_id=p_actor for update;
    if not found then raise exception 'NOT_OWNER'; end if;
    if (select count(*) from public.mgw_offers where seller=p_actor and status='open')>=20 then raise exception 'OFFER_LIMIT'; end if;
    insert into public.mgw_offers(seller,buyer,asset_id,price) values(p_actor,target,oid,cost) returning id into oid;
    result=jsonb_build_object('offer_id',oid);
  when 'accept' then
    oid=(p_data->>'offer_id')::uuid;
    select * into o from public.mgw_offers where id=oid and buyer=p_actor and status='open' for update;
    if not found then raise exception 'OFFER_NOT_OPEN'; end if;
    select * into a from public.mgw_assets where id=o.asset_id and owner_id=o.seller for update;
    if not found then raise exception 'NOT_OWNER'; end if;
    if (select count(*) from public.mgw_assets where owner_id=p_actor)>=120 then raise exception 'INVENTORY_FULL'; end if;
    update public.mgw_accounts set crystals=crystals-o.price where id=p_actor and crystals>=o.price;
    if not found then raise exception 'INSUFFICIENT_CRYSTALS'; end if;
    update public.mgw_accounts set crystals=crystals+o.price where id=o.seller and crystals<=1000000-o.price;
    if not found then raise exception 'BALANCE_LIMIT'; end if;
    update public.mgw_assets set owner_id=p_actor where id=o.asset_id;
    update public.mgw_offers set status='accepted' where id=o.id;
    result=jsonb_build_object('offer_id',o.id,'asset_id',o.asset_id,'kind',a.kind);
  when 'cancel' then
    update public.mgw_offers set status='cancelled' where id=(p_data->>'offer_id')::uuid and (seller=p_actor or buyer=p_actor) and status='open';
    if not found then raise exception 'OFFER_NOT_OPEN'; end if;
    result=jsonb_build_object('cancelled',true);
  when 'save' then
    obj=p_data->'objects'; rev=(p_data->>'revision')::bigint;
    if rev is null or rev<0 or obj is null or jsonb_typeof(obj)<>'array' or jsonb_array_length(obj)>120 or octet_length(obj::text)>24000 then raise exception 'INVALID_WORLD'; end if;
    if rev=0 then
      insert into public.mgw_islands(owner_id,objects) values(p_actor,obj) on conflict do nothing returning revision into rev;
    else
      update public.mgw_islands set objects=obj,revision=revision+1,updated_at=now() where owner_id=p_actor and revision=rev returning revision into rev;
    end if;
    if not found then raise exception 'WORLD_CONFLICT'; end if;
    result=jsonb_build_object('revision',rev);
  when 'publish' then
    update public.mgw_islands set share_code=coalesce(share_code,gen_random_uuid()) where owner_id=p_actor returning share_code into published;
    if not found then raise exception 'NO_WORLD'; end if;
    result=jsonb_build_object('share_code',published);
  when 'unpublish' then
    update public.mgw_islands set share_code=null where owner_id=p_actor;
    result=jsonb_build_object('published',false);
  when 'visit' then
    select jsonb_build_object('objects',objects,'revision',revision) into result from public.mgw_islands where share_code=(p_data->>'share_code')::uuid;
    if not found then raise exception 'WORLD_NOT_FOUND'; end if;
    return result;
  else raise exception 'UNKNOWN_ACTION';
  end case;
  insert into public.mgw_requests(actor,request_id,action,result) values(p_actor,p_request,p_action,result);
  return result;
end;
$$;
revoke all on function public.mgw_action(bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mgw_action(bigint,uuid,text,jsonb) to service_role;
commit;