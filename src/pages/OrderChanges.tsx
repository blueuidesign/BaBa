import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { ddmm, timeHM, vnd } from '../lib/format';
import { Empty, Header, Icon, Loading, Nav } from '../components/ui';

const PAGE = 40;
const lineText = (ls: any[] | undefined) => (ls || []).map((l) => `${l.qty} ${l.name}${l.container === 'coc' ? ' (cốc)' : ''}`).join(' · ') || 'không có món';
const pay = (m: string | null | undefined) => (m === 'cash' ? 'tiền mặt' : m === 'transfer' ? 'chuyển khoản' : 'chưa ghi');

/** Lịch sử sửa, hủy đơn của cơ sở (chủ cơ sở, admin). Đọc từ v_order_changes (audit_log). */
export default function OrderChanges() {
  const { outlet, canManage, dataVersion } = useApp();
  const [all, setAll] = useState(false); // false: chỉ sửa và hủy; true: thêm cả đổi cách nhận tiền, tên khách
  const [rows, setRows] = useState<any[] | null>(null);
  const [more, setMore] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load(offset: number) {
    if (!outlet) return;
    let q = supabase.from('v_order_changes').select('*').eq('outlet_id', outlet.id).order('at', { ascending: false }).range(offset, offset + PAGE - 1);
    if (!all) q = q.in('action', ['cancel', 'edit']);
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
  }, [outlet?.id, all, dataVersion, canManage]);

  if (!outlet) return null;
  return (
    <div className="screen">
      <Header title="Lịch sử sửa, hủy đơn" sub={outlet.name} back="/tai-khoan" />
      <main className="main">
        {!canManage ? (
          <section className="card"><p className="small muted">Chỉ chủ cơ sở hoặc admin xem được lịch sử sửa, hủy đơn.</p></section>
        ) : (
          <>
            <div className="chips">
              <button type="button" className={`chip ${!all ? 'on' : ''}`} aria-pressed={!all} onClick={() => setAll(false)}>Sửa và hủy</button>
              <button type="button" className={`chip ${all ? 'on' : ''}`} aria-pressed={all} onClick={() => setAll(true)}>Kể cả nhận tiền, tên khách</button>
            </div>
            {rows === null ? (
              <Loading />
            ) : rows.length === 0 ? (
              <Empty icon="history" title="Chưa có lần sửa hay hủy đơn nào" text="Từ 15/11/2026, mỗi lần sửa hoặc hủy đơn sẽ hiện ở đây kèm người làm và lý do. Muốn sửa một đơn, mở đơn đó từ Trang chủ hoặc Báo cáo." >
                <Link to="/bao-cao/don" className="btn secondary">Mở các đơn hôm nay</Link>
              </Empty>
            ) : (
              <section className="card tight">
                {rows.map((r) => {
                  const o = r.old_row || {}; const n = r.new_row || {};
                  const who = names[r.actor_id] || 'Không rõ';
                  const title = r.action === 'cancel' ? `Hủy đơn số ${o.seq_in_day ?? r.seq_in_day}` : r.action === 'edit' ? `Sửa đơn số ${o.seq_in_day} thành đơn số ${n.seq_in_day}` : `Đơn số ${r.seq_in_day}: đổi thông tin`;
                  return (
                    <Link key={r.id} to={`/bao-cao/don/${r.order_id}`} className="list-row" style={{ alignItems: 'flex-start', padding: '12px 0', textDecoration: 'none', color: 'inherit' }}>
                      <span className={`ico-box ${r.action === 'cancel' ? 'danger' : ''}`}><Icon name={r.action === 'cancel' ? 'trash' : 'history'} size={20} /></span>
                      <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span className="strong">{title}</span>
                        <span className="xs muted">{timeHM(r.at)} {ddmm(String(r.at).slice(0, 10))} · {who} · đơn ngày {ddmm(r.business_date)}</span>
                        {r.action === 'cancel' && <span className="small">{lineText(o.lines)} · {vnd(o.total_vnd || 0)}</span>}
                        {r.action === 'edit' && (
                          <>
                            <span className="small"><span className="muted">Trước:</span> {lineText(o.lines)} · {vnd(o.total_vnd || 0)}</span>
                            <span className="small"><span className="muted">Sau:</span> {lineText(n.lines)} · {vnd(n.total_vnd || 0)}</span>
                          </>
                        )}
                        {r.action === 'set_info' && (
                          <span className="small">
                            {o.payment_method !== n.payment_method ? `Nhận tiền: ${pay(o.payment_method)} → ${pay(n.payment_method)}. ` : ''}
                            {o.customer_name !== n.customer_name ? `Khách: ${o.customer_name || 'khách lẻ'} → ${n.customer_name || 'khách lẻ'}.` : ''}
                          </span>
                        )}
                        {n.reason && <span className="small"><span className="muted">Lý do:</span> {n.reason}</span>}
                      </span>
                      <Icon name="chev" size={18} style={{ color: 'var(--ink-muted)', marginTop: 2 }} />
                    </Link>
                  );
                })}
                {more && <button className="btn secondary block" style={{ margin: '8px 0 12px' }} onClick={() => load(rows.length)}>Xem thêm</button>}
              </section>
            )}
          </>
        )}
      </main>
      <Nav />
    </div>
  );
}
