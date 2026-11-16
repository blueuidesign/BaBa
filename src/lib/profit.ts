import { supabase } from './supabase';

/** Báo cáo lãi gộp, lãi ròng (migration 0051–0053). Chỉ chủ cơ sở và quản trị gọi được (RPC kiểm tra quyền). */
export type CostDetail = {
  total: number | null;
  reason?: string;
  ingredients?: number;
  syrup?: number;
  syrup_ml?: number;
  packaging?: number;
  packaging_breakdown?: { name: string; cost: number }[];
  items?: { ingredient_id: string; name: string; qty: number; unit: string; cost_per_unit: number | null; cost: number | null }[];
};
export type ProfitReport = {
  from: string; to: string;
  revenue: number; orders: number; parts: number; cogs: number; parts_no_cost: number;
  gift_qty: number; gift_cost: number; waste_qty: number; waste_cost: number;
  by_day: { d: string; revenue: number; parts: number; cogs: number }[];
  by_product: { product_id: string; container: string; qty: number; revenue: number; cogs: number | null; detail: CostDetail | null }[];
};
export type NetMonth = {
  month: string; revenue: number; orders: number; parts: number; cogs: number; parts_no_cost: number;
  gift_qty: number; gift_cost: number; waste_qty: number; waste_cost: number;
  opex: { code: string; name: string; amount: number }[]; opex_total: number; depreciation: number;
  cash: { nguyen_lieu: number; vat_tu: number; van_hanh: number; dau_tu: number };
  historical_revenue: number;
};
export type NetReport = {
  depr_months: number; depr_start: string | null; invest_total: number;
  invest_by_cat: { name: string; amount: number }[];
  opex_cats: { code: string; name: string }[];
  months: NetMonth[];
};

export async function fetchProfit(outletId: string, from: string, to: string): Promise<ProfitReport> {
  const { data, error } = await supabase.rpc('fn_profit_report', { p_outlet: outletId, p_from: from, p_to: to });
  if (error) throw error;
  return data as ProfitReport;
}
export async function fetchNet(outletId: string, from: string, to: string): Promise<NetReport> {
  const { data, error } = await supabase.rpc('fn_net_report', { p_outlet: outletId, p_from: from, p_to: to });
  if (error) throw error;
  return data as NetReport;
}

/** Cộng nhiều tháng thành một kỳ: lãi gộp, hao hụt, vận hành theo loại, khấu hao, lãi ròng. */
export function sumNet(months: NetMonth[]) {
  const s = { revenue: 0, parts: 0, cogs: 0, parts_no_cost: 0, gift_qty: 0, gift_cost: 0, waste_qty: 0, waste_cost: 0, opex_total: 0, depreciation: 0, historical_revenue: 0 };
  const opex = new Map<string, number>();
  months.forEach((m) => {
    (Object.keys(s) as (keyof typeof s)[]).forEach((k) => (s[k] += Number(m[k]) || 0));
    m.opex.forEach((o) => opex.set(o.code, (opex.get(o.code) || 0) + Number(o.amount)));
  });
  const gross = s.revenue - s.cogs;
  const loss = s.gift_cost + s.waste_cost;
  return { ...s, opex, gross, loss, net: gross - loss - s.opex_total - s.depreciation, recovered: gross - loss - s.opex_total };
}
export const netOfMonth = (m: NetMonth) => m.revenue - m.cogs - m.gift_cost - m.waste_cost - m.opex_total - m.depreciation;
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const daysInMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
