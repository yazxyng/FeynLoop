-- Supabase SQL Editor에서 실행. 사용자 키만 사용하며 service role 키는 사용하지 않습니다.
create table if not exists public.projects (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
create policy "own projects select" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "own projects insert" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own projects update" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own projects delete" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists projects_user_updated on public.projects(user_id,updated_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pdfs','pdfs',false,20971520,array['application/pdf']) on conflict(id) do nothing;
create policy "own pdf select" on storage.objects for select to authenticated using(bucket_id='pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "own pdf insert" on storage.objects for insert to authenticated with check(bucket_id='pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "own pdf update" on storage.objects for update to authenticated using(bucket_id='pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "own pdf delete" on storage.objects for delete to authenticated using(bucket_id='pdfs' and (storage.foldername(name))[1]=(select auth.uid())::text);
