-- sio-tv: move is_owner() out of the API-exposed public schema.
-- Fixes Supabase advisors 0028/0029 (SECURITY DEFINER callable via /rest/v1/rpc).
-- Existing RLS policies reference the function by OID, so they keep working.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_owner() set schema private;

revoke execute on function private.is_owner() from public, anon;
grant execute on function private.is_owner() to authenticated;
