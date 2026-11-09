import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GROUPS, useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { num, unitLabel, uuid, vnd } from '../lib/format';
import { Header, Icon, Nav, NumberField } from '../components/ui';

type Line = { key: string; ingredient_id: string; qty: string; price: string; expires: string };

export default function Purchase() {
  const { outlet, catalog, bump } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [supplier, setSupplier] = useState<string>('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ sig: string; at: number } | null>(() => JSON.parse(sessionStorage.getItem('kho-baba-last-purchase') || 'null'));

  const { data: sups } = useLoad(async (oid) => (await supabase.from('suppliers').select('id,name').eq('outlet_id', oid).order('name')).data || []);

  useEffect(() => {
    const vt = params.get('vt');
    if (vt && !lines.length) setLines([{ key: uuid(), ingredient_id: vt, qty: '', price: '', expires: '' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!outlet || !catalog) return null;
  const buyable = catalog.ingredients.filter((i) => i.kind === 'purchased');
  const total = lines.reduce((s, l) => s + (Number(l.price) || 0), 0);
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save(force = false) {
    setErr(null);
    const valid = lines.filter((l) => l.ingredient_id && Number(l.qty) > 0);
    if (!valid.length) return setErr('Thêm ít nhất một vật tư có số lượng.');
    const payloadLines = valid.map((l) => {
      const ing = catalog!.ingredientById[l.ingredient_id];
      const stockQty = Number(l.qty) * ing.purchase_factor;
      return {
        ingredient_id: l.ingredient_id,
        qty: stockQty,
        unit_cost_vnd: l.price ? Math.round(Number(l.price) / stockQty) : null,
        expires_at: l.expires || null
      };
    });
    const sig = JSON.stringify(payloadLines.map((l) => [l.ingredient_id, l.qty]));
    if (!force && lastSaved && lastSaved.sig === sig && Date.now() - lastSaved.at < 120000) {
      if (!confirm('Bạn vừa nhập giống hệt cách đây chưa tới 2 phút. Vẫn nhập thêm lần nữa?')) return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('fn_post_purchase', {
      p: { outlet_id: outlet!.id, client_id: uuid(), supplier_id: supplier || null, note: note || null, total_vnd: total || null, lines: payloadLines }
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    const ls = { sig, at: Date.now() };
    sessionStorage.setItem('kho-baba-last-purchase', JSON.stringify(ls));
    setLastSaved(ls);
    bump();
    nav('/kho', { replace: true });
  }

  return (
    <div className="screen">
      <Header title="Nhập hàng" back="/kho" sub={outlet.name} />
      <main className="main with-bar">
        <section className="card">
          <div className="h2">Nhà cung cấp</div>
          <div className="chips wrap">
            {(sups || []).map((s: any) => (
              <button key={s.id} className={`chip ${supplier === s.id ? 'on' : ''}`} onClick={() => setSupplier(supplier === s.id ? '' : s.id)}>
                {s.name}
              </button>
            ))}
            {!(sups || []).length && <span className="small muted">Chưa có nhà cung cấp; gán ở trang chi tiết vật tư.</span>}
          </div>
        </section>

        <section className="card">
          {lines.map((l) => {
            const ing = catalog.ingredientById[l.ingredient_id];
            const conv = ing && l.qty && ing.purchase_factor !== 1 ? `= ${num(Number(l.qty) * ing.purchase_factor)} ${unitLabel(ing.unit)} vào kho` : '';
            return (
              <div key={l.key} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div className="row">
                  <select className="input sm grow" value={l.ingredient_id} onChange={(e) => update(l.key, { ingredient_id: e.target.value })} aria-label="Vật tư">
                    <option value="">Chọn vật tư…</option>
                    {GROUPS.filter((g) => g.id !== 'made').map((g) => (
                      <optgroup key={g.id} label={g.name}>
                        {buyable
                          .filter((i) => i.grp === g.id)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <button className="icon-btn" aria-label="Bỏ dòng này" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Icon name="x" size={18} sw={2} />
                  </button>
                </div>
                <div className="row">
                  <NumberField value={l.qty} onChange={(v) => update(l.key, { qty: v })} unit={ing ? unitLabel(ing.purchase_unit) : ''} label="Số lượng" width={140} decimals />
                  <NumberField value={l.price} onChange={(v) => update(l.key, { price: v })} unit="đ" label="Thành tiền (không bắt buộc)" width={160} />
                </div>
                {conv && <span className="small muted num">{conv}{l.price ? ` · giá ${vnd(Number(l.price) / Number(l.qty))}/${unitLabel(ing!.purchase_unit)}` : ''}</span>}
                {ing?.shelf_days != null && (
                  <label className="row small">
                    <span className="grow muted">Hạn dùng (không bắt buộc)</span>
                    <input type="date" className="input sm" style={{ width: 170 }} value={l.expires} onChange={(e) => update(l.key, { expires: e.target.value })} />
                  </label>
                )}
              </div>
            );
          })}
          <button className="btn secondary block" onClick={() => setLines((ls) => [...ls, { key: uuid(), ingredient_id: '', qty: '', price: '', expires: '' }])}>
            <Icon name="plus" size={20} sw={2.2} /> Thêm vật tư
          </button>
          <p className="xs muted">Giá mua không bắt buộc, dùng để tính giá vốn sau này.</p>
        </section>

        <section className="card">
          <label className="field">
            <span className="label">Ghi chú</span>
            <input className="input sm" placeholder="Số lô, người giao, chứng từ…" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </section>
      </main>
      <div className="bar">
        {err && <span className="err">{err}</span>}
        <div className="bar-row">
          <div className="bar-total">
            <span className="label">{lines.filter((l) => l.ingredient_id).length} vật tư</span>
            <span className="value">{vnd(total)}</span>
          </div>
          <button className="btn lg" disabled={busy} onClick={() => save()}>
            <Icon name="check" size={22} sw={2.2} /> {busy ? 'Đang lưu…' : 'Thêm vào kho'}
          </button>
        </div>
      </div>
      <Nav />
    </div>
  );
}
