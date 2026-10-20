-- HACCP記録アプリ 設定画面用（2026-10-20 追加）
-- Supabaseの「SQL Editor」に丸ごと貼って「Run」。何度流しても大丈夫です。

-- 暗証番号チェック
create or replace function check_pin(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is null or p_pin <> (select value from settings where key = 'admin_pin') then
    raise exception '暗証番号が違います';
  end if;
end $$;

-- 設定画面に出す一覧（使っていないものも含む）
create or replace function admin_master(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform check_pin(p_pin);
  return json_build_object(
    'stores', (select coalesce(json_agg(s order by s.sort, s.id), '[]'::json) from stores s),
    'fridges', (select coalesce(json_agg(f order by f.store_id, f.sort, f.id), '[]'::json) from fridges f),
    'staff', (select coalesce(json_agg(st order by st.store_id, st.sort, st.id), '[]'::json) from staff st)
  );
end $$;

-- 店の追加・変更（id は英字。QRのURLの ?store= に入る）
create or replace function admin_save_store(p_pin text, p_id text, p_name text, p_sort int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform check_pin(p_pin);
  if p_id !~ '^[a-z0-9_-]+$' then raise exception '店のIDは半角英小文字・数字で入れてください'; end if;
  insert into stores (id, name, sort, active) values (p_id, p_name, coalesce(p_sort, 0), coalesce(p_active, true))
  on conflict (id) do update set name = excluded.name, sort = excluded.sort, active = excluded.active;
end $$;

-- 庫の追加・変更（p_id が null なら追加）
create or replace function admin_save_fridge(p_pin text, p_id bigint, p_store text, p_name text, p_kind text, p_max numeric, p_sort int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform check_pin(p_pin);
  if p_id is null then
    insert into fridges (store_id, name, kind, max_temp, sort, active) values (p_store, p_name, p_kind, p_max, coalesce(p_sort, 0), coalesce(p_active, true));
  else
    update fridges set name = p_name, kind = p_kind, max_temp = p_max, sort = coalesce(p_sort, 0), active = coalesce(p_active, true) where id = p_id;
  end if;
end $$;

-- スタッフの追加・変更（p_id が null なら追加）
create or replace function admin_save_staff(p_pin text, p_id bigint, p_store text, p_name text, p_sort int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform check_pin(p_pin);
  if p_id is null then
    insert into staff (store_id, name, sort, active) values (p_store, p_name, coalesce(p_sort, 0), coalesce(p_active, true));
  else
    update staff set name = p_name, sort = coalesce(p_sort, 0), active = coalesce(p_active, true) where id = p_id;
  end if;
end $$;

-- 暗証番号の変更
create or replace function admin_change_pin(p_pin text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform check_pin(p_pin);
  if length(coalesce(p_new, '')) < 4 then raise exception '新しい暗証番号は4けた以上にしてください'; end if;
  update settings set value = p_new where key = 'admin_pin';
end $$;

revoke all on function check_pin(text) from public, anon;
revoke all on function admin_master(text) from public;
revoke all on function admin_save_store(text, text, text, int, boolean) from public;
revoke all on function admin_save_fridge(text, bigint, text, text, text, numeric, int, boolean) from public;
revoke all on function admin_save_staff(text, bigint, text, text, int, boolean) from public;
revoke all on function admin_change_pin(text, text) from public;
grant execute on function admin_master(text) to anon;
grant execute on function admin_save_store(text, text, text, int, boolean) to anon;
grant execute on function admin_save_fridge(text, bigint, text, text, text, numeric, int, boolean) to anon;
grant execute on function admin_save_staff(text, bigint, text, text, int, boolean) to anon;
grant execute on function admin_change_pin(text, text) to anon;
