import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { errorText } from '../lib/supabase';
import { csvDownload, exportDaily, exportMonthly, exportOrders, lastMonths, monthLabel } from '../lib/reports';
import { vnToday } from '../lib/format';
import { Header, Icon, Nav } from '../components/ui';

/** F04 · Xuất file Excel (CSV) cho cơ sở đang chọn; admin xuất thêm tất cả cơ sở. */
export default function Export() {
  const { outlet, outlets, catalog, canManage, isAdmin } = useApp();
  const thisMonth = vnToday().slice(0, 7) + '-01';
  const [month, setMonth] = useState(thisMonth);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!outlet) return null;
  if (!canManage) return <Navigate to="/bao-cao" replace />;
  const product = (id: string) => catalog?.allProducts.find((p) => p.id === id);
  const ym = month.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e: any) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const Row = ({ k, title, sub, onClick }: { k: string; title: string; sub: string; onClick: () => void }) => (
    <button className="list-row" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }} disabled={!!busy} onClick={onClick}>
      <span className="ico-box"><Icon name="box" size={20} /></span>
      <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="strong">{title}</span>
        <span className="small muted">{sub}</span>
      </span>
      <span className="small strong" style={{ color: 'var(--ink-brand)' }}>{busy === k ? 'Đang tạo…' : 'Tải về'}</span>
    </button>
  );

  return (
    <div className="screen">
      <Header title="Xuất file Excel" back="/bao-cao" sub={outlet.name} />
      <main className="main">
        <p className="small">File CSV mở bằng Excel hoặc Google Sheets. Không gồm đơn đã hoàn tác.</p>
        <span className="label strong small">Tháng</span>
        <div className="chips">
          {lastMonths(6, thisMonth).map((mm) => (
            <button key={mm} className={`chip ${month === mm ? 'on' : ''}`} onClick={() => setMonth(mm)}>
              {mm === thisMonth ? 'Tháng này' : monthLabel(mm, true)}
            </button>
          ))}
        </div>
        <section className="card tight">
          <Row k="orders" title={`Đơn hàng · ${monthLabel(month)}`} sub="Mỗi dòng một món của một đơn: ngày, giờ, số chai, thành tiền"
            onClick={() => run('orders', async () => csvDownload(await exportOrders(outlet.id, month, to, product), `Don-hang_${outlet.name}_${ym}.csv`))} />
          <Row k="daily" title={`Theo ngày · ${monthLabel(month)}`} sub="Doanh thu, chi phí, lợi nhuận từng ngày trong tháng"
            onClick={() => run('daily', async () => csvDownload(await exportDaily(outlet.id, ym), `Theo-ngay_${outlet.name}_${ym}.csv`))} />
          <Row k="monthly" title="Theo tháng · mọi tháng" sub="Doanh thu, chi phí, lợi nhuận từng tháng, gồm số nhập tay tháng cũ"
            onClick={() => run('monthly', async () => csvDownload(await exportMonthly([outlet.id], { [outlet.id]: outlet.name }), `Theo-thang_${outlet.name}.csv`))} />
        </section>
        {isAdmin && (
          <section className="card tight">
            <div className="h2" style={{ padding: '12px 0 2px' }}>Admin</div>
            <Row k="all" title="Tất cả cơ sở · theo tháng" sub={`${outlets.length} cơ sở, mỗi dòng một cơ sở một tháng`}
              onClick={() => run('all', async () => csvDownload(await exportMonthly(outlets.map((o) => o.id), Object.fromEntries(outlets.map((o) => [o.id, o.name]))), `Tat-ca-co-so_theo-thang_${vnToday()}.csv`))} />
          </section>
        )}
        {err && <span className="err">{err}</span>}
      </main>
      <Nav />
    </div>
  );
}
