import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { catColor, catName, EXPENSE_CATS, lastMonths, monthLabel } from '../lib/reports';
import { ddmm, vnd, vndShort, vnToday } from '../lib/format';
import { Empty, Header, Icon, Loading, Nav, reasonDialog, useToast } from '../components/ui';

/** Biểu đồ tròn rỗng giữa, vẽ bằng stroke-dasharray để không cần thư viện. */
function Donut({ parts, total }: { parts: { id: string; value: number }[]; total: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={140} height={140} viewBox="0 0 120 120" role="img" aria-label={`Tổng chi ${vnd(total)}`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bg-200)" strokeWidth="16" />
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.id}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={catColor(p.id)}
                strokeWidth="16"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += len;
            return el;
          })}
      <text x="60" y="56" textAnchor="middle" fontSize="10" fill="var(--ink-muted)">Tổng chi</text>
      <text x="60" y="72" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)">{vndShort(total)}</text>
    </svg>
  );
}

export default function Expenses() {
  const { outlet, canManage, bump } = useApp();
  const toast = useToast();
  const thisMonth = vnToday().slice(0, 7) + '-01';
  const [month, setMonth] = useState(thisMonth);
  const [cat, setCat] = useState<string | null>(null);

  const { data, loading } = useLoad(
    async (oid) => {
      const [y, m] = month.split('-').map(Number);
      const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const [byCat, rows] = await Promise.all([
        supabase.from('v_monthly_expenses').select('category,amount_vnd,has_historical').eq('outlet_id', oid).eq('month', month),
        supabase.from('expenses').select('*').eq('outlet_id', oid).eq('status', 'active').gte('spent_on', month).lt('spent_on', to).order('spent_on', { ascending: false }).order('created_at', { ascending: false })
      ]);
      if (rows.error) throw rows.error;
      return { byCat: (byCat.data || []) as any[], rows: (rows.data || []) as any[] };
    },
    [month]
  );

  if (!outlet) return null;
  if (!canManage) return <Navigate to="/bao-cao" replace />;

  const parts = EXPENSE_CATS.map((c) => ({ id: c.id, value: (data?.byCat || []).filter((r) => r.category === c.id).reduce((s, r) => s + r.amount_vnd, 0) }));
  const total = parts.reduce((s, p) => s + p.value, 0);
  const hasHistorical = (data?.byCat || []).some((r) => r.has_historical);
  const rows = (data?.rows || []).filter((r) => !cat || r.category === cat);

  async function cancel(r: any) {
    const why = await reasonDialog({
      title: 'Hủy khoản chi này?',
      text: `${catName(r.category)} · ${vnd(r.amount_vnd)} · ${ddmm(r.spent_on)}. Khoản chi vẫn còn trong Lịch sử, có ghi "đã hủy".`,
      ok: 'Hủy khoản chi',
      danger: true,
      reason: { label: 'Lý do', placeholder: 'Ví dụ: ghi trùng', required: true }
    });
    if (!why) return;
    const { error } = await supabase.rpc('fn_reverse_expense', { p_id: r.id, p_reason: why });
    if (error) return toast.show(errorText(error));
    toast.show('Đã hủy khoản chi');
    bump();
  }

  return (
    <div className="screen">
      <Header
        title="Chi phí"
        back="/bao-cao"
        sub={outlet.name}
        right={
          <Link to="/chi-phi/moi" className="icon-btn" aria-label="Ghi chi phí" style={{ color: 'var(--ink-brand)' }}>
            <Icon name="plus" size={26} sw={2.2} />
          </Link>
        }
      />
      <main className="main">
        <div className="chips">
          {lastMonths(6, thisMonth).map((m) => (
            <button key={m} className={`chip ${month === m ? 'on' : ''}`} onClick={() => setMonth(m)}>
              {m === thisMonth ? 'Tháng này' : monthLabel(m, true)}
            </button>
          ))}
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <section className="card">
              <div className="h2">Chi theo loại · {monthLabel(month)}</div>
              <div className="row" style={{ gap: 16, alignItems: 'center' }}>
                <Donut parts={parts} total={total} />
                <div className="donut-legend grow">
                  {parts.map((p) => (
                    <button
                      key={p.id}
                      className="row"
                      style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', opacity: cat && cat !== p.id ? 0.45 : 1, fontSize: 14 }}
                      onClick={() => setCat(cat === p.id ? null : p.id)}
                    >
                      <span className="sw" style={{ background: catColor(p.id) }} />
                      <span className="grow" style={{ textAlign: 'left' }}>{catName(p.id)}</span>
                      <span className="num strong">{vndShort(p.value)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {hasHistorical && <p className="xs muted">Có số nhập tay cho tháng này (từ sổ cũ). Xem ở "Số liệu tháng cũ".</p>}
            </section>

            <Link to="/chi-phi/moi" className="btn lg block">
              <Icon name="plus" size={22} sw={2} /> Ghi chi phí
            </Link>

            {rows.length === 0 ? (
              <Empty icon="coin" title={cat ? `Chưa có khoản ${catName(cat).toLowerCase()} nào` : 'Tháng này chưa có khoản chi nào'} text="Tiền nhập hàng tự ghi vào đây khi bạn nhập kho có tổng tiền. Các khoản khác như mặt bằng, lương thì ghi tay.">
                {month < thisMonth && (
                  <Link to="/thang-cu" className="btn secondary">Nhập tổng chi tháng cũ</Link>
                )}
              </Empty>
            ) : (
              <section className="card tight">
                <div className="row between" style={{ padding: '12px 0 2px' }}>
                  <span className="h2">Lịch sử chi</span>
                  {cat && <button className="btn quiet" style={{ minHeight: 28 }} onClick={() => setCat(null)}>Tất cả loại</button>}
                </div>
                {rows.map((r) => (
                  <div key={r.id} className="list-row">
                    <span className="sw" style={{ width: 10, height: 10, borderRadius: 3, background: catColor(r.category), flexShrink: 0 }} />
                    <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="strong">{catName(r.category)}</span>
                      <span className="xs muted">
                        {ddmm(r.spent_on)}
                        {r.note ? ` · ${r.note}` : ''}
                        {r.source === 'purchase' ? ' · tự ghi từ nhập kho' : ''}
                      </span>
                    </span>
                    <strong className="num">{vnd(r.amount_vnd)}</strong>
                    {r.source === 'manual' && (
                      <button className="icon-btn" aria-label="Hủy khoản chi" onClick={() => cancel(r)} style={{ color: 'var(--ink-muted)' }}>
                        <Icon name="x" size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
      <Nav />
      {toast.node}
    </div>
  );
}
