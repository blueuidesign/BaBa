import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { readQueue, subscribeQueue, type QueuedCall } from './queue';
import { vnToday } from './format';

export type Outlet = { id: string; name: string; model: string; settings: any; price_list_id: string | null; org_id: string };
export type OutletAccess = Outlet & { role: 'owner' | 'staff' | 'admin' };
export type Product = {
  id: string; code: string; name: string; short_name: string; line: string; color: string | null;
  image_url: string | null; has_caffeine: boolean; yield_per_jar: number; sort_order: number; kind: string;
  status: string; price: number; recipe: { ingredient_id: string; qty: number }[];
};
export type Ingredient = {
  id: string; code: string; name: string; grp: string; unit: string; purchase_unit: string;
  purchase_factor: number; kind: string; shelf_days: number | null; storage_note: string | null; sort_order: number;
};
export type BatchRecipe = { id: string; code: string; name: string; output_ingredient_id: string; output_qty: number; note: string | null; items: { ingredient_id: string; qty: number }[] };
export type PackagingRule = { ingredient_id: string; qty_per_unit: number; consume_at: string; product_kind: string };

type Catalog = {
  products: Product[]; // chỉ món cơ sở đang bật, đã sắp xếp
  allProducts: Product[];
  ingredients: Ingredient[];
  ingredientById: Record<string, Ingredient>;
  batchRecipes: BatchRecipe[];
  packaging: PackagingRule[];
};

type Ctx = {
  session: Session | null;
  loading: boolean;
  profile: { id: string; email: string; full_name: string | null } | null;
  isAdmin: boolean;
  outlets: OutletAccess[];
  outlet: OutletAccess | null;
  canManage: boolean;
  catalog: Catalog | null;
  reloadCatalog: () => void;
  selectOutlet: (id: string) => void;
  reloadOutlets: () => Promise<void>;
  queue: QueuedCall[];
  online: boolean;
  dataVersion: number;
  bump: () => void; // báo cho các màn tải lại số liệu
};

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export const LINES: { id: string; name: string }[] = [
  { id: 'xanh', name: 'Mầm Xanh' },
  { id: 'sang', name: 'Mầm Sáng' },
  { id: 'lanh', name: 'Mầm Lành' },
  { id: 'tre', name: 'Mầm Trẻ' }
];

export const GROUPS: { id: string; name: string }[] = [
  { id: 'main', name: 'Nguyên liệu chính' },
  { id: 'additive', name: 'Phụ gia' },
  { id: 'made', name: 'Tự làm' },
  { id: 'packaging', name: 'Bao bì' }
];

export const MODELS: Record<string, string> = {
  M1_cart: 'Xe lưu động',
  M2_street: 'Takeaway vỉa hè',
  M2_shop: 'Có mặt bằng',
  M3_seat: 'Quán ngồi',
  M3_experience: 'Quán có không gian',
  GARDEN: "BaBa's Garden"
};

