import { useEffect, useState } from 'react';
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
  ['close', 'Đối chiếu']
];
const ICON: Record<string, [string, string]> = {
  order: ['cart', ''], cook: ['blender', 'info'], batch: ['blender', 'info'], purchase: ['truck', ''], count: ['scale', 'warn'], close: ['check', '']
};
const PAGE = 50;

export default function History() {
  const { outlet, queue, dataVersion } = useApp();
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState<any[] | null>(null);
  const [more, setMore] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load(offset: number) {
    if (!outlet) return;
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
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet?.id, filter, dataVersion]);

  if (!outlet) return null;
  const rejected = queue.filter((q) => q.rejected && q.outletId === outlet.id);
  const byDay = new Map<string, any[]>();
  (rows || []).forEach((r) => byDay.set(r.business_date, [...(byDay.get(r.business_date) || []), r]));

  return (
    <div className="screen">
      <Header title="Lịch sử" back="/tai-khoan" sub={`Mọi bản ghi của ${outlet.name}`} />
      <main className="main">
        <div className="chips">
          {FILTERS.map(([k, l]) => (
            <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>

        {rejected.length > 0 && (
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
        )}

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
                  <div key={`${r.kind}-${r.ref_id}`} className="list-row" style={{ alignItems: 'flex-start', opacity: r.status === 'reversed' || r.status === 'superseded' ? 0.6 : 1 }}>
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
        <p className="xs muted" style={{ textAlign: 'center' }}>Bản ghi không xóa được. Đơn ghi nhầm thì hoàn tác ngay sau khi lưu; sai sót phát hiện muộn sẽ lộ ra ở bước đối chiếu cuối ngày.</p>
      </main>
      <Nav />
    </div>
  );
}
