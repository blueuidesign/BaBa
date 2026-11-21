import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { vnd } from '../lib/format';
import { Bottle, BUFFET_COLOR, Cup, Icon } from './ui';

/** Một chai (cốc) Buffet đang ghi: lượng nguyên liệu cho MỘT phần. */
export type BuffetPick = { key: string; container: 'chai' | 'coc'; less: boolean; price: number; items: Record<string, number> };
export type BuffetIng = { ingredient_id: string; name: string; unit: string };

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

/** Nguyên liệu chọn được, hay dùng nhất ở trên (fn_buffet_ingredients, 0065). */
export function useBuffetIngredients(outletId: string | undefined) {
  return useLoad(async () => {
    if (!outletId) return [] as BuffetIng[];
    const { data, error } = await supabase.rpc('fn_buffet_ingredients', { p_outlet: outletId });
    if (error) throw error;
    return (data || []) as BuffetIng[];
  }, [outletId]);
}

/** Bảng chọn Buffet (thiết kế BF02–BF04): giá mặc định 30.000 đ, ±5.000 đ; nguyên liệu bấm Thêm = 20 g, sau đó ±5 g; chai hoặc cốc. */
export default function BuffetSheet({ outletId, value, onSave, onClose, onDelete }: {
  outletId: string;
  value: BuffetPick;
  onSave: (b: BuffetPick) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [b, setB] = useState<BuffetPick>(value);
  const { data: ings, loading, error } = useBuffetIngredients(outletId);
  const list = ings || [];
  const byId = Object.fromEntries(list.map((i) => [i.ingredient_id, i]));
  const chosen = Object.entries(b.items).filter(([, q]) => q > 0);
  const total = chosen.reduce((s, [, q]) => s + q, 0);
  const setQty = (id: string, q: number) =>
    setB((x) => {
      const items = { ...x.items };
      if (q <= 0) delete items[id];
      else items[id] = q;
      return { ...x, items };
    });
  const unitOf = (id: string) => byId[id]?.unit || 'g';

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet sheet-fixed" role="dialog" aria-labelledby="bf-t">
        <div className="row between" style={{ minHeight: 32 }}>
          <h2 id="bf-t" style={{ fontSize: 18 }}>Buffet · tự chọn nguyên liệu</h2>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>
        <div className="sheet-scroll">
          <div className="row" style={{ gap: 10, padding: 12, borderRadius: 'var(--radius-md, 14px)', background: '#F4F1EA' }}>
            {b.container === 'coc' ? <Cup color={BUFFET_COLOR} size={30} /> : <Bottle color={BUFFET_COLOR} size={30} />}
            <span className="grow">
              <span className="strong" style={{ display: 'block' }}>{chosen.length} nguyên liệu · {total} g</span>
              <span className="xs muted">
                {chosen.length ? buffetSummary(b.items, (id) => byId[id]) : `Bấm Thêm ở nguyên liệu muốn dùng: lần đầu ${BUFFET_FIRST} g, sau đó mỗi lần ±${BUFFET_STEP} g`}
              </span>
            </span>
          </div>

          <div className="seg3 outline" role="radiogroup" aria-label="Chai hay cốc giấy">
            {(['chai', 'coc'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={b.container === c} className={b.container === c ? 'on' : ''}
                style={{ minHeight: 44 }} onClick={() => setB({ ...b, container: c })}>
                {c === 'chai' ? 'Chai' : 'Cốc giấy'}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 10 }}>
            <span className="grow">
              <span className="strong" style={{ display: 'block' }}>Giá</span>
              <span className="xs muted">mặc định {vnd(BUFFET_PRICE)} · bước {vnd(BUFFET_PRICE_STEP)}</span>
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

          <span className="h2" style={{ margin: 0 }}>Nguyên liệu · hay dùng nhất ở trên</span>
          {loading && !ings ? (
            <span className="small muted">Đang tải nguyên liệu…</span>
          ) : error ? (
            <span className="err">Không tải được danh sách nguyên liệu. Đóng bảng rồi mở lại.</span>
          ) : (
            <div className="bf-list">
              {list.map((i) => {
                const q = b.items[i.ingredient_id] || 0;
                return (
                  <div key={i.ingredient_id} className="row" style={{ gap: 8, minHeight: 52, borderBottom: '1px solid var(--border)' }}>
                    <span className={`grow ${q ? 'strong' : ''}`}>{i.name}</span>
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
                    ) : (
                      <button type="button" className="btn sm" aria-label={`Thêm ${i.name} ${BUFFET_FIRST} ${i.unit}`} onClick={() => setQty(i.ingredient_id, BUFFET_FIRST)}>
                        <Icon name="plus" size={16} sw={2.4} /> Thêm
                      </button>
                    )}
                  </div>
                );
              })}
              {/* Nguyên liệu đã chọn nhưng không còn trong danh sách (đã ngừng dùng): vẫn hiện để bớt được */}
              {chosen.filter(([id]) => !byId[id]).map(([id, q]) => (
                <div key={id} className="row" style={{ gap: 8, minHeight: 52 }}>
                  <span className="grow strong">Nguyên liệu đã ngừng dùng · {q} {unitOf(id)}</span>
                  <button type="button" className="btn secondary sm" onClick={() => setQty(id, 0)}>Bỏ</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn lg block" disabled={!chosen.length} onClick={() => onSave(b)}>
          {chosen.length ? `${onDelete ? 'Lưu' : 'Thêm vào đơn'} · ${vnd(b.price)}` : 'Chọn ít nhất một nguyên liệu'}
        </button>
        {onDelete && <button className="btn quiet block" style={{ color: 'var(--danger)' }} onClick={onDelete}>Bỏ chai Buffet này</button>}
      </div>
    </>
  );
}
