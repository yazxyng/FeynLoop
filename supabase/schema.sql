-- 원문과 학습 상태를 서버 전용으로 분리합니다. SQL Editor에서 한 번 실행하세요.
-- 기존 프로젝트는 삭제하지 않습니다. 이전 브라우저 직접 접근 권한은 회수합니다.
begin;
create table if not exists public.feynloop_projects (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 state jsonb not null,
 version integer not null default 0,
 file_path text,
 updated_at timestamptz not null default now(),
 constraint state_without_source check (not (state ? 'pages')),
 constraint consistent_revision check ((state->>'version')::integer = version)
);
create table if not exists public.feynloop_sources (
 project_id uuid primary key references public.feynloop_projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 pages jsonb not null
);
alter table public.feynloop_projects enable row level security;
alter table public.feynloop_sources enable row level security;
-- authenticated/anon에 허용 정책을 만들지 않습니다. 서버만 접근합니다.
revoke all on public.feynloop_projects, public.feynloop_sources from anon, authenticated;
grant all on public.feynloop_projects, public.feynloop_sources to service_role;
create index if not exists feynloop_projects_owner_updated on public.feynloop_projects(user_id,updated_at desc);
create or replace function public.create_feynloop_project(p_id uuid,p_user_id uuid,p_state jsonb,p_pages jsonb,p_file_path text default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
 insert into public.feynloop_projects(id,user_id,state,version,file_path) values(p_id,p_user_id,p_state,0,p_file_path);
 insert into public.feynloop_sources(project_id,user_id,pages) values(p_id,p_user_id,p_pages);
end;
$$;
revoke all on function public.create_feynloop_project(uuid,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_feynloop_project(uuid,uuid,jsonb,jsonb,text) to service_role;
-- 이전 버전의 원문 전체를 사용자 토큰으로 직접 읽을 수 없도록 차단합니다.
do $$ begin
 if to_regclass('public.projects') is not null then
  execute 'revoke all on public.projects from anon, authenticated';
 end if;
end $$;
drop policy if exists "own pdf select" on storage.objects;
drop policy if exists "own pdf insert" on storage.objects;
drop policy if exists "own pdf update" on storage.objects;
drop policy if exists "own pdf delete" on storage.objects;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pdfs','pdfs',false,20971520,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];
commit;
