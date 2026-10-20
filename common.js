// Supabaseへの読み書き（ライブラリなし、REST直接）
const CFG = window.HACCP_CONFIG;
const HEAD = () => ({
  apikey: CFG.SUPABASE_ANON_KEY,
  Authorization: "Bearer " + CFG.SUPABASE_ANON_KEY,
  "Content-Type": "application/json"
});
async function sbGet(path) {
  const r = await fetch(CFG.SUPABASE_URL + "/rest/v1/" + path, { headers: HEAD() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbInsert(table, rows) {
  const r = await fetch(CFG.SUPABASE_URL + "/rest/v1/" + table, {
    method: "POST", headers: { ...HEAD(), Prefer: "return=minimal" }, body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error(await r.text());
}
async function sbRpc(fn, args) {
  const r = await fetch(CFG.SUPABASE_URL + "/rest/v1/rpc/" + fn, {
    method: "POST", headers: HEAD(), body: JSON.stringify(args)
  });
  if (!r.ok) { const t = await r.text(); let m = t; try { m = JSON.parse(t).message || t } catch (e) {} throw new Error(m); }
  return r.json();
}
// 日本時間の日付 YYYY-MM-DD
function jstDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// 厚労省「小規模な一般飲食店事業者向け手引書」の一般衛生管理（毎日）
const DAILY_ITEMS = [
  { key: "原材料の受入れの確認", hint: "外観・におい・包装・期限・温度を見た" },
  { key: "冷蔵・冷凍庫の温度の確認", hint: "温度の記録をつけた（温度タブ）" },
  { key: "交差汚染・二次汚染の防止", hint: "生肉・生魚と調理済み品を分けた、まな板・包丁の使い分け" },
  { key: "器具等の洗浄・消毒・殺菌", hint: "使った器具を洗って消毒した" },
  { key: "トイレの洗浄・消毒", hint: "便座・水洗レバー・ドアノブを消毒した" },
  { key: "従業員の健康管理", hint: "出勤者全員の健康チェックをした（健康タブ）" },
  { key: "手洗いの実施", hint: "決めたタイミングで手洗いをした" }
];
const HEALTH_ITEMS = [
  "下痢・腹痛がない",
  "吐き気・嘔吐がない",
  "発熱がない",
  "手や指に傷・化膿がない",
  "爪・髪・服装が清潔"
];
