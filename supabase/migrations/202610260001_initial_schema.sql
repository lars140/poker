create extension if not exists pgcrypto;

create type public.group_role as enum ('admin', 'member');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked', 'expired');
create type public.event_status as enum ('scheduled', 'completed', 'cancelled');
create type public.attendance_response as enum ('going', 'maybe', 'declined');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_ci_idx on public.profiles(lower(username));

create table public.poker_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.poker_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  archived_at timestamptz,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id, group_id);

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.poker_groups(id) on delete cascade,
  invited_by uuid not null references public.profiles(id),
  invitee_user_id uuid references public.profiles(id) on delete cascade,
  invitee_email text,
  token_hash text unique,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (invitee_user_id is not null or invitee_email is not null or token_hash is not null)
);
create index group_invitations_group_idx on public.group_invitations(group_id, status);

create table public.poker_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.poker_groups(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  description text check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  location text check (char_length(location) <= 240),
  organizer_id uuid not null references public.profiles(id),
  registration_deadline timestamptz,
  max_participants smallint check (max_participants is null or max_participants > 0),
  status public.event_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index poker_events_group_start_idx on public.poker_events(group_id, starts_at);

create table public.event_participants (
  event_id uuid not null references public.poker_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id),
  response public.attendance_response not null default 'maybe',
  responded_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_participants_attendance_idx on public.event_participants(event_id, response);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.poker_groups(id) on delete cascade,
  event_id uuid unique references public.poker_events(id) on delete set null,
  title text not null check (char_length(title) between 2 and 100),
  played_at timestamptz not null,
  participant_count smallint check (participant_count is null or participant_count between 4 and 7),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tournaments_group_date_idx on public.tournaments(group_id, played_at desc);

create table public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid not null references public.poker_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  position smallint not null check (position between 1 and 7),
  points_awarded smallint not null check (points_awarded between 0 and 18),
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id),
  unique (tournament_id, position)
);
create index tournament_results_group_user_idx on public.tournament_results(group_id, user_id, tournament_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_time_idx on public.notifications(recipient_id, created_at desc);

create or replace function public.is_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.group_members where group_id = target_group and user_id = auth.uid() and archived_at is null) $$;

