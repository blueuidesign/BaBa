import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GROUPS, useApp } from '../lib/app';
import { fetchStock, useLoad, type StockRow } from '../lib/data';
import { ddmm, num, qty as fq } from '../lib/format';
import { Header, Icon, Loading, Nav } from '../components/ui';

export function StockLine({ s, countOnly = false }: { s: StockRow; countOnly?: boolean }) {
  const scale = Math.max(s.min_qty * 3, s.qty_on_hand, 1);
  const pct = Math.max(0, Math.min(100, (s.qty_on_hand / scale) * 100));
  const mark = Math.min(100, (s.min_qty / scale) * 100);
  const level = s.qty_on_hand <= 0 || (s.needs_order && s.qty_on_hand < s.min_qty * 0.5) ? 'danger' : s.needs_order || s.qty_on_hand < s.min_qty ? 'warn' : '';
  const days =
    s.qty_on_hand <= 0 ? (s.qty_on_hand < 0 ? 'Âm, cần nhập' : 'Hết') : s.days_of_cover != null && s.use_days >= 3 ? `~${num(s.days_of_cover, 1)} ngày` : fq(s.qty_on_hand, s.unit);
  return (
    <Link to={`/kho/${s.ingredient_id}`} className={`stock ${level}`}>
      <span className="n">
        {s.name}
        {s.on_order && <span className="badge info" style={{ marginLeft: 6 }}>Đang về</span>}
        {s.expiring && <span className="badge warn" style={{ marginLeft: 6 }}>Hạn {ddmm(s.nearest_expiry!)}</span>}
        {countOnly && <span className="badge info" style={{ marginLeft: 6 }}>đếm khi kiểm kê</span>}
      </span>
      <span className="d">{days}</span>
      <span className="track">
        <span className="fill" style={{ width: `${pct}%` }} />
        <span className="mark" style={{ left: `${mark}%` }} />
      </span>
      <span className="m">
        <span>
          Còn {fq(s.qty_on_hand, s.unit)} · tối thiểu {fq(s.min_qty, s.unit)}
        </span>
        <span>{s.kind === 'made' ? 'Tự làm' : `${s.supplier_name || 'Chưa gán NCC'} · ${s.lead_days ? `giao ${s.lead_days} ngày` : 'mua ngay được'}`}</span>
      </span>
    </Link>
  );
}

export default function Stock() {
  const { outlet, catalog } = useApp();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<string>(params.get('loc') === 'can-dat' ? 'need' : 'all');
  const { data, loading } = useLoad((oid) => fetchStock(oid));
  if (!outlet) return null;

  const rows = (data || []).filter((s) => s.enabled);
  const needs = rows.filter((s) => s.needs_order);
  // Bao bì không nằm trong quy tắc trừ bao bì (ly, ống hút, nắp…): chỉ cập nhật khi kiểm kê
  const countOnly = (x: StockRow) => x.grp === 'packaging' && !(catalog?.packaging || []).some((r) => r.ingredient_id === x.ingredient_id);
  const visible = rows.filter((s) => (filter === 'all' ? true : filter === 'need' ? s.needs_order : s.grp === filter));
  const bySupplier = new Map<string, StockRow[]>();
  needs.forEach((s) => {
    const k = s.supplier_name || 'Chưa gán nhà cung cấp';
    bySupplier.set(k, [...(bySupplier.get(k) || []), s]);
  });
  const empty = rows.length > 0 && rows.every((r) => r.qty_on_hand === 0);

  return (
    <div className="screen">
      <Header
        title="Tồn kho"
        back="/tai-khoan"
        sub={outlet.name}
        right={
          <>
            <Link to="/kho/kiem-ke" className="icon-btn" aria-label="Kiểm kê kho">
              <Icon name="scale" size={24} />
            </Link>
            <Link to="/kho/nhap" className="icon-btn" aria-label="Nhập hàng" style={{ color: 'var(--ink-brand)' }}>
              <Icon name="plus" size={26} sw={2.2} />
            </Link>
          </>
        }
      />
      <main className="main">
        <div className="chips">
          {[
            ['all', `Tất cả ${rows.length}`],
            ['need', `Cần đặt ${needs.length}`],
            ...GROUPS.map((g) => [g.id, g.name])
          ].map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            {empty && (
              <section className="card">
                <strong>Kho chưa có số nào</strong>
                <span className="small muted">Danh mục vật tư bên dưới đã có sẵn từ BaBa. Nhập lần mua đầu tiên, hoặc kiểm kê để ghi số đang có.</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to="/kho/nhap" className="btn">
                    <Icon name="plus" size={20} sw={2.2} /> Nhập hàng lần đầu
                  </Link>
                  <Link to="/kho/kiem-ke" className="btn secondary">Kiểm kê</Link>
                </div>
              </section>
            )}
            <Link to="/nha-cung-cap" className="list-row card tight" style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="ico-box"><Icon name="truck" size={20} /></span>
              <span className="grow strong">Nhà cung cấp</span>
              <span className="small muted">Ai cung cấp món nào</span>
              <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />
            </Link>
            {[...bySupplier.entries()].map(([sup, items]) => (
              <Link key={sup} to={items[0].supplier_id ? `/nha-cung-cap?id=${items[0].supplier_id}` : `/kho/${items[0].ingredient_id}`} className="alert warn" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
                <Icon name="truck" size={22} sw={2} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <strong>
                    Nên đặt hôm nay: {sup} ({items.length} món)
                  </strong>
                  <span>
                    {items.map((i) => i.name).join(', ')}
                    {items[0].lead_days ? ` · giao ${items[0].lead_days} ngày` : ''}
                  </span>
                </span>
              </Link>
            ))}
            {GROUPS.map((g) => {
              const items = visible.filter((s) => s.grp === g.id);
              if (!items.length) return null;
              return (
                <section key={g.id} className="card tight">
                  <div className="h2" style={{ padding: '12px 0 0' }}>{g.name}</div>
                  {items.map((s) => (
                    <StockLine key={s.ingredient_id} s={s} countOnly={countOnly(s)} />
                  ))}
                  {g.id === 'packaging' && items.some(countOnly) && (
                    <p className="xs muted" style={{ paddingBottom: 10 }}>Món có nhãn "đếm khi kiểm kê" chưa có trong công thức nên app không tự trừ khi nấu, bán. Số còn lại cập nhật khi Kiểm kê kho.</p>
                  )}
                </section>
              );
            })}
            {!visible.length && <p className="small muted" style={{ textAlign: 'center', padding: 24 }}>Không có vật tư nào cần đặt.</p>}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
