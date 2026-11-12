import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { csvDownload, exportMonthly, GROUP_COLOR, lastMonths, monthLabel } from '../lib/reports';
import { vndShort, vnToday } from '../lib/format';
import { Header, Icon, Loading, Nav } from '../components/ui';

type Agg = { rev: number; op: number; dt: number };
const short = (v: number) => (v === 0 ? '–' : (v < 0 ? '−' : '') + vndShort(Math.abs(v)));

/** Admin (K01, K02): lãi lỗ cơ sở × 3 tháng gần nhất; Toàn bộ có đầu tư thiết bị và phần trăm hoàn vốn. Danh sách chủ cơ sở. */
export default function AdminOverview() {
  const { isAdmin, outlets, selectOutlet } = useApp();
  const thisMonth = vnToday().slice(0, 7) + '-01';
  const [tab, setTab] = useState<'month' | 'all'>('month');
  const [mode, setMode] = useState<'profit' | 'rev' | 'op'>('profit');
  const [busy, setBusy] = useState(false);
  const months = lastMonths(3, thisMonth).reverse();

  const { data, loading } = useLoad(async () => {
    const [pnl, members] = await Promise.all([
      supabase.from('v_daily_pnl_groups').select('outlet_id,business_date,revenue_vnd,nguyen_lieu,vat_tu,van_hanh,dau_tu').limit(20000),
      supabase.rpc('fn_list_members', { p_outlet: null })
    ]);
    if (pnl.error) throw pnl.error;
    // gom theo cơ sở × tháng
    const m = new Map<string, Agg>();
    ((pnl.data || []) as any[]).forEach((r) => {
      for (const k of [`${r.outlet_id}|${r.business_date.slice(0, 7)}-01`, `${r.outlet_id}|all`]) {
        const x = m.get(k) || { rev: 0, op: 0, dt: 0 };
        x.rev += r.revenue_vnd; x.op += r.nguyen_lieu + r.vat_tu + r.van_hanh; x.dt += r.dau_tu;
        m.set(k, x);
      }
    });
    return { agg: m, owners: ((members.data || []) as any[]).filter((x) => x.role === 'owner') };
  });

  if (!isAdmin) return <Navigate to="/tai-khoan" replace />;
  const names = Object.fromEntries(outlets.map((o) => [o.id, o.name]));
  const get = (oid: string, k: string) => data?.agg.get(`${oid}|${k}`) || { rev: 0, op: 0, dt: 0 };
  const val = (a: Agg) => (mode === 'rev' ? a.rev : mode === 'op' ? a.op : a.rev - a.op);
  const active = outlets.filter((o) => (get(o.id, 'all').rev || get(o.id, 'all').op || get(o.id, 'all').dt));
  const shownOutlets = active.length ? active : outlets;
  const colW = { width: 58, textAlign: 'right' as const };

  async function exportAll() {
    setBusy(true);
    try {
      csvDownload(await exportMonthly(outlets.map((o) => o.id), names), `Tat-ca-co-so_theo-thang_${vnToday()}.csv`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header title="Quản trị" back="/tai-khoan" sub={`${outlets.length} cơ sở`} />
      <main className="main">
        <div className="chips" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button className={`chip ${tab === 'month' ? 'on' : ''}`} style={{ justifyContent: 'center' }} onClick={() => setTab('month')}>Theo tháng</button>
          <button className={`chip ${tab === 'all' ? 'on' : ''}`} style={{ justifyContent: 'center' }} onClick={() => setTab('all')}>Toàn bộ</button>
        </div>
        {loading && !data ? (
          <Loading />
        ) : tab === 'month' ? (
          <section className="card tight">
            <div className="h2" style={{ paddingTop: 12 }}>{mode === 'profit' ? 'Lãi lỗ' : mode === 'rev' ? 'Doanh thu' : 'Chi phí vận hành'} · 3 tháng gần nhất</div>
            <div className="chips" style={{ gap: 6 }}>
              {([['profit', 'Lãi lỗ'], ['rev', 'Doanh thu'], ['op', 'Chi phí']] as const).map(([k, l]) => (
                <button key={k} className={`chip ${mode === k ? 'on' : ''}`} style={{ minHeight: 32, fontSize: 13 }} onClick={() => setMode(k)}>{l}</button>
              ))}
            </div>
            <div className="list-row xs muted" style={{ minHeight: 32 }}>
              <span className="grow">Cơ sở</span>
              {months.map((m) => <span key={m} style={colW}>{monthLabel(m, true)}</span>)}
              <span style={colW}>Cộng</span>
            </div>
            {[...shownOutlets.map((o) => ({ id: o.id, name: o.name })), { id: '*', name: 'Cộng các cơ sở' }].map((o) => {
              const cells = months.map((m) => (o.id === '*' ? shownOutlets.reduce((s, x) => s + val(get(x.id, m)), 0) : val(get(o.id, m))));
              const total = cells.reduce((s, v) => s + v, 0);
              const Row = o.id === '*' ? 'div' : Link;
              return (
                <Row key={o.id} to="/bao-cao" onClick={() => o.id !== '*' && selectOutlet(o.id)} className="list-row small" style={{ minHeight: 44, fontWeight: o.id === '*' ? 700 : undefined }}>
                  <span className="grow strong" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                  {cells.map((v, i) => <span key={i} className="num" style={{ ...colW, color: v < 0 ? 'var(--danger)' : undefined }}>{short(v)}</span>)}
                  <strong className="num" style={{ ...colW, color: total < 0 ? 'var(--danger)' : undefined }}>{short(total)}</strong>
                </Row>
              );
            })}
            <p className="xs muted" style={{ paddingBottom: 12 }}>Lãi lỗ tháng = doanh thu − nguyên liệu − vật tư tiêu hao − vận hành. Không trừ đầu tư thiết bị. Số âm là lỗ.</p>
          </section>
        ) : (
          <section className="card tight">
            <div className="h2" style={{ paddingTop: 12 }}>Toàn bộ · từ khi mở từng cơ sở</div>
            <div className="list-row xs muted" style={{ minHeight: 32 }}>
              <span className="grow">Cơ sở</span>
              <span style={colW}>Lãi trước ĐT</span>
              <span style={colW}>Đầu tư</span>
              <span style={colW}>Sau ĐT</span>
            </div>
            {shownOutlets.map((o) => {
              const a = get(o.id, 'all');
              const pre = a.rev - a.op;
              const pb = a.dt > 0 ? Math.max(0, pre / a.dt) : null;
              return (
                <Link key={o.id} to="/bao-cao" onClick={() => selectOutlet(o.id)} className="list-row small" style={{ minHeight: 52, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <span className="row" style={{ gap: 0 }}>
                    <span className="grow strong" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                    <span className="num" style={{ ...colW, color: pre < 0 ? 'var(--danger)' : undefined }}>{short(pre)}</span>
                    <span className="num" style={colW}>{short(a.dt)}</span>
                    <strong className="num" style={{ ...colW, color: pre - a.dt < 0 ? 'var(--danger)' : undefined }}>{short(pre - a.dt)}</strong>
                  </span>
                  {pb != null && (
                    <span className="row xs muted" style={{ gap: 8 }}>
                      <span className="progress grow"><span style={{ width: `${Math.min(100, pb * 100)}%`, background: GROUP_COLOR.dau_tu }} /></span>
                      <span className="num">{Math.round(pb * 100)}% hoàn vốn</span>
                    </span>
                  )}
                </Link>
              );
            })}
            <p className="xs muted" style={{ paddingBottom: 12 }}>ĐT = đầu tư thiết bị. Hoàn vốn = lãi trước đầu tư ÷ đầu tư. Cơ sở đang lỗ thì hoàn vốn 0%.</p>
          </section>
        )}
        {data && (
          <>
            <button className="btn secondary block" disabled={busy} onClick={exportAll}>
              Xuất CSV tất cả cơ sở, theo tháng
            </button>

            <section className="card tight">
              <div className="row between" style={{ padding: '12px 0 2px' }}>
                <span className="h2">Chủ cơ sở · {new Set(data!.owners.map((m) => m.email)).size}</span>
                <Link to="/nhan-vien" className="small strong" style={{ textDecoration: 'none' }}>Thêm, gỡ →</Link>
              </div>
              {data!.owners.length === 0 && <p className="small muted" style={{ padding: '4px 0 12px' }}>Chưa gán chủ cơ sở nào.</p>}
              {data!.owners.map((m) => (
                <div key={m.membership_id} className="list-row small" style={{ minHeight: 44 }}>
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="strong">{m.full_name || m.email}</span>
                    <span className="xs muted">{m.email}{m.status === 'invited' ? ' · chưa đăng nhập' : ''}</span>
                  </span>
                  <span className="muted">{m.outlet_name}</span>
                </div>
              ))}
            </section>
            <Link to="/co-so" className="btn secondary block">
              <Icon name="plus" size={20} sw={2.2} /> Tạo cơ sở mới
            </Link>
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
