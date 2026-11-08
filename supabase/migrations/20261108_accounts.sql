-- 메일 없는 아이디 로그인. 기존 Supabase Auth 계정과 기록은 변경하지 않습니다.
begin;
create table if not exists public.feynloop_accounts (
  id uuid primary key,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{3,23}$'),
  password_hash text not null,
  recovery_hash text not null check (recovery_hash ~ '^[a-f0-9]{64}$'),
  legacy_user_id uuid unique,
  created_at timestamptz not null default now()
);
create table if not exists public.feynloop_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid not null references public.feynloop_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists feynloop_sessions_account on public.feynloop_sessions(account_id);
create index if not exists feynloop_sessions_expiry on public.feynloop_sessions(expires_at);
create table if not exists public.feynloop_auth_limits (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create table if not exists public.feynloop_account_projects (
  id uuid primary key,
  user_id uuid not null references public.feynloop_accounts(id) on delete cascade,
  state jsonb not null,
  version integer not null default 0,
  file_path text,
  updated_at timestamptz not null default now(),
  check (not (state ? 'pages')),
  check ((state->>'version')::integer = version)
);
create index if not exists feynloop_account_projects_owner on public.feynloop_account_projects(user_id,updated_at desc);
create table if not exists public.feynloop_account_sources (
  project_id uuid primary key references public.feynloop_account_projects(id) on delete cascade,
  user_id uuid not null references public.feynloop_accounts(id) on delete cascade,
  pages jsonb not null
);
alter table public.feynloop_accounts enable row level security;
alter table public.feynloop_sessions enable row level security;
alter table public.feynloop_auth_limits enable row level security;
alter table public.feynloop_account_projects enable row level security;
alter table public.feynloop_account_sources enable row level security;
revoke all on public.feynloop_accounts,public.feynloop_sessions,public.feynloop_auth_limits,public.feynloop_account_projects,public.feynloop_account_sources from public,anon,authenticated;
grant all on public.feynloop_accounts,public.feynloop_sessions,public.feynloop_auth_limits,public.feynloop_account_projects,public.feynloop_account_sources to service_role;

-- 서버에서만 호출하는 원자적 요청 제한. 0이면 허용, 양수이면 남은 대기 시간(초).
create or replace function public.feynloop_auth_attempt(p_key text,p_limit integer,p_window_seconds integer)
returns integer language plpgsql security invoker set search_path=public as $$
declare v_attempts integer; v_until timestamptz;
begin
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 60 or p_window_seconds > 86400 then raise exception 'invalid limits'; end if;
  insert into public.feynloop_auth_limits as limits(key,attempts,expires_at)
    values(p_key,1,now()+make_interval(secs=>p_window_seconds))
  on conflict(key) do update set
    attempts=case when limits.expires_at <= now() then 1 else limits.attempts+1 end,
    expires_at=case when limits.expires_at <= now() then now()+make_interval(secs=>p_window_seconds) else limits.expires_at end
  returning attempts,expires_at into v_attempts,v_until;
  if v_attempts > p_limit then return greatest(1,ceil(extract(epoch from v_until-now()))::integer); end if;
  return 0;
end; $$;

create or replace function public.feynloop_register_account(p_id uuid,p_username text,p_password_hash text,p_recovery_hash text,p_token_hash text,p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
begin
  insert into public.feynloop_accounts(id,username,password_hash,recovery_hash) values(p_id,p_username,p_password_hash,p_recovery_hash);
  insert into public.feynloop_sessions(token_hash,account_id,expires_at) values(p_token_hash,p_id,p_expires_at);
end; $$;

-- 복구코드는 한 번만 사용하고, 비밀번호 변경과 모든 기존 세션 폐기를 함께 처리합니다.
create or replace function public.feynloop_recover_account(p_id uuid,p_expected_recovery_hash text,p_password_hash text,p_recovery_hash text,p_token_hash text,p_expires_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  perform 1 from public.feynloop_accounts where id=p_id and recovery_hash=p_expected_recovery_hash for update;
  if not found then return false; end if;
  update public.feynloop_accounts set password_hash=p_password_hash,recovery_hash=p_recovery_hash where id=p_id;
  delete from public.feynloop_sessions where account_id=p_id;
  insert into public.feynloop_sessions(token_hash,account_id,expires_at) values(p_token_hash,p_id,p_expires_at);
  return true;
end; $$;

create or replace function public.create_feynloop_account_project(p_id uuid,p_user_id uuid,p_state jsonb,p_pages jsonb,p_file_path text default null)
returns void language plpgsql security invoker set search_path=public as $$
begin
  insert into public.feynloop_account_projects(id,user_id,state,version,file_path) values(p_id,p_user_id,p_state,0,p_file_path);
  insert into public.feynloop_account_sources(project_id,user_id,pages) values(p_id,p_user_id,p_pages);
end; $$;

-- p_legacy_id는 서버가 Supabase의 기존 access token으로 검증한 ID만 전달합니다.
-- 이메일/아이디 일치만으로 연결하지 않으며, 이전 계정 하나는 새 계정 하나에만 연결합니다.
create or replace function public.feynloop_import_legacy(p_account_id uuid,p_legacy_id uuid)
returns integer language plpgsql security invoker set search_path=public as $$
declare v_existing uuid; v_count integer;
begin
  select legacy_user_id into v_existing from public.feynloop_accounts where id=p_account_id for update;
  if not found then raise exception 'account not found'; end if;
  if v_existing=p_legacy_id then return 0; end if;
  if v_existing is not null then raise exception 'account already linked'; end if;
  update public.feynloop_accounts set legacy_user_id=p_legacy_id where id=p_account_id;
  insert into public.feynloop_account_projects(id,user_id,state,version,file_path,updated_at)
    select id,p_account_id,state,version,file_path,updated_at from public.feynloop_projects where user_id=p_legacy_id;
  get diagnostics v_count = row_count;
  insert into public.feynloop_account_sources(project_id,user_id,pages)
    select project_id,p_account_id,pages from public.feynloop_sources where user_id=p_legacy_id;
  return v_count;
end; $$;

revoke all on function public.feynloop_auth_attempt(text,integer,integer) from public,anon,authenticated;
revoke all on function public.feynloop_register_account(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.feynloop_recover_account(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.create_feynloop_account_project(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.feynloop_import_legacy(uuid,uuid) from public,anon,authenticated;
grant execute on function public.feynloop_auth_attempt(text,integer,integer) to service_role;
grant execute on function public.feynloop_register_account(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.feynloop_recover_account(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.create_feynloop_account_project(uuid,uuid,jsonb,jsonb,text) to service_role;
grant execute on function public.feynloop_import_legacy(uuid,uuid) to service_role;
commit;
