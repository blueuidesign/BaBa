import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GROUPS, useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { fetchStock, useLoad } from '../lib/data';
import { qty as fq, unitLabel, uuid } from '../lib/format';
import { Header, Loading, Nav, NumberField } from '../components/ui';

const REASONS: [string, string][] = [
  ['shrink', 'Hao hụt khi cân'],
  ['spoiled', 'Hỏng, mốc'],
  ['purchase_missed', 'Nhập thiếu'],
  ['cook_wrong', 'Ghi nấu sai'],
  ['other', 'Khác']
];

export default function StockCount() {
  const { outlet, queue, bump } = useApp();
  const nav = useNavigate();
  const [grp, setGrp] = useState('main');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('shrink');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useLoad((oid) => fetchStock(oid));
  if (!outlet) return null;

  const rows = (data || []).filter((s) => s.enabled);
  const counted = rows.filter((s) => vals[s.ingredient_id] !== undefined && vals[s.ingredient_id] !== '');
  const pending = queue.filter((q) => !q.rejected).length;

  async function save() {
    setErr(null);
    if (!counted.length) return setErr('Chưa nhập số thực tế nào.');
    const big = counted.filter((s) => {
      const a = Number(vals[s.ingredient_id]);
      return s.qty_on_hand > 0 && Math.abs(a - s.qty_on_hand) / s.qty_on_hand > 0.3;
    });
    if (big.length && !confirm(`${big.map((b) => b.name).join(', ')} lệch hơn 30% so với sổ. Kiểm tra lại số cân. Vẫn lưu?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('fn_post_count', {
      p: { outlet_id: outlet!.id, client_id: uuid(), reason, lines: counted.map((s) => ({ ingredient_id: s.ingredient_id, qty_actual: Number(vals[s.ingredient_id]) })) }
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    nav('/kho', { replace: true });
  }

  return (
    <div className="screen">
      <Header title="Kiểm kê kho" back="/kho" sub="Cân đếm thật, ô bỏ trống giữ số sổ" />
      <main className="main with-bar">
        {pending > 0 && <div className="alert warn"><span>Có {pending} đơn chưa đồng bộ; số sổ có thể chưa cập nhật.</span></div>}
        <div className="chips">
          {GROUPS.map((g) => (
            <button key={g.id} className={`chip ${grp === g.id ? 'on' : ''}`} onClick={() => setGrp(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
        {!data ? (
          <Loading />
        ) : (
          <section className="card tight">
            {rows
              .filter((s) => s.grp === grp)
              .map((s) => {
                const v = vals[s.ingredient_id];
                const has = v !== undefined && v !== '';
                const diff = has ? Number(v) - s.qty_on_hand : 0;
                const ratio = s.qty_on_hand ? Math.abs(diff) / s.qty_on_hand : diff ? 1 : 0;
                const color = !has ? 'var(--ink-muted)' : diff === 0 ? 'var(--ok)' : ratio <= 0.1 ? 'var(--warn)' : 'var(--danger)';
                return (
                  <div key={s.ingredient_id} className="list-row">
                    <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="strong">{s.name}</span>
                      <span className="xs muted num">
                        Sổ: {fq(s.qty_on_hand, s.unit)} ·{' '}
                        <span style={{ color, fontWeight: 600 }}>{has ? `${diff > 0 ? '+' : ''}${fq(diff, s.unit)}` : '—'}</span>
                      </span>
                    </span>
                    <NumberField value={v ?? ''} onChange={(x) => setVals((m) => ({ ...m, [s.ingredient_id]: x }))} unit={unitLabel(s.unit)} label={`Thực tế ${s.name}`} width={130} decimals />
                  </div>
                );
              })}
          </section>
        )}
        <section className="card">
          <div className="h2">Lý do chênh lệch</div>
          <div className="chips wrap">
            {REASONS.map(([k, l]) => (
              <button key={k} className={`chip ${reason === k ? 'on' : ''}`} onClick={() => setReason(k)}>
                {l}
              </button>
            ))}
          </div>
          <p className="xs muted">Lưu xong, sổ kho đặt lại theo số thực tế. Chênh lệch được ghi thành bản ghi kiểm kê trong Lịch sử, không sửa các bản ghi cũ. Syrup và cốt kiểm bằng ml theo vạch bình.</p>
        </section>
      </main>
      <div className="bar">
        {err && <span className="err">{err}</span>}
        <button className="btn lg block" disabled={busy || !counted.length} onClick={save}>
          {busy ? 'Đang lưu…' : `Lưu kiểm kê ${counted.length} mục đã đếm`}
        </button>
      </div>
      <Nav />
    </div>
  );
}
