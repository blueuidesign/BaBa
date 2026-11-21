import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { vnd } from '../lib/format';
import { Bottle, BUFFET_COLOR, Cup, Icon } from './ui';

/**
 * Một chai (cốc) Buffet đang ghi: lượng nguyên liệu cho MỘT phần.
 * combo: id combo (giá cố định, đúng số hạt); null = Khác (tự chọn, sửa được giá); undefined = chưa chọn (bảng tự chọn combo đầu).
 */
export type BuffetPick = { key: string; container: 'chai' | 'coc'; less: boolean; price: number; items: Record<string, number>; combo?: string | null };
export type Tier = 'premium' | 'regular';
export type BuffetIng = { ingredient_id: string; name: string; unit: string; tier: Tier };
export type BuffetCombo = { id: string; name: string; n_premium: number; n_regular: number; price: number };

export const BUFFET_PRICE = 30000;
export const BUFFET_PRICE_STEP = 5000;
export const BUFFET_FIRST = 20;
export const BUFFET_STEP = 5;

/** "Đậu đỏ khô 30 g · Hạt điều 20 g" */
export function buffetSummary(items: Record<string, number>, nameOf: (id: string) => { name: string; unit: string } | undefined) {
  return Object.entries(items)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => {
      const i = nameOf(id);
      return `${i?.name || 'Nguyên liệu đã bỏ'} ${q} ${i?.unit || 'g'}`;
    })
    .join(' · ');
}

/** Đếm số loại cao cấp, phổ thông, loại không thuộc nhóm nào. */
export function tierCount(items: Record<string, number>, tierOf: (id: string) => Tier | null | undefined) {
  let p = 0, r = 0, x = 0;
  Object.entries(items).forEach(([id, q]) => {
    if (q <= 0) return;
    const t = tierOf(id);
    if (t === 'premium') p++;
    else if (t === 'regular') r++;
    else x++;
  });
  return { p, r, x };
}

/** Ghi chú nhỏ cạnh chữ Buffet (BG05): "2 cao cấp · 1 phổ thông", Khác thì thêm chữ "Khác". */
export function BuffetTag({ items, combo, tierOf }: { items: Record<string, number>; combo: string | null | undefined; tierOf: (id: string) => Tier | null | undefined }) {
  const { p, r, x } = tierCount(items, tierOf);
  const parts = [`${p} cao cấp`, `${r} phổ thông`, ...(x ? [`${x} loại khác`] : [])];
  return <span className="bf-tag">{combo ? '' : 'Khác · '}{parts.join(' · ')}</span>;
}

/** Nguyên liệu (có nhóm cao cấp, phổ thông; hay dùng nhất ở trên) và combo đang dùng (fn_buffet_options, 0066). */
export function useBuffetOptions(outletId: string | undefined) {
  return useLoad(async () => {
    if (!outletId) return { ingredients: [], combos: [] } as { ingredients: BuffetIng[]; combos: BuffetCombo[] };
    const { data, error } = await supabase.rpc('fn_buffet_options', { p_outlet: outletId });
    if (error) throw error;
    return (data || { ingredients: [], combos: [] }) as { ingredients: BuffetIng[]; combos: BuffetCombo[] };
  }, [outletId]);
}

/**
 * Bảng chọn Buffet (thiết kế BG01–BG04). Chọn combo: giá cố định, phải đủ số hạt cao cấp, phổ thông, chỉ sửa gram.
 * Khác: chọn tùy ý, giá mặc định 30.000 đ ±5.000 đ. Nguyên liệu bấm Thêm = 20 g, sau đó ±5 g.
 */
