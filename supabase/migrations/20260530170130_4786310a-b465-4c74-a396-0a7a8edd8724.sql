
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  birthday date,
  status text default '',
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

-- auto create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'avatar_url');
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

grant select, insert, update on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;

-- conversation_members
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

grant select, insert, delete on public.conversation_members to authenticated;
grant all on public.conversation_members to service_role;
alter table public.conversation_members enable row level security;

-- security definer helper to avoid recursive RLS
create or replace function public.is_member(_conv uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members where conversation_id=_conv and user_id=_user);
$$;

create policy "members read conversations" on public.conversations for select to authenticated
  using (public.is_member(id, auth.uid()));
create policy "any auth create conversation" on public.conversations for insert to authenticated
  with check (auth.uid() = created_by);
create policy "members update conversation" on public.conversations for update to authenticated
  using (public.is_member(id, auth.uid()));

create policy "members read members" on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id, auth.uid()));
create policy "auth add members" on public.conversation_members for insert to authenticated
  with check (true);
create policy "leave conversation" on public.conversation_members for delete to authenticated
  using (user_id = auth.uid());

-- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text default '',
  type text not null default 'text',
  media_url text,
  pinned boolean not null default false,
  created_at timestamptz default now()
);

create index on public.messages (conversation_id, created_at desc);

grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create policy "members read messages" on public.messages for select to authenticated
  using (public.is_member(conversation_id, auth.uid()));
create policy "members send messages" on public.messages for insert to authenticated
  with check (public.is_member(conversation_id, auth.uid()) and user_id = auth.uid());
create policy "members update messages" on public.messages for update to authenticated
  using (public.is_member(conversation_id, auth.uid()));
create policy "own delete messages" on public.messages for delete to authenticated
  using (user_id = auth.uid());

-- reactions
create table public.reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

grant select, insert, delete on public.reactions to authenticated;
grant all on public.reactions to service_role;
alter table public.reactions enable row level security;

create policy "auth read reactions" on public.reactions for select to authenticated using (true);
create policy "auth add reaction" on public.reactions for insert to authenticated with check (user_id = auth.uid());
create policy "auth remove own reaction" on public.reactions for delete to authenticated using (user_id = auth.uid());

-- typing indicator (ephemeral, but we store as table)
create table public.typing_indicators (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

grant select, insert, update, delete on public.typing_indicators to authenticated;
grant all on public.typing_indicators to service_role;
alter table public.typing_indicators enable row level security;

create policy "members read typing" on public.typing_indicators for select to authenticated
  using (public.is_member(conversation_id, auth.uid()));
create policy "self upsert typing" on public.typing_indicators for insert to authenticated
  with check (user_id = auth.uid());
create policy "self update typing" on public.typing_indicators for update to authenticated
  using (user_id = auth.uid());
create policy "self delete typing" on public.typing_indicators for delete to authenticated
  using (user_id = auth.uid());

-- album
create table public.album_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_url text not null,
  caption text default '',
  created_at timestamptz default now()
);

grant select, insert, delete on public.album_photos to authenticated;
grant all on public.album_photos to service_role;
alter table public.album_photos enable row level security;

create policy "auth read album" on public.album_photos for select to authenticated using (true);
create policy "auth upload album" on public.album_photos for insert to authenticated with check (user_id = auth.uid());
create policy "own delete album" on public.album_photos for delete to authenticated using (user_id = auth.uid());

-- realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.typing_indicators;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.album_photos;

-- storage buckets
insert into storage.buckets (id, name, public) values
  ('avatars','avatars', true),
  ('media','media', true),
  ('album','album', true)
on conflict (id) do nothing;

create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "auth upload avatars" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update avatars" on storage.objects for update to authenticated using (bucket_id='avatars' and owner = auth.uid());

create policy "public read media" on storage.objects for select using (bucket_id = 'media');
create policy "auth upload media" on storage.objects for insert to authenticated with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public read album" on storage.objects for select using (bucket_id = 'album');
create policy "auth upload album obj" on storage.objects for insert to authenticated with check (bucket_id = 'album' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner delete album obj" on storage.objects for delete to authenticated using (bucket_id='album' and owner = auth.uid());
