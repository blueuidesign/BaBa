import { supabase } from './supabase';

/** Loại chi (bảng expense_categories, 0017). Đọc từ DB, không viết cứng. */
export type ExpCat = {
  id: string;
  code: string;
  name: string;
  group_code: 'nguyen_lieu' | 'vat_tu' | 'dau_tu' | 'van_hanh';
  ingredient_grp: string | null;
  parent_id: string | null;
  example_text: string | null;
  counts_in_period_pnl: boolean;
  sort_order: number;
};

export type ExpenseRow = {
  id: string;
  outlet_id: string;
  spent_on: string;
  amount_vnd: number;
  category: string;
  category_id: string | null;
  item_name: string | null;
  note: string | null;
  source: 'manual' | 'purchase' | 'import';
  status: string;
  ingredient_id: string | null;
  qty: number | null;
  purchase_id: string | null;
  replaces_id: string | null;
  import_ref: string | null;
  reversal_reason: string | null;
  created_at: string;
};

let cache: ExpCat[] | null = null;
export async function loadExpenseCats(): Promise<ExpCat[]> {
  if (cache) return cache;
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id,code,name,group_code,ingredient_grp,parent_id,example_text,counts_in_period_pnl,sort_order')
    .is('valid_to', null)
    .eq('status', 'active')
    .order('sort_order');
  if (error) throw error;
  cache = (data || []) as ExpCat[];
  return cache;
}

/** Hàng chip đầu (4 ô có dòng ví dụ): các loại thuộc nhóm Nguyên liệu và Vật tư tiêu hao */
export const isStockGroup = (c: ExpCat | undefined) => !!c && (c.group_code === 'nguyen_lieu' || c.group_code === 'vat_tu');

/** So khớp tên không phân biệt hoa thường và dấu: "oc cho" khớp "Óc chó" */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
