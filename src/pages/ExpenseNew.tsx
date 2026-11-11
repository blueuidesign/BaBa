import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { EXPENSE_CATS } from '../lib/reports';
import { uuid, vnToday } from '../lib/format';
import { Header, MoneyInput, Nav } from '../components/ui';

export default function ExpenseNew() {
  const { outlet, canManage, bump } = useApp();
  const nav = useNavigate();
  const [cat, setCat] = useState('mat_bang');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(vnToday());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // client_id cố định cho một lần nhập: bấm Lưu hai lần hay gửi lại cũng không tạo trùng
  const [clientId] = useState(uuid);

  if (!outlet) return null;
  if (!canManage) return <Navigate to="/bao-cao" replace />;

  async function save() {
    setErr(null);
    if (!Number(amount)) return setErr('Nhập số tiền lớn hơn 0.');
    setBusy(true);
    const { error } = await supabase.rpc('fn_post_expense', {
      p: { outlet_id: outlet!.id, client_id: clientId, category: cat, amount_vnd: Number(amount), spent_on: date, note: note.trim() || null }
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    bump();
    nav('/chi-phi', { replace: true });
  }

  return (
    <div className="screen">
      <Header title="Ghi chi phí" back="/chi-phi" sub={outlet.name} />
      <main className="main with-bar">
        <section className="card">
          <span className="label strong small">Loại chi</span>
          <div className="chips wrap">
            {EXPENSE_CATS.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          {cat === 'nhap_hang' && <p className="xs muted">Nhập kho có ghi tổng tiền thì app đã tự ghi khoản này. Chỉ ghi ở đây khoản mua chưa nhập kho.</p>}
          <div className="field">
            <span className="label">Số tiền</span>
            <MoneyInput value={amount} onChange={setAmount} label="Số tiền" big />
          </div>
          <label className="field">
            <span className="label">Ngày chi</span>
            <span className="input-wrap">
              <input type="date" value={date} max={vnToday()} onChange={(e) => setDate(e.target.value)} style={{ textAlign: 'left', fontSize: 16 }} />
            </span>
          </label>
          <label className="field">
            <span className="label">Ghi chú (không bắt buộc)</span>
            <input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: tiền điện tháng 10" />
          </label>
        </section>
      </main>
      <div className="bar">
        {err && <span className="err">{err}</span>}
        <button className="btn lg block" disabled={busy || !amount} onClick={save}>
          {busy ? 'Đang lưu…' : 'Lưu khoản chi'}
        </button>
      </div>
      <Nav />
    </div>
  );
}
