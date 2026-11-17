import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OrderChangesList } from './OrderChanges';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { removeFromQueue } from '../lib/queue';
import { dateVN, timeHM, vnd, vnToday, weekdayLabel } from '../lib/format';
import { Empty, Header, Icon, Loading, Nav } from '../components/ui';

const FILTERS: [string, string][] = [
  ['all', 'Tất cả'],
  ['order', 'Đơn'],
  ['cook', 'Nấu'],
  ['batch', 'Mẻ'],
  ['purchase', 'Nhập kho'],
  ['count', 'Kiểm kê'],
  ['close', 'Đối chiếu'],
  ['expense', 'Chi phí']
];
const ICON: Record<string, [string, string]> = {
  order: ['cart', ''], cook: ['blender', 'info'], batch: ['blender', 'info'], purchase: ['truck', ''], count: ['scale', 'warn'], close: ['check', ''], expense: ['coin', '']
};
const PAGE = 50;

export default function History() {
  const { outlet, queue, dataVersion, canManage } = useApp();
  // Lịch sử bản ghi chỉ dành cho chủ cơ sở và admin (Tùng 17/11)
  const [sp] = useSearchParams();
  const [filter, setFilter] = useState(sp.get('loc') === 'sua-huy' ? 'changes' : 'all');
  // Bộ lọc "Sửa, hủy đơn" chỉ chủ cơ sở và admin thấy; nội dung lấy từ audit_log, không phải v_activity
  const filters = canManage ? [...FILTERS.slice(0, 2), ['changes', 'Sửa, hủy đơn'] as [string, string], ...FILTERS.slice(2)] : FILTERS;
  const [rows, setRows] = useState<any[] | null>(null);
  const [more, setMore] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  const [showReversed, setShowReversed] = useState(false);

  async function load(offset: number) {
    if (!outlet || filter === 'changes') return;
    let q = supabase.from('v_activity').select('*').eq('outlet_id', outlet.id).order('at', { ascending: false }).range(offset, offset + PAGE - 1);
    if (filter !== 'all') q = q.eq('kind', filter);
    const { data } = await q;
    const got = data || [];
    setRows((r) => (offset === 0 ? got : [...(r || []), ...got]));
    setMore(got.length === PAGE);
    const ids = [...new Set(got.map((x: any) => x.actor_id).filter(Boolean))];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id,full_name,email').in('id', ids);
      setNames((n) => ({ ...n, ...Object.fromEntries((ps || []).map((p: any) => [p.id, p.full_name || p.email])) }));
    }
  }
  useEffect(() => {
    setRows(null);
    if (canManage) load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet?.id, filter, dataVersion, canManage]);

  if (!outlet) return null;
  const rejected = queue.filter((q) => q.rejected && q.outletId === outlet.id);
  const byDay = new Map<string, any[]>();
  // Đơn đã hoàn tác (đơn gốc và bản đảo) ẩn mặc định; vẫn còn trong sổ
  const isReversedOrder = (r: any) => r.kind === 'order' && (r.status === 'reversed' || r.status === 'reversal');
  const hiddenCount = (rows || []).filter(isReversedOrder).length;
  (rows || []).filter((r) => showReversed || !isReversedOrder(r)).forEach((r) => byDay.set(r.business_date, [...(byDay.get(r.business_date) || []), r]));

  const rejectedCard = rejected.length > 0 && (
          <section className="card">
            <div className="h2" style={{ color: 'var(--danger)' }}>Chưa gửi được</div>
            {rejected.map((q) => (
              <div key={q.id} className="list-row">
                <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="strong">{q.summary}</span>
                  <span className="xs muted">{dateVN(q.createdAt)} {timeHM(q.createdAt)} · {q.lastError}</span>
                </span>
                <button className="btn quiet" onClick={() => removeFromQueue(q.id)}>Bỏ</button>
              </div>
            ))}
          </section>
  );
  // Nhân viên không xem lịch sử bản ghi (Tùng 17/11); chỉ thấy các bản ghi trên máy này bị máy chủ từ chối, để không mất đơn
  if (!canManage)
    return (
      <div className="screen">
        <Header title="Bản ghi chưa gửi được" back="/tai-khoan" sub={outlet.name} />
        <main className="main">
          {rejectedCard || <Empty icon="history" title="Không có bản ghi nào bị kẹt" text="Lịch sử bản ghi chỉ chủ cơ sở xem được." />}
        </main>
        <Nav />
      </div>
    );

  return (
    <div className="screen">
      <Header title="Lịch sử" back="/tai-khoan" sub={`Mọi bản ghi của ${outlet.name}`} />
      <main className="main">
        <div className="chips">
          {filters.map(([k, l]) => (
            <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>

        {filter === 'changes' ? (
          <OrderChangesList />
        ) : (
        <>
        {hiddenCount > 0 || showReversed ? (
          <label className="row small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={showReversed} onChange={(e) => setShowReversed(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span>Hiện cả đơn đã hoàn tác{hiddenCount ? ` (${hiddenCount})` : ''}</span>
          </label>
        ) : null}

        {rejectedCard}

        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon="history" title="Chưa có gì được ghi ở cơ sở này" />
        ) : (
          [...byDay.entries()].map(([d, items]) => (
            <section key={d} className="card tight">
              <div className="h2" style={{ padding: '12px 0 2px' }}>{d === vnToday() ? 'Hôm nay' : weekdayLabel(d)}</div>
              {items.map((r: any) => {
                const [icon, tone] = ICON[r.kind] || ['history', ''];
                const warn = r.status === 'reversal';
                return (
                  <div key={`${r.kind}-${r.ref_id}`} className="list-row" style={{ alignItems: 'flex-start', opacity: r.status === 'reversed' || r.status === 'superseded' || r.status === 'unlock' ? 0.6 : 1 }}>
                    <span className={`ico-box ${warn ? 'warn' : tone}`}>
                      <Icon name={warn ? 'undo' : icon} size={20} sw={2} />
                    </span>
                    <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="row between" style={{ gap: 8 }}>
                        <span className="strong">{r.title}</span>
                        {r.amount_vnd != null && <strong className="num small">{vnd(r.amount_vnd)}</strong>}
                      </span>
                      {r.detail && <span className="small muted">{r.detail}</span>}
                      <span className="xs muted">
                        {timeHM(r.at)} · {names[r.actor_id] || '—'}
                      </span>
                    </span>
                  </div>
                );
              })}
            </section>
          ))
        )}
        {rows && more && (
          <button className="btn secondary block" onClick={() => load(rows.length)}>
            Xem thêm
          </button>
        )}
        <p className="xs muted" style={{ textAlign: 'center' }}>Bản ghi không xóa được. Đơn ghi nhầm thì chủ cơ sở sửa hoặc hủy ở màn chi tiết đơn; lần sửa, hủy đó hiện ở bộ lọc "Sửa, hủy đơn".</p>
        </>
        )}
      </main>
      <Nav />
    </div>
  );
}
