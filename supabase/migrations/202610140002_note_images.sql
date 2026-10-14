-- Private rich-note images share the detailed-notes collection's access rules.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('note-images','note-images',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.note_image_access(object_name text,writing boolean default false)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
 if auth.uid() is null or object_name is null or object_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg|jpeg|gif)$' then return false;end if;
 cid:=split_part(object_name,'/',1)::uuid;
 if not exists(select 1 from module_collections where id=cid and module='detailed') then return false;end if;
 if writing then return split_part(object_name,'/',2)=auth.uid()::text and public.collection_write(cid);end if;
 return public.collection_access(cid);
end $$;
revoke all on function public.note_image_access(text,boolean) from public,anon;
grant execute on function public.note_image_access(text,boolean) to authenticated,anon;

drop policy if exists note_images_read on storage.objects;
create policy note_images_read on storage.objects for select to authenticated
using(bucket_id='note-images' and public.note_image_access(name,false));
drop policy if exists note_images_insert on storage.objects;
create policy note_images_insert on storage.objects for insert to authenticated
with check(bucket_id='note-images' and public.note_image_access(name,true));
drop policy if exists note_images_delete on storage.objects;
create policy note_images_delete on storage.objects for delete to authenticated
using(bucket_id='note-images' and public.note_image_access(name,true));

-- Broad policies for other buckets must not bypass these private image rules.
drop policy if exists note_images_read_guard on storage.objects;
create policy note_images_read_guard on storage.objects as restrictive for select to public
using(bucket_id<>'note-images' or public.note_image_access(name,false));
drop policy if exists note_images_insert_guard on storage.objects;
create policy note_images_insert_guard on storage.objects as restrictive for insert to public
with check(bucket_id<>'note-images' or public.note_image_access(name,true));
drop policy if exists note_images_delete_guard on storage.objects;
create policy note_images_delete_guard on storage.objects as restrictive for delete to public
using(bucket_id<>'note-images' or public.note_image_access(name,true));
drop policy if exists note_images_update_guard on storage.objects;
create policy note_images_update_guard on storage.objects as restrictive for update to public
using(bucket_id<>'note-images') with check(bucket_id<>'note-images');
drop policy if exists note_images_anon_guard on storage.objects;
create policy note_images_anon_guard on storage.objects as restrictive for all to anon
using(bucket_id<>'note-images') with check(bucket_id<>'note-images');
commit;
