import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { dateVN, timeHM, vnToday } from '../lib/format';
import { Empty, Header, Icon, Loading, Nav } from '../components/ui';

const ICON: Record<string, string> = { reorder: 'truck', expiry: 'warn', day_close_missing: 'scale', count_diff: 'scale', invite: 'mail', info: 'bell' };
const ROUTE = (link: string | null) => {
  if (!link) return '/';
  if (link.startsWith('/kho/')) return link;
  return link;
};

export default function Notifications() {
  const { outlet, profile, bump } = useApp();
  const nav = useNavigate();
  const { data, reload } = useLoad(async (oid) => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [ns, rs] = await Promise.all([
      supabase.from('notifications').select('*').eq('outlet_id', oid).gte('created_at', since).order('created_at', { ascending: false }),
      supabase.from('notification_reads').select('notification_id').eq('user_id', profile!.id)
    ]);
    return { items: ns.data || [], read: new Set((rs.data || []).map((r: any) => r.notification_id)) };
  });
  if (!outlet) return null;

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    await supabase.from('notification_reads').upsert(ids.map((id) => ({ notification_id: id, user_id: profile!.id })), { onConflict: 'notification_id,user_id' });
    bump();
    reload();
  }

  const today = vnToday();
  const groups = new Map<string, any[]>();
  (data?.items || []).forEach((n: any) => {
    const d = new Date(new Date(n.created_at).getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const k = d === today ? 'Hôm nay' : d === vnToday(-1) ? 'Hôm qua' : dateVN(n.created_at);
    groups.set(k, [...(groups.get(k) || []), n]);
  });
  const unread = (data?.items || []).filter((n: any) => !data!.read.has(n.id)).map((n: any) => n.id);

  return (
    <div className="screen">
      <Header
        title="Thông báo"
        back
        right={
          unread.length > 0 ? (
            <button className="btn quiet" onClick={() => markRead(unread)}>
              Đã đọc hết
            </button>
          ) : undefined
        }
      />
      <main className="main">
        {!data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <Empty icon="bell" title="Chưa có thông báo" text="App nhắc lúc 6:00 sáng khi có vật tư cần đặt hoặc sắp hết hạn, và lúc 21:00 nếu chưa đối chiếu cuối ngày." />
        ) : (
          [...groups.entries()].map(([label, items]) => (
            <section key={label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="h2">{label}</div>
              {items.map((n: any) => {
                const isUnread = !data.read.has(n.id);
                return (
                  <button
                    key={n.id}
                    className="card"
                    style={{ flexDirection: 'row', gap: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', border: 0 }}
                    onClick={async () => {
                      await markRead([n.id]);
                      nav(ROUTE(n.link));
                    }}
                  >
                    <span className={`ico-box ${n.severity === 'danger' ? 'danger' : n.severity === 'warn' ? 'warn' : ''}`} style={{ width: 40, height: 40, background: `var(--${n.severity === 'ok' ? 'ok' : n.severity}-bg)` }}>
                      <Icon name={ICON[n.kind] || 'bell'} size={22} sw={2} />
                    </span>
                    <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="strong">{n.title}</span>
                      {n.body && <span className="small muted">{n.body}</span>}
                      <span className="xs muted">{timeHM(n.created_at)}{n.emailed_at ? ' · đã gửi email' : ''}</span>
                    </span>
                    {isUnread && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: 6 }} />}
                  </button>
                );
              })}
            </section>
          ))
        )}
      </main>
      <Nav />
    </div>
  );
}