const OUTLET_KEY = 'kho-baba-outlet';

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Ctx['profile']>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [outlets, setOutlets] = useState<OutletAccess[]>([]);
  const [outletId, setOutletId] = useState<string | null>(() => localStorage.getItem(OUTLET_KEY));
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catVer, setCatVer] = useState(0);
  const [queue, setQueue] = useState<QueuedCall[]>(readQueue());
  const [online, setOnline] = useState(navigator.onLine);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const un = subscribeQueue(setQueue);
    return () => {
      un();
    };
  }, []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      // Làm mới token (khi mở lại màn hình) với cùng người dùng: giữ nguyên session cũ để
      // không tải lại cơ sở và danh mục, tránh mất số đang nhập dở.
      if (e === 'TOKEN_REFRESHED' || (e === 'SIGNED_IN' && s)) {
        setSession((old) => (old && s && old.user.id === s.user.id ? old : s));
        return;
      }
      setSession(s);
      if (!s) {
        setProfile(null);
        setOutlets([]);
        setCatalog(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const reloadOutlets = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    const [{ data: prof }, { data: om }, { data: mem }] = await Promise.all([
      supabase.from('profiles').select('id,email,full_name').eq('id', uid).maybeSingle(),
      supabase.from('org_memberships').select('role,status').eq('user_id', uid).eq('status', 'active'),
      supabase.from('memberships').select('role,outlet_id').eq('user_id', uid).eq('status', 'active')
    ]);
    const admin = (om || []).some((r: any) => r.role === 'admin');
    setProfile(prof as any);
    setIsAdmin(admin);
    // RLS đã lọc: admin thấy mọi cơ sở, người khác chỉ thấy cơ sở mình thuộc về
    const { data: outs } = await supabase
      .from('outlets')
      .select('id,name,model,settings,price_list_id,org_id')
      .neq('status', 'closed')
      .order('name');
    const roleOf = new Map((mem || []).map((m: any) => [m.outlet_id, m.role]));
    const list: OutletAccess[] = (outs || []).map((o: any) => ({ ...o, role: roleOf.get(o.id) || (admin ? 'admin' : 'staff') }));
    setOutlets(list);
    if (list.length === 1) setOutletId(list[0].id);
    else if (outletId && !list.some((o) => o.id === outletId)) setOutletId(null);
    setLoading(false);
  }, [session, outletId]);

  useEffect(() => {
    if (session) reloadOutlets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const outlet = useMemo(() => outlets.find((o) => o.id === outletId) || null, [outlets, outletId]);

  // Danh mục cho cơ sở đang chọn
  useEffect(() => {
    if (!outlet) {
      setCatalog(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const today = vnToday();
      const [prods, menu, prices, recipes, ings, brs, pack] = await Promise.all([
        supabase.from('products').select('*').order('sort_order'),
        supabase.from('outlet_menu').select('product_id,enabled,sort_order').eq('outlet_id', outlet.id),
        supabase.from('product_prices').select('product_id,price_vnd,price_list_id,valid_from,valid_to'),
        supabase.from('recipes').select('id,product_id,version,valid_from,valid_to,status,recipe_items(ingredient_id,qty)').eq('status', 'approved'),
        supabase.from('ingredients').select('*').eq('status', 'active').order('sort_order'),
        supabase.from('batch_recipes').select('*,batch_recipe_items(ingredient_id,qty)').eq('status', 'approved'),
        supabase.from('packaging_rules').select('ingredient_id,qty_per_unit,consume_at,product_kind')
      ]);
      if (cancelled) return;
      const plId = outlet.price_list_id;
      const priceOf = (pid: string) => {
        const rows = (prices.data || []).filter(
          (r: any) => r.product_id === pid && (!plId || r.price_list_id === plId) && r.valid_from <= today && (!r.valid_to || r.valid_to > today)
        );
        return rows[0]?.price_vnd ?? 0;
      };
      const recipeOf = (pid: string) => {
        const rs = (recipes.data || [])
          .filter((r: any) => r.product_id === pid && r.valid_from <= today && (!r.valid_to || r.valid_to > today))
          .sort((a: any, b: any) => b.version - a.version);
        return (rs[0]?.recipe_items || []).map((i: any) => ({ ingredient_id: i.ingredient_id, qty: Number(i.qty) }));
      };
      const allProducts: Product[] = (prods.data || []).map((p: any) => ({
        ...p,
        yield_per_jar: Number(p.yield_per_jar),
        price: priceOf(p.id),
        recipe: recipeOf(p.id)
      }));
      const menuMap = new Map((menu.data || []).map((m: any) => [m.product_id, m]));
      // Món đã ngừng bán vẫn nằm trong allProducts để đơn cũ hiện đúng tên
      const products = allProducts
        .filter((p) => p.status !== 'retired' && menuMap.get(p.id)?.enabled)
        .sort((a, b) => (menuMap.get(a.id)?.sort_order ?? a.sort_order) - (menuMap.get(b.id)?.sort_order ?? b.sort_order));
      const ingredients: Ingredient[] = (ings.data || []).map((i: any) => ({ ...i, purchase_factor: Number(i.purchase_factor) }));
      setCatalog({
        products,
        allProducts,
        ingredients,
        ingredientById: Object.fromEntries(ingredients.map((i) => [i.id, i])),
        batchRecipes: (brs.data || []).map((b: any) => ({
          ...b,
          output_qty: Number(b.output_qty),
          items: (b.batch_recipe_items || []).map((i: any) => ({ ingredient_id: i.ingredient_id, qty: Number(i.qty) }))
        })),
        packaging: (pack.data || []).map((r: any) => ({ ...r, qty_per_unit: Number(r.qty_per_unit) }))
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [outlet, catVer]);

  const selectOutlet = useCallback(
    (id: string) => {
      localStorage.setItem(OUTLET_KEY, id);
      setOutletId(id);
      if (session) supabase.from('profiles').update({ last_outlet_id: id }).eq('id', session.user.id).then(() => {});
    },
    [session]
  );

  const value: Ctx = {
    session,
    loading,
    profile,
    isAdmin,
    outlets,
    outlet,
    canManage: !!outlet && (outlet.role === 'owner' || outlet.role === 'admin' || isAdmin),
    catalog,
    reloadCatalog: () => setCatVer((v) => v + 1),
    selectOutlet,
    reloadOutlets,
    queue,
    online,
    dataVersion,
    bump: () => setDataVersion((v) => v + 1)
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