export default function BuffetSheet({ outletId, value, onSave, onSaveNext, onClose, onDelete }: {
  outletId: string;
  value: BuffetPick;
  onSave: (b: BuffetPick) => void;
  /** Lưu chai này rồi mở bảng mới cho chai khác (chỉ khi thêm mới) */
  onSaveNext?: (b: BuffetPick) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [b, setB] = useState<BuffetPick>(value);
  const { data: opt, loading, error } = useBuffetOptions(outletId);
  const list = opt?.ingredients || [];
  const combos = opt?.combos || [];
  const byId = Object.fromEntries(list.map((i) => [i.ingredient_id, i]));

  // Mở mới: chọn sẵn combo đầu (2 cao cấp + 1 phổ thông)
  useEffect(() => {
    if (b.combo === undefined && opt) {
      const c = combos[0];
      setB((x) => ({ ...x, combo: c ? c.id : null, price: c ? c.price : x.price }));
    }
  }, [opt]); // eslint-disable-line react-hooks/exhaustive-deps

  const combo = combos.find((c) => c.id === b.combo) || null;
  const isOther = b.combo === null;
  const chosen = Object.entries(b.items).filter(([, q]) => q > 0);
  const total = chosen.reduce((s, [, q]) => s + q, 0);
  const { p, r, x } = tierCount(b.items, (id) => byId[id]?.tier);
  const price = combo ? combo.price : b.price;
  const setQty = (id: string, q: number) =>
    setB((v) => {
      const items = { ...v.items };
      if (q <= 0) delete items[id];
      else items[id] = q;
      return { ...v, items };
    });
  const pickCombo = (c: BuffetCombo | null) => setB((v) => ({ ...v, combo: c ? c.id : null, price: c ? c.price : v.combo === null ? v.price : BUFFET_PRICE }));

  // Kiểm tra theo combo
  let problem: string | null = null; // chữ trên nút khi chưa lưu được
  let over: string | null = null; // dòng đỏ khi chọn thừa
  if (combo) {
    const needP = combo.n_premium - p, needR = combo.n_regular - r;
    if (x > 0) over = `Combo chỉ dùng hạt cao cấp, phổ thông. Bỏ ${x} nguyên liệu khác hoặc chọn Khác.`;
    else if (needP < 0 || needR < 0) {
      const t = [needP < 0 ? `${-needP} cao cấp` : '', needR < 0 ? `${-needR} phổ thông` : ''].filter(Boolean).join(' và ');
      const bigger = combos.find((c) => c.n_premium === p && c.n_regular === r);
      over = `Combo này chỉ ${combo.n_premium} cao cấp, ${combo.n_regular} phổ thông. Bấm − để bỏ bớt ${t}${bigger ? `, hoặc chọn combo ${bigger.name}` : ', hoặc chọn Khác'}.`;
    }
    if (over) problem = 'Sửa lại nguyên liệu như dòng đỏ';
    else if (needP > 0 || needR > 0)
      problem = `Chọn thêm ${[needP > 0 ? `${needP} cao cấp` : '', needR > 0 ? `${needR} phổ thông` : ''].filter(Boolean).join(', ')}`;
  } else if (!chosen.length) problem = 'Chọn ít nhất một nguyên liệu';
  if (b.combo === undefined) problem = 'Đang tải combo…';

  const out = (): BuffetPick => ({ ...b, price });

  const group = (tier: Tier, title: string, need: number | null, n: number) => {
    const items = list.filter((i) => i.tier === tier);
    const full = need != null && n >= need;
    const cls = need == null ? '' : n === need ? 'ok' : n > need ? 'over' : '';
    return (
      <>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <span className="h2" style={{ margin: 0 }}>{title}</span>
          <span className={`bf-count ${cls}`}>{need == null ? `${n} loại` : `${n}/${need}`}</span>
        </div>
        <div className="bf-list">
          {items.map((i) => {
            const q = b.items[i.ingredient_id] || 0;
            return (
              <div key={i.ingredient_id} className="row" style={{ gap: 8, minHeight: 52, borderBottom: '1px solid var(--border)' }}>
                <span className={`grow ${q ? 'strong' : ''}`} style={!q && full ? { color: 'var(--ink-muted)' } : undefined}>{i.name}</span>
                {q > 0 ? (
                  <span className="stepper sm">
                    <button type="button" aria-label={`Bớt ${BUFFET_STEP} ${i.unit} ${i.name}`} onClick={() => setQty(i.ingredient_id, q - BUFFET_STEP)}>
                      <Icon name="minus" size={18} sw={2.4} />
                    </button>
                    <span className="val" aria-live="polite" style={{ minWidth: 60, whiteSpace: 'nowrap', fontSize: 15 }}>{q} {i.unit}</span>
                    <button type="button" className="plus" aria-label={`Thêm ${BUFFET_STEP} ${i.unit} ${i.name}`} onClick={() => setQty(i.ingredient_id, q + BUFFET_STEP)}>
                      <Icon name="plus" size={18} sw={2.4} />
                    </button>
                  </span>
                ) : full ? (
                  <button type="button" className="btn secondary sm" disabled>Đã đủ</button>
                ) : (
                  <button type="button" className="btn sm" aria-label={`Thêm ${i.name} ${BUFFET_FIRST} ${i.unit}`} onClick={() => setQty(i.ingredient_id, BUFFET_FIRST)}>
                    <Icon name="plus" size={16} sw={2.4} /> Thêm
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet sheet-fixed" role="dialog" aria-labelledby="bf-t">
        <div className="row between" style={{ minHeight: 32 }}>
          <h2 id="bf-t" style={{ fontSize: 18 }}>Buffet</h2>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <div className="sheet-scroll">
          <div className="row" style={{ gap: 10, padding: 12, borderRadius: 'var(--radius-md, 14px)', background: '#F4F1EA' }}>
            {b.container === 'coc' ? <Cup color={BUFFET_COLOR} size={30} /> : <Bottle color={BUFFET_COLOR} size={30} />}
            <span className="grow">
              <span className="strong" style={{ display: 'block' }}>{p} cao cấp · {r} phổ thông{x ? ` · ${x} khác` : ''} · {total} g</span>
              <span className="xs muted">
                {chosen.length ? buffetSummary(b.items, (id) => byId[id]) : `Bấm Thêm ở nguyên liệu: lần đầu ${BUFFET_FIRST} g, sau đó mỗi lần ±${BUFFET_STEP} g`}
              </span>
            </span>
          </div>
          {over && <p role="alert" className="err" style={{ margin: 0 }}>{over}</p>}

          {loading && !opt ? (
            <span className="small muted">Đang tải combo và nguyên liệu…</span>
          ) : error ? (
            <span className="err">Không tải được combo và nguyên liệu. Kiểm tra mạng, đóng bảng rồi mở lại.</span>
          ) : (
            <>
              <span className="h2" style={{ margin: 0 }}>Combo</span>
              <div className="bf-combos" role="radiogroup" aria-label="Combo">
                {combos.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={b.combo === c.id} className={b.combo === c.id ? 'on' : ''} onClick={() => pickCombo(c)}>
                    <span>{c.n_premium} cao cấp + {c.n_regular} phổ thông</span>
                    <b>{vnd(c.price)}</b>
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={isOther} className={isOther ? 'on' : ''} onClick={() => pickCombo(null)}>
                  <span>Khác</span>
                  <b>tự chọn, sửa được giá</b>
                </button>
              </div>

              <div className="seg3 outline" role="radiogroup" aria-label="Chai hay cốc giấy">
                {(['chai', 'coc'] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={b.container === c} className={b.container === c ? 'on' : ''}
                    style={{ minHeight: 44 }} onClick={() => setB({ ...b, container: c })}>
                    {c === 'chai' ? 'Chai' : 'Cốc giấy'}
                  </button>
                ))}
              </div>

              {isOther && (
                <div className="row" style={{ gap: 10 }}>
                  <span className="grow">
                    <span className="strong" style={{ display: 'block' }}>Giá</span>
                    <span className="xs muted">bước {vnd(BUFFET_PRICE_STEP)}</span>
                  </span>
                  <span className="stepper">
                    <button type="button" aria-label="Bớt 5.000 đ" disabled={b.price <= 0} onClick={() => setB({ ...b, price: Math.max(0, b.price - BUFFET_PRICE_STEP) })}>
                      <Icon name="minus" size={20} sw={2.4} />
                    </button>
                    <span className="val" aria-live="polite" style={{ minWidth: 92, whiteSpace: 'nowrap', fontSize: 18 }}>{vnd(b.price)}</span>
                    <button type="button" className="plus" aria-label="Thêm 5.000 đ" onClick={() => setB({ ...b, price: b.price + BUFFET_PRICE_STEP })}>
                      <Icon name="plus" size={20} sw={2.4} />
                    </button>
                  </span>
                </div>
              )}

              {group('premium', 'Cao cấp', combo ? combo.n_premium : null, p)}
              {group('regular', 'Phổ thông', combo ? combo.n_regular : null, r)}

              {/* Nguyên liệu đã chọn nhưng không còn trong danh sách: vẫn hiện để bỏ được */}
              {chosen.filter(([id]) => !byId[id]).map(([id, q]) => (
                <div key={id} className="row" style={{ gap: 8, minHeight: 52 }}>
                  <span className="grow strong">Nguyên liệu không còn trong Buffet · {q} g</span>
                  <button type="button" className="btn secondary sm" onClick={() => setQty(id, 0)}>Bỏ</button>
                </div>
              ))}
            </>
          )}
        </div>
        <button className="btn lg block" disabled={!!problem} onClick={() => onSave(out())}>
          {problem || `${onDelete ? 'Lưu' : 'Thêm vào đơn'} · ${vnd(price)}`}
        </button>
        {onSaveNext && !problem && (
          <button className="btn secondary block" onClick={() => onSaveNext(out())}>
            <Icon name="plus" size={18} sw={2.4} /> Thêm chai Buffet khác
          </button>
        )}
        {onDelete && <button className="btn quiet block" style={{ color: 'var(--danger)' }} onClick={onDelete}>Bỏ chai Buffet này</button>}
      </div>
    </>
  );
}