create or replace function public.is_group_admin(target_group uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.group_members where group_id = target_group and user_id = auth.uid() and role = 'admin' and archived_at is null) $$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_admin(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;

create or replace function public.create_group(group_name text, group_description text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_group_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.poker_groups(name, description, created_by) values (group_name, group_description, auth.uid()) returning id into new_group_id;
  insert into public.group_members(group_id, user_id, role) values (new_group_id, auth.uid(), 'admin');
  return new_group_id;
end;
$$;

create or replace function public.accept_group_invitation(invitation_id uuid, supplied_token_hash text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare invitation public.group_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.group_invitations where id = invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() or invitation.revoked_at is not null then raise exception 'Invitation is no longer valid'; end if;
  if invitation.invitee_user_id is not null and invitation.invitee_user_id <> auth.uid() then raise exception 'Invitation belongs to another user'; end if;
  if invitation.invitee_email is not null and lower(invitation.invitee_email) <> lower((select email from auth.users where id = auth.uid())) then raise exception 'Invitation belongs to another email'; end if;
  if invitation.token_hash is not null and invitation.token_hash is distinct from supplied_token_hash then raise exception 'Invalid invitation token'; end if;
  insert into public.group_members(group_id, user_id, role) values (invitation.group_id, auth.uid(), 'member') on conflict (group_id, user_id) do nothing;
  update public.group_invitations set status = 'accepted' where id = invitation.id;
  return invitation.group_id;
end;
$$;

create or replace function public.accept_group_invitation_token(supplied_token_hash text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare invitation public.group_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.group_invitations where token_hash = supplied_token_hash for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() or invitation.revoked_at is not null then raise exception 'Invitation is no longer valid'; end if;
  insert into public.group_members(group_id, user_id, role) values (invitation.group_id, auth.uid(), 'member') on conflict (group_id, user_id) do nothing;
  update public.group_invitations set status = 'accepted' where id = invitation.id;
  return invitation.group_id;
end;
$$;

create or replace function public.administer_group_member(target_group uuid, target_user uuid, action text)
returns void language plpgsql security definer set search_path = public
as $$
declare current_role public.group_role; active_admins integer;
begin
  if auth.uid() is null or not public.is_group_admin(target_group) then raise exception 'Admin permission required'; end if;
  if action not in ('promote', 'demote', 'remove') then raise exception 'Unsupported membership action'; end if;
  perform 1 from public.poker_groups where id = target_group for update;
  select role into current_role from public.group_members where group_id = target_group and user_id = target_user and archived_at is null for update;
  if current_role is null then raise exception 'Member not found'; end if;
  if current_role = 'admin' and action in ('demote', 'remove') then
    select count(*) into active_admins from public.group_members where group_id = target_group and role = 'admin' and archived_at is null;
    if active_admins <= 1 then raise exception 'A group must retain at least one admin'; end if;
  end if;
  if action = 'promote' then update public.group_members set role = 'admin' where group_id = target_group and user_id = target_user;
  elsif action = 'demote' then update public.group_members set role = 'member' where group_id = target_group and user_id = target_user;
  else update public.group_members set archived_at = now() where group_id = target_group and user_id = target_user;
  end if;
end;
$$;

create or replace function public.create_group_invitation(target_group uuid, target_user uuid default null, target_email text default null, target_token_hash text default null, expires_on timestamptz default (now() + interval '7 days'))
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_invitation_id uuid;
begin
  if auth.uid() is null or not public.is_group_admin(target_group) then raise exception 'Admin permission required'; end if;
  if target_user is null and target_email is null and target_token_hash is null then raise exception 'An invitee or token is required'; end if;
  if expires_on <= now() then raise exception 'Expiration must be in the future'; end if;
  insert into public.group_invitations(group_id, invited_by, invitee_user_id, invitee_email, token_hash, expires_at)
  values (target_group, auth.uid(), target_user, lower(target_email), target_token_hash, expires_on)
  returning id into new_invitation_id;
  if target_user is not null then
    insert into public.notifications(recipient_id, message, link)
    values (target_user, 'You have a new poker group invitation.', '/groups/' || target_group::text);
  end if;
  return new_invitation_id;
end;
$$;

create or replace function public.respond_to_event(target_event uuid, new_response public.attendance_response)
returns void language plpgsql security definer set search_path = public
as $$
declare target_group uuid; capacity smallint; active_status public.event_status; going_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select group_id, max_participants, status into target_group, capacity, active_status from public.poker_events where id = target_event for update;
  if target_group is null or not public.is_group_member(target_group) then raise exception 'Event unavailable'; end if;
  if active_status <> 'scheduled' then raise exception 'Event is not accepting responses'; end if;
  if not exists (select 1 from public.event_participants where event_id = target_event and user_id = auth.uid() and invited_by is not null) then raise exception 'You are not invited to this event'; end if;
  if new_response = 'going' and capacity is not null then
    select count(*) into going_count from public.event_participants where event_id = target_event and response = 'going' and user_id <> auth.uid();
    if going_count >= capacity then raise exception 'Event is full'; end if;
  end if;
  insert into public.event_participants(event_id, user_id, response, responded_at)
  values (target_event, auth.uid(), new_response, now())
  on conflict (event_id, user_id) do update set response = excluded.response, responded_at = now();
end;
$$;

create or replace function public.create_poker_event(target_group uuid, event_title text, event_description text, event_starts_at timestamptz, event_location text, event_registration_deadline timestamptz, event_max_participants smallint)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_event_id uuid;
begin
  if auth.uid() is null or not public.is_group_admin(target_group) then raise exception 'Admin permission required'; end if;
  insert into public.poker_events(group_id, title, description, starts_at, location, organizer_id, registration_deadline, max_participants)
  values (target_group, event_title, event_description, event_starts_at, event_location, auth.uid(), event_registration_deadline, event_max_participants)
  returning id into new_event_id;
  return new_event_id;
end;
$$;

create or replace function public.invite_event_participants(target_event uuid, target_users uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare target_group uuid; invitee uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select group_id into target_group from public.poker_events where id = target_event and status = 'scheduled' for update;
  if target_group is null or not public.is_group_admin(target_group) then raise exception 'Admin permission required'; end if;
  if cardinality(target_users) > 100 then raise exception 'Invite list is too large'; end if;
  foreach invitee in array target_users loop
    if not exists (select 1 from public.group_members where group_id = target_group and user_id = invitee and archived_at is null) then raise exception 'Every invitee must be an active group member'; end if;
    insert into public.event_participants(event_id, user_id, invited_by, response)
    values (target_event, invitee, auth.uid(), 'maybe')
    on conflict (event_id, user_id) do update set invited_by = auth.uid();
    insert into public.notifications(recipient_id, message, link)
    values (invitee, 'You are invited to a poker event.', '/groups/' || target_group::text || '/events/' || target_event::text);
  end loop;
end;
$$;

create or replace function public.update_poker_event(target_event uuid, event_title text, event_description text, event_starts_at timestamptz, event_location text, event_registration_deadline timestamptz, event_max_participants smallint, event_status public.event_status)
returns void language plpgsql security definer set search_path = public
as $$
declare target_group uuid; previous_row public.poker_events%rowtype; going_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into previous_row from public.poker_events where id = target_event for update;
  target_group := previous_row.group_id;
  if target_group is null or not public.is_group_admin(target_group) then raise exception 'Admin permission required'; end if;
  select count(*) into going_count from public.event_participants where event_id = target_event and response = 'going';
  if event_max_participants is not null and going_count > event_max_participants then raise exception 'Capacity cannot be lower than confirmed attendance'; end if;
  update public.poker_events set title = event_title, description = event_description, starts_at = event_starts_at,
    location = event_location, registration_deadline = event_registration_deadline,
    max_participants = event_max_participants, status = event_status, updated_at = now()
  where id = target_event;
  if row(previous_row.title, previous_row.description, previous_row.starts_at, previous_row.location, previous_row.max_participants, previous_row.status)
     is distinct from row(event_title, event_description, event_starts_at, event_location, event_max_participants, event_status) then
    insert into public.notifications(recipient_id, message, link)
    select ep.user_id,
      case when event_status = 'cancelled' then 'A poker event was cancelled: ' || event_title else 'A poker event was updated: ' || event_title end,
      '/groups/' || target_group::text || '/events/' || target_event::text
    from public.event_participants ep where ep.event_id = target_event;
  end if;
end;
$$;

create or replace function public.create_tournament(target_group uuid, tournament_title text, tournament_played_at timestamptz, target_event uuid default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_tournament_id uuid;
begin
  if auth.uid() is null or not public.is_group_admin(target_group) then raise exception 'Admin permission required'; end if;
  if target_event is not null and not exists (select 1 from public.poker_events where id = target_event and group_id = target_group) then raise exception 'Event must belong to this group'; end if;
  insert into public.tournaments(group_id, event_id, title, played_at)
  values (target_group, target_event, tournament_title, tournament_played_at)
  returning id into new_tournament_id;
  return new_tournament_id;
end;
$$;

create or replace function public.finalize_tournament(target_tournament uuid, placements jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare t public.tournaments%rowtype; result_count integer; distinct_users integer; distinct_positions integer; min_position integer; max_position integer;
begin
  select * into t from public.tournaments where id = target_tournament for update;
  if t.id is null or not public.is_group_admin(t.group_id) then raise exception 'Tournament unavailable'; end if;
  if t.finalized_at is not null then raise exception 'Tournament already finalized'; end if;
  if jsonb_typeof(placements) <> 'array' then raise exception 'Placements must be an array'; end if;
  result_count := jsonb_array_length(placements);
  if result_count < 4 or result_count > 7 then raise exception 'Tournament must have 4 to 7 participants'; end if;
  select count(distinct (p->>'user_id')), count(distinct (p->>'position')::integer), min((p->>'position')::integer), max((p->>'position')::integer)
    into distinct_users, distinct_positions, min_position, max_position from jsonb_array_elements(placements) p;
  if distinct_users <> result_count or distinct_positions <> result_count or min_position <> 1 or max_position <> result_count then raise exception 'Every participant and finishing position must be unique and complete'; end if;
  if exists (select 1 from jsonb_array_elements(placements) p where not exists (select 1 from public.group_members gm where gm.group_id = t.group_id and gm.user_id = (p->>'user_id')::uuid)) then raise exception 'Every player must belong to this group'; end if;
  insert into public.tournament_results(tournament_id, group_id, user_id, position, points_awarded)
  select t.id, t.group_id, (p->>'user_id')::uuid, (p->>'position')::smallint,
    case result_count
      when 4 then (array[10,6,3,1])[(p->>'position')::integer]
      when 5 then (array[12,8,5,2,0])[(p->>'position')::integer]
      when 6 then (array[15,10,6,3,1,0])[(p->>'position')::integer]
      when 7 then (array[18,12,8,4,2,1,0])[(p->>'position')::integer]
    end
  from jsonb_array_elements(placements) p;
  update public.tournaments set participant_count = result_count, finalized_at = now(), finalized_by = auth.uid(), updated_at = now() where id = target_tournament;
  update public.poker_events set status = 'completed', updated_at = now() where id = t.event_id;
end;
$$;

create or replace function public.correct_tournament_results(target_tournament uuid, placements jsonb)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.tournaments t where t.id = target_tournament and public.is_group_admin(t.group_id) for update) then raise exception 'Tournament unavailable'; end if;
  if not exists (select 1 from public.tournaments where id = target_tournament and finalized_at is not null) then raise exception 'Tournament is not finalized'; end if;
  delete from public.tournament_results where tournament_id = target_tournament;
  update public.tournaments set finalized_at = null, finalized_by = null where id = target_tournament;
  perform public.finalize_tournament(target_tournament, placements);
end;
$$;

create or replace function public.keep_group_admin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'admin' and old.archived_at is null and (new.role <> 'admin' or new.archived_at is not null) and not exists (
    select 1 from public.group_members where group_id = old.group_id and user_id <> old.user_id and role = 'admin' and archived_at is null
  ) then raise exception 'A group must retain at least one admin'; end if;
  return new;
end;
$$;
create trigger group_members_keep_admin before update on public.group_members for each row execute function public.keep_group_admin();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, username, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'player_' || substr(new.id::text, 1, 8)), coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.refresh_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.refresh_updated_at();
create trigger poker_groups_updated_at before update on public.poker_groups for each row execute function public.refresh_updated_at();
create trigger poker_events_updated_at before update on public.poker_events for each row execute function public.refresh_updated_at();
create trigger tournaments_updated_at before update on public.tournaments for each row execute function public.refresh_updated_at();

alter table public.profiles enable row level security;
alter table public.poker_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.poker_events enable row level security;
alter table public.event_participants enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_results enable row level security;
alter table public.notifications enable row level security;

create policy "Profiles visible to self and group peers" on public.profiles for select to authenticated using (id = auth.uid() or exists (select 1 from public.group_members mine join public.group_members theirs on mine.group_id = theirs.group_id where mine.user_id = auth.uid() and theirs.user_id = profiles.id and mine.archived_at is null and theirs.archived_at is null));
create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Members view groups" on public.poker_groups for select to authenticated using (public.is_group_member(id));
create policy "Admins update groups" on public.poker_groups for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy "Members view memberships" on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy "Admins manage memberships" on public.group_members for all to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "Users view own or admins view group invitations" on public.group_invitations for select to authenticated using (invitee_user_id = auth.uid() or lower(invitee_email) = lower(coalesce(auth.jwt()->>'email', '')) or public.is_group_admin(group_id));
create policy "Admins manage group invitations" on public.group_invitations for all to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "Members view events" on public.poker_events for select to authenticated using (public.is_group_member(group_id));
create policy "Admins manage events" on public.poker_events for all to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "Members view event participants" on public.event_participants for select to authenticated using (exists (select 1 from public.poker_events e where e.id = event_id and public.is_group_member(e.group_id)));
create policy "Admins manage event invitations" on public.event_participants for all to authenticated using (exists (select 1 from public.poker_events e where e.id = event_id and public.is_group_admin(e.group_id))) with check (exists (select 1 from public.poker_events e where e.id = event_id and public.is_group_admin(e.group_id)));
create policy "Members view tournaments" on public.tournaments for select to authenticated using (public.is_group_member(group_id));
create policy "Admins manage tournaments" on public.tournaments for all to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "Members view group results" on public.tournament_results for select to authenticated using (public.is_group_member(group_id));
create policy "Recipients read notifications" on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy "Recipients update notifications" on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create or replace view public.group_leaderboard with (security_invoker = true) as
select r.group_id, r.user_id, p.username, p.display_name, p.avatar_url,
  dense_rank() over (partition by r.group_id order by sum(r.points_awarded) desc, count(*) filter (where r.position = 1) desc, count(*) filter (where r.position = 2) desc, count(*) filter (where r.position = 3) desc, p.username asc) as rank,
  sum(r.points_awarded)::integer as total_points,
  count(*) filter (where r.position = 1)::integer as wins,
  count(*) filter (where r.position = 2)::integer as second_places,
  count(*) filter (where r.position = 3)::integer as third_places,
  count(*)::integer as tournaments_played,
  round(avg(r.position)::numeric, 2) as average_position
from public.tournament_results r
join public.tournaments t on t.id = r.tournament_id and t.finalized_at is not null
join public.profiles p on p.id = r.user_id
group by r.group_id, r.user_id, p.username, p.display_name, p.avatar_url;

revoke insert, update, delete on public.group_members from authenticated;
revoke insert, update, delete on public.event_participants from authenticated;
revoke insert, update, delete on public.poker_events from authenticated;
revoke insert, update, delete on public.tournaments from authenticated;
revoke insert, update, delete on public.tournament_results from authenticated;
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url) on public.profiles to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on function public.create_group(text, text) from public;
revoke all on function public.accept_group_invitation(uuid, text) from public;
revoke all on function public.accept_group_invitation_token(text) from public;
revoke all on function public.administer_group_member(uuid, uuid, text) from public;
revoke all on function public.create_group_invitation(uuid, uuid, text, text, timestamptz) from public;
revoke all on function public.respond_to_event(uuid, public.attendance_response) from public;
revoke all on function public.create_poker_event(uuid, text, text, timestamptz, text, timestamptz, smallint) from public;
revoke all on function public.invite_event_participants(uuid, uuid[]) from public;
revoke all on function public.update_poker_event(uuid, text, text, timestamptz, text, timestamptz, smallint, public.event_status) from public;
revoke all on function public.create_tournament(uuid, text, timestamptz, uuid) from public;
revoke all on function public.finalize_tournament(uuid, jsonb) from public;
revoke all on function public.correct_tournament_results(uuid, jsonb) from public;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.accept_group_invitation(uuid, text) to authenticated;
grant execute on function public.accept_group_invitation_token(text) to authenticated;
grant execute on function public.administer_group_member(uuid, uuid, text) to authenticated;
grant execute on function public.create_group_invitation(uuid, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.respond_to_event(uuid, public.attendance_response) to authenticated;
grant execute on function public.create_poker_event(uuid, text, text, timestamptz, text, timestamptz, smallint) to authenticated;
grant execute on function public.invite_event_participants(uuid, uuid[]) to authenticated;
grant execute on function public.update_poker_event(uuid, text, text, timestamptz, text, timestamptz, smallint, public.event_status) to authenticated;
grant execute on function public.create_tournament(uuid, text, timestamptz, uuid) to authenticated;
grant execute on function public.finalize_tournament(uuid, jsonb) to authenticated;
grant execute on function public.correct_tournament_results(uuid, jsonb) to authenticated;
