-- 20261108_accounts.sql 실행 후 적용합니다. 기존 계정·비밀번호·학습 기록은 보존합니다.
begin;
alter table public.feynloop_accounts add column if not exists nickname text;
alter table public.feynloop_accounts add column if not exists plan_preference text not null default 'free';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.feynloop_accounts'::regclass and conname='feynloop_nickname_length') then
    alter table public.feynloop_accounts add constraint feynloop_nickname_length check(nickname is null or char_length(nickname) between 1 and 24);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.feynloop_accounts'::regclass and conname='feynloop_plan_preference') then
    alter table public.feynloop_accounts add constraint feynloop_plan_preference check(plan_preference in ('free','plus'));
  end if;
end $$;

-- 현재 비밀번호를 검증한 서버만 호출. 동시 변경은 저장된 해시를 다시 확인해 차단합니다.
create or replace function public.feynloop_change_password(p_id uuid,p_expected_password_hash text,p_password_hash text,p_token_hash text,p_expires_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  perform 1 from public.feynloop_accounts where id=p_id and password_hash=p_expected_password_hash for update;
  if not found then return false; end if;
  update public.feynloop_accounts set password_hash=p_password_hash where id=p_id;
  delete from public.feynloop_sessions where account_id=p_id;
  insert into public.feynloop_sessions(token_hash,account_id,expires_at) values(p_token_hash,p_id,p_expires_at);
  return true;
end; $$;
revoke all on function public.feynloop_change_password(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.feynloop_change_password(uuid,text,text,text,timestamptz) to service_role;
commit;
