import { useState } from 'react';
import { useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { fetchStock, useLoad } from '../lib/data';
import { ddmm, num, qty as fq, uuid } from '../lib/format';
import { Header, Icon, Loading, Nav, Stepper, useToast } from '../components/ui';

export default function Batches() {
  const { outlet, catalog, bump } = useApp();
  const toast = useToast();
  const [count, setCount] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data: stock } = useLoad((oid) => fetchStock(oid));

  if (!outlet) return null;
  const stockOf = (iid: string) => stock?.find((s) => s.ingredient_id === iid);

  async function record(brId: string) {
    setErr(null);
    setBusy(brId);
    const { data, error } = await supabase.rpc('fn_post_batch', {
      p: { outlet_id: outlet!.id, client_id: uuid(), batch_recipe_id: brId, batch_count: count[brId] ?? 1 }
    });
    setBusy(null);
    if (error) return setErr(errorText(error));
    bump();
    toast.show(`Đã ghi mẻ${(data as any)?.expires_at ? `, hạn ${ddmm((data as any).expires_at)}` : ''}`);
  }

  return (
    <div className="screen">
      <Header title="Mẻ syrup và cốt" back="/nau" sub="Bán thành phẩm tự làm" />
      <main className="main">
        {!catalog || !stock ? (
          <Loading />
        ) : (
          catalog.batchRecipes.map((br, idx) => {
            const out = catalog.ingredientById[br.output_ingredient_id];
            const st = stockOf(br.output_ingredient_id);
            const n = count[br.id] ?? 1;
            const low = st && st.qty_on_hand < st.min_qty;
            const shortItems = br.items.filter((it) => (stockOf(it.ingredient_id)?.qty_on_hand ?? 0) < it.qty * n);
            return (
              <section key={br.id} className="card">
                <div className="row">
                  <span className="ico-box" style={{ width: 44, height: 44, background: 'var(--bg-brand-soft)' }}>
                    <Icon name={out?.code === 'syrup' ? 'blender' : 'coin'} size={24} />
                  </span>
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{br.name}</span>
                    <span className="small muted">Mỗi mẻ {fq(br.output_qty, out?.unit || 'ml')}</span>
                  </span>
                  <span className={`badge ${low ? 'warn' : 'ok'}`}>Còn {fq(st?.qty_on_hand ?? 0, out?.unit || 'ml')}</span>
                </div>
                {st?.nearest_expiry && <span className="small muted">Mẻ gần nhất hết hạn {ddmm(st.nearest_expiry)}</span>}
                <div className="row">
                  <span className="grow strong">Số mẻ</span>
                  <Stepper value={n} min={0.5} step={0.5} onChange={(v) => setCount((c) => ({ ...c, [br.id]: v }))} label="mẻ" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, background: 'var(--bg-200)', borderRadius: 'var(--radius-md)' }}>
                  <div className="h2">Nguyên liệu sẽ trừ</div>
                  {br.items.map((it) => {
                    const ing = catalog.ingredientById[it.ingredient_id];
                    const short = shortItems.includes(it);
                    return (
                      <div key={it.ingredient_id} className="row between small">
                        <span>{ing?.name}</span>
                        <strong className="num" style={{ color: short ? 'var(--danger)' : undefined }}>
                          {fq(it.qty * n, ing?.unit || '')}
                          {short ? ' · thiếu' : ''}
                        </strong>
                      </div>
                    );
                  })}
                </div>
                {br.note && <span className="small muted">{br.note}</span>}
                {shortItems.length > 0 && <span className="small" style={{ color: 'var(--warn)' }}>Kho chưa đủ nguyên liệu; vẫn ghi được nếu hàng đã có mà chưa nhập.</span>}
                <button className={`btn block ${idx > 0 ? 'secondary' : ''}`} disabled={busy === br.id} onClick={() => record(br.id)}>
                  {busy === br.id ? 'Đang ghi…' : `Ghi đã làm ${num(n, 1)} mẻ ${br.name.toLowerCase()}`}
                </button>
              </section>
            );
          })
        )}
        {err && <span className="err">{err}</span>}
        <p className="xs muted">Cốt cold brew trừ 75 ml mỗi chai Cold Brew khi ghi nấu. Bản 1 chưa ghi mức ngọt theo đơn nên syrup không tự trừ theo bán; đo bình syrup khi đối chiếu cuối ngày để sổ khớp thực tế.</p>
      </main>
      <Nav />
      {toast.node}
    </div>
  );
}
