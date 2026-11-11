import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { catName, EXPENSE_CATS, monthLabel } from '../lib/reports';
import { uuid, vnd, vnToday } from '../lib/format';
import { Empty, Header, Icon, Loading, MoneyInput, Nav, confirmDialog, useToast } from '../components/ui';

/** Tháng trước tháng hiện tại, dạng YYYY-MM */
function prevMonth() {
  const [y, m] = vnToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export default function Historical() {
  const { outlet, canManage, bump } = useApp();
  const toast = useToast();
  const maxMonth = prevMonth();
  const [kind, setKind] = useState<'revenue' | 'expense'>('revenue');
  const [cat, setCat] = useState('nhap_hang');
  const [month, setMonth] = useState(maxMonth);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clientId, setClientId] = useState(uuid);

  const { data, loading } = useLoad(async (oid) => {
    const { data, error } = await supabase.from('historical_entries').select('*').eq('outlet_id', oid).eq('status', 'active').order('month', { ascending: false }).order('created_at');
    if (error) throw error;
    return (data || []) as any[];
  });

  if (!outlet) return null;
  if (!canManage) return <Navigate to="/bao-cao" replace />;

  async function save() {
    setErr(null);
    if (!Number(amount)) return setErr('Nhập số tiền lớn hơn 0.');
    if (!month || month > maxMonth) return setErr('Chỉ nhập cho các tháng đã qua. Tháng này app tự tính từ đơn và chi phí.');
    setBusy(true);
    const { error } = await supabase.rpc('fn_post_historical', {
      p: { outlet_id: outlet!.id, client_id: clientId, month: `${month}-01`, kind, category: kind === 'expense' ? cat : null, amount_vnd: Number(amount), note: note.trim() || null }
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    toast.show(`Đã lưu ${kind === 'revenue' ? 'doanh thu' : 'chi phí'} ${monthLabel(`${month}-01`)}`);
    setAmount('');
    setNote('');
    setClientId(uuid());
    bump();
  }

  async function remove(r: any) {
    const ok = await confirmDialog({
      title: 'Xóa dòng này?',
      text: `${r.kind === 'revenue' ? 'Doanh thu' : `Chi phí · ${catName(r.category)}`} ${monthLabel(r.month)}: ${vnd(r.amount_vnd)}. Báo cáo sẽ trừ số này ra.`,
      ok: 'Xóa',
      danger: true
    });
    if (!ok) return;
    const { error } = await supabase.rpc('fn_reverse_historical', { p_id: r.id, p_reason: 'Nhập nhầm' });
    if (error) return toast.show(errorText(error));
    bump();
  }

  const byMonth = new Map<string, any[]>();
  (data || []).forEach((r) => byMonth.set(r.month, [...(byMonth.get(r.month) || []), r]));

  return (
    <div className="screen">
      <Header title="Số liệu tháng cũ" back="/bao-cao" sub={outlet.name} />
      <main className="main with-bar">
        <p className="small">Nhập tổng doanh thu hoặc chi phí của các tháng trước khi dùng app (ví dụ chép từ Knote) để báo cáo theo tháng đủ số. Mỗi lần nhập là một dòng; nhập nhiều dòng cho một tháng thì app cộng lại.</p>
        <section className="card">
          <div className="seg" role="tablist" aria-label="Loại số liệu">
            <button className={kind === 'revenue' ? 'on' : ''} onClick={() => setKind('revenue')}>Doanh thu</button>
            <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Chi phí</button>
          </div>
          {kind === 'expense' && (
            <div className="chips wrap">
              {EXPENSE_CATS.map((c) => (
                <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <label className="field">
            <span className="label">Tháng</span>
            <span className="input-wrap">
              <input type="month" value={month} max={maxMonth} onChange={(e) => setMonth(e.target.value)} style={{ textAlign: 'left', fontSize: 16 }} />
            </span>
          </label>
          <div className="field">
            <span className="label">Số tiền</span>
            <MoneyInput value={amount} onChange={setAmount} label="Số tiền" big />
          </div>
          <label className="field">
            <span className="label">Ghi chú (không bắt buộc)</span>
            <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: theo sổ Knote" />
          </label>
        </section>

        {loading && !data ? (
          <Loading />
        ) : byMonth.size === 0 ? (
          <Empty icon="history" title="Chưa nhập tháng nào" text="Bắt đầu từ tháng gần nhất. Nhập doanh thu trước, rồi tới từng loại chi phí." />
        ) : (
          [...byMonth.entries()].map(([m, items]) => {
            const rev = items.filter((r) => r.kind === 'revenue').reduce((s, r) => s + r.amount_vnd, 0);
            const exp = items.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount_vnd, 0);
            return (
              <section key={m} className="card tight">
                <div className="row between" style={{ padding: '12px 0 2px' }}>
                  <span className="h2" style={{ textTransform: 'capitalize' }}>{monthLabel(m)}</span>
                  <span className="xs muted">Lợi nhuận {vnd(rev - exp)}</span>
                </div>
                {items.map((r) => (
                  <div key={r.id} className="list-row">
                    <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="strong">{r.kind === 'revenue' ? 'Doanh thu' : `Chi phí · ${catName(r.category)}`}</span>
                      {r.note && <span className="xs muted">{r.note}</span>}
                    </span>
                    <strong className="num">{vnd(r.amount_vnd)}</strong>
                    <button className="icon-btn" aria-label="Xóa dòng này" onClick={() => remove(r)} style={{ color: 'var(--ink-muted)' }}>
                      <Icon name="x" size={18} />
                    </button>
                  </div>
                ))}
              </section>
            );
          })
        )}
      </main>
      <div className="bar">
        {err && <span className="err">{err}</span>}
        <button className="btn lg block" disabled={busy || !amount} onClick={save}>
          {busy ? 'Đang lưu…' : `Lưu ${kind === 'revenue' ? 'doanh thu' : 'chi phí'} ${month ? monthLabel(`${month}-01`) : ''}`}
        </button>
      </div>
      <Nav />
      {toast.node}
    </div>
  );
}
