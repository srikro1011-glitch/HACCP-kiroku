# HACCP記録

リプラス各店のHACCP記録（冷蔵・冷凍庫の温度、一般衛生管理7項目、従業員の健康チェック）をスタッフがスマホで入力するアプリ。

- スタッフ用: `/?store=sannomiya`
- 管理用: `/admin.html`（暗証番号）
- データ: Supabase（`db/supabase.sql`）
- ビルド不要の静的サイト。Vercelはそのまま公開できる。
