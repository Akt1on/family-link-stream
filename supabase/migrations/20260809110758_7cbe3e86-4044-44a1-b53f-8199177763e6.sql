create or replace function public.ensure_family_chat()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  conv_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id into conv_id
  from public.conversations
  where is_group = true and coalesce(name,'') = 'Семья ❤️'
  order by created_at asc
  limit 1;

  if conv_id is null then
    insert into public.conversations (is_group, name, created_by)
    values (true, 'Семья ❤️', uid)
    returning id into conv_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  select conv_id, uid
  where not exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = uid
  );

  return conv_id;
end;
$$;

grant execute on function public.ensure_family_chat() to authenticated;
