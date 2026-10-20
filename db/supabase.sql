-- HACCP記録アプリ（リプラス）Supabase用
-- Supabaseの「SQL Editor」にこのファイルを丸ごと貼って「Run」を押す。
-- 最後の行の管理用暗証番号（'0000'）は、貼る前に好きな数字に変えてください。

-- ========== マスタ ==========
create table if not exists stores (
  id text primary key,
  name text not null,
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists fridges (
  id bigserial primary key,
  store_id text not null references stores(id),
  name text not null,
  kind text not null check (kind in ('冷蔵','冷凍')),
  max_temp numeric not null,           -- これを超えたら基準外
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists staff (
  id bigserial primary key,
  store_id text not null references stores(id),
  name text not null,
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists settings (
  key text primary key,
  value text not null
);

-- ========== 記録 ==========
create table if not exists temp_logs (
  id bigserial primary key,
  store_id text not null references stores(id),
  log_date date not null,
  slot text not null check (slot in ('朝','夕')),
  fridge_id bigint not null references fridges(id),
  temp numeric not null,
  ok boolean not null,
  action text,                         -- 基準外のときにしたこと
  staff_name text not null,
  created_at timestamptz not null default now(),
  check (ok or length(trim(coalesce(action,''))) > 0)
);

create table if not exists daily_checks (
  id bigserial primary key,
  store_id text not null references stores(id),
  log_date date not null,
  item text not null,
  ok boolean not null,
  action text,                         -- ✕のときの内容と対応
  staff_name text not null,
  created_at timestamptz not null default now(),
  check (ok or length(trim(coalesce(action,''))) > 0)
);

create table if not exists health_checks (
  id bigserial primary key,
  store_id text not null references stores(id),
  log_date date not null,
  staff_name text not null,
  items jsonb not null,                -- {"下痢・腹痛がない": true, ...}
  ok boolean not null,
  action text,                         -- 当てはまったときの対応
  created_at timestamptz not null default now(),
  check (ok or length(trim(coalesce(action,''))) > 0)
);

create index if not exists temp_logs_store_date on temp_logs(store_id, log_date);
create index if not exists daily_checks_store_date on daily_checks(store_id, log_date);
create index if not exists health_checks_store_date on health_checks(store_id, log_date);

-- ========== 見せ方の決まり ==========
-- スマホ画面（だれでも開ける）: マスタは読める、記録は「書く」だけ。記録を読むのは暗証番号つきの関数だけ。
alter table stores enable row level security;
alter table fridges enable row level security;
alter table staff enable row level security;
alter table settings enable row level security;
alter table temp_logs enable row level security;
alter table daily_checks enable row level security;
alter table health_checks enable row level security;

drop policy if exists read_stores on stores;
create policy read_stores on stores for select to anon using (active);
drop policy if exists read_fridges on fridges;
create policy read_fridges on fridges for select to anon using (active);
drop policy if exists read_staff on staff;
create policy read_staff on staff for select to anon using (active);

drop policy if exists add_temp on temp_logs;
create policy add_temp on temp_logs for insert to anon with check (log_date between current_date - 1 and current_date + 1);
drop policy if exists add_daily on daily_checks;
create policy add_daily on daily_checks for insert to anon with check (log_date between current_date - 1 and current_date + 1);
drop policy if exists add_health on health_checks;
create policy add_health on health_checks for insert to anon with check (log_date between current_date - 1 and current_date + 1);

grant usage on schema public to anon;
grant select on stores, fridges, staff to anon;
grant insert on temp_logs, daily_checks, health_checks to anon;
grant usage on all sequences in schema public to anon;

-- その日の入力状況（中身は出さず、件数と名前だけ）
create or replace function today_status(p_store text, p_date date)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'temp', (select coalesce(json_agg(json_build_object('slot', slot, 'n', n)), '[]'::json)
             from (select slot, count(distinct fridge_id) n from temp_logs
                   where store_id = p_store and log_date = p_date group by slot) t),
    'daily', (select count(distinct item) from daily_checks where store_id = p_store and log_date = p_date),
    'health', (select coalesce(json_agg(distinct staff_name), '[]'::json) from health_checks
               where store_id = p_store and log_date = p_date)
  );
$$;

-- 管理者用：期間の記録をまとめて返す（暗証番号が合うときだけ）
create or replace function admin_logs(p_pin text, p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_pin is null or p_pin <> (select value from settings where key = 'admin_pin') then
    raise exception '暗証番号が違います';
  end if;
  return json_build_object(
    'stores', (select coalesce(json_agg(s order by s.sort), '[]'::json) from stores s where active),
    'fridges', (select coalesce(json_agg(f order by f.store_id, f.sort), '[]'::json) from fridges f where active),
    'staff', (select coalesce(json_agg(st order by st.store_id, st.sort), '[]'::json) from staff st where active),
    'temp', (select coalesce(json_agg(t order by t.log_date, t.created_at), '[]'::json) from temp_logs t where log_date between p_from and p_to),
    'daily', (select coalesce(json_agg(d order by d.log_date, d.created_at), '[]'::json) from daily_checks d where log_date between p_from and p_to),
    'health', (select coalesce(json_agg(h order by h.log_date, h.created_at), '[]'::json) from health_checks h where log_date between p_from and p_to)
  );
end $$;

revoke all on function today_status(text, date) from public;
revoke all on function admin_logs(text, date, date) from public;
grant execute on function today_status(text, date) to anon;
grant execute on function admin_logs(text, date, date) to anon;

-- ========== 最初のデータ（三ノ宮） ==========
-- 庫の名前・台数・スタッフは仮です。Supabaseの「Table Editor」で直せます（つむぎに頼んでもOK）。
insert into stores (id, name, sort) values ('sannomiya', '三ノ宮', 1) on conflict (id) do nothing;

insert into fridges (store_id, name, kind, max_temp, sort)
select 'sannomiya', v.name, v.kind, v.max_temp, v.sort
from (values
  ('冷蔵庫1（キッチン）', '冷蔵', 10, 1),
  ('冷蔵庫2（ドリンク）', '冷蔵', 10, 2),
  ('冷凍庫1', '冷凍', -15, 3)
) as v(name, kind, max_temp, sort)
where not exists (select 1 from fridges where store_id = 'sannomiya');

insert into settings (key, value) values ('admin_pin', '0000') on conflict (key) do nothing;
