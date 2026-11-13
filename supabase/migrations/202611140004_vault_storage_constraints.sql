-- Apply only after all retained vaults have been upgraded to v2.
-- No content is deleted or converted by this migration. Invalid existing data
-- aborts the transaction. These checks validate structure, not ciphertext authenticity.
begin;
create or replace function public.vault_v2_storage_valid(value text) returns boolean
language plpgsql immutable security definer set search_path=pg_catalog as $$
begin
  if not public.vault_metadata_valid(value) then return false; end if;
  return coalesce(value::jsonb->>'format'='todo-vault-v2',false);
exception when others then return false;
end; $$;
create or replace function public.vault_ciphertext_storage_valid(value jsonb) returns boolean
language plpgsql immutable security definer set search_path=pg_catalog as $$
begin
  return coalesce(public.vault_envelope_valid(value)
    and length(decode(value->>'key_id','base64'))=16,false);
exception when others then return false;
end; $$;
revoke all on function public.vault_v2_storage_valid(text),public.vault_ciphertext_storage_valid(jsonb) from public,anon,authenticated;
grant execute on function public.vault_v2_storage_valid(text),public.vault_ciphertext_storage_valid(jsonb) to authenticated,service_role;

alter table public.password_sessions drop constraint if exists vault_v2_metadata_required;
alter table public.password_sessions add constraint vault_v2_metadata_required check(public.vault_v2_storage_valid(password_hash));
alter table public.secure_notes alter column encrypted_payload set not null;
alter table public.secure_notes drop constraint if exists vault_ciphertext_required;
alter table public.secure_notes add constraint vault_ciphertext_required check(public.vault_ciphertext_storage_valid(encrypted_payload));
alter table public.secure_notes drop constraint if exists vault_plaintext_forbidden;
alter table public.secure_notes add constraint vault_plaintext_forbidden check(
  title is not distinct from 'Encrypted note' and type is not distinct from 'secret'
  and description is null and username is null and password_encrypted is null and url is null and content is null
);
alter table public.vault_note_history drop constraint if exists vault_history_ciphertext_required;
alter table public.vault_note_history add constraint vault_history_ciphertext_required check(public.vault_ciphertext_storage_valid(encrypted_payload));
commit;
