import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useApp } from './app';
import { vnToday } from './format';

export type BottleRow = { product_id: string; carried: number; cooked: number; sold: number; left_qty: number; closed: boolean };
export type StockRow = {
  outlet_id: string; ingredient_id: string; code: string; name: string; grp: string; unit: string; kind: string;
  shelf_days: number | null; storage_note: string | null; purchase_unit: string; purchase_factor: number; sort_order: number;
  min_qty: number; lead_days: number | null; supplier_id: string | null; supplier_name: string | null; on_order_until: string | null;
  notify_email: boolean; enabled: boolean; qty_on_hand: number; use_days: number; avg_daily_use: number;
  days_of_cover: number | null; nearest_expiry: string | null; needs_order: boolean; on_order: boolean; expiring: boolean;
};

/** Tải dữ liệu theo cơ sở đang chọn; tự tải lại khi có thao tác ghi (dataVersion). */
export function useLoad<T>(fn: (outletId: string) => Promise<T>, deps: any[] = []) {
  const { outlet, dataVersion } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!outlet) return;
    setLoading(true);
    try {
      setData(await fn(outlet.id));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet?.id, ...deps]);
  useEffect(() => {
    reload();
  }, [reload, dataVersion]);
  return { data, error, loading, reload };
}

export async function fetchBottles(outletId: string, date = vnToday()): Promise<BottleRow[]> {
  const { data, error } = await supabase.rpc('fn_bottles_on_hand', { p_outlet: outletId, p_date: date });
  if (error) throw error;
  return (data || []) as BottleRow[];
}

export async function fetchStock(outletId: string): Promise<StockRow[]> {
  const { data, error } = await supabase.from('v_stock_status').select('*').eq('outlet_id', outletId).order('sort_order');
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    min_qty: Number(r.min_qty),
    qty_on_hand: Number(r.qty_on_hand),
    avg_daily_use: Number(r.avg_daily_use),
    days_of_cover: r.days_of_cover == null ? null : Number(r.days_of_cover),
    purchase_factor: Number(r.purchase_factor)
  }));
}

export async function fetchDaySales(outletId: string, date = vnToday()) {
  const { data } = await supabase.from('v_daily_sales').select('*').eq('outlet_id', outletId).eq('business_date', date).maybeSingle();
  return (data as any) || { bottles: 0, revenue_vnd: 0, orders_count: 0, gift_bottles: 0 };
}

export async function isDayClosed(outletId: string, date = vnToday()) {
  const { data } = await supabase.from('day_closes').select('id').eq('outlet_id', outletId).eq('business_date', date).eq('is_current', true).maybeSingle();
  return !!data;
}
