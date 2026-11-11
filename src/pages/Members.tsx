import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { Empty, Header, Icon, Loading, Nav, confirmDialog, useToast } from '../components/ui';

const ROLE: Record<string, string> = { owner: 'Chủ cơ sở', staff: 'Nhân viên' };

/** Chủ cơ sở thêm nhân viên vào một hoặc nhiều cơ sở của mình. Admin dùng cùng màn để gán chủ cơ sở. */
export default function Members() {
  const { outlets, outlet, isAdmin, canManage, profile } = useApp();
  const toast = useToast();
  const mine = outlets.filter((o) => o.role === 'owner' || o.role === 'admin' || isAdmin);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'owner'>('staff');
  const [picked, setPicked] = useState<string[]>(() => (outlet ? [outlet.id] : []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ver, setVer] = useState(0);

  const { data, loading } = useLoad(
    async () => {
      const res = await Promise.all(mine.map((o) => supabase.rpc('fn_list_members', { p_outlet: o.id })));
      const bad = res.find((r) => r.error);
      if (bad?.error) throw bad.error;
      return res.flatMap((r) => (r.data || []) as any[]);
    },
    [ver, mine.length]
  );

  if (!outlet) return null;
  if (!canManage) return <Navigate to="/tai-khoan" replace />;

  async function add() {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErr('Email chưa đúng. Ví dụ: ten@gmail.com');
    if (!picked.length) return setErr('Chọn ít nhất một cơ sở.');
    setBusy(true);
    for (const oid of picked) {
      const { error } = await supabase.rpc('fn_invite_member', { p_outlet: oid, p_email: e, p_role: role });
      if (error) {
        setBusy(false);
        return setErr(errorText(error));
      }
    }
    setBusy(false);
    setEmail('');
    toast.show(`Đã thêm ${e}. Người này đăng nhập bằng email đó là vào được.`);
    setVer((v) => v + 1);
  }

  async function remove(m: any) {
    const ok = await confirmDialog({
      title: `Gỡ ${m.email} khỏi ${m.outlet_name}?`,
      text: 'Người này sẽ không mở được cơ sở này nữa. Các đơn họ đã ghi vẫn giữ nguyên.',
      ok: 'Gỡ',
      danger: true
    });
    if (!ok) return;
    const { error } = await supabase.rpc('fn_remove_member', { p_membership: m.membership_id });
    if (error) return toast.show(errorText(error));
    setVer((v) => v + 1);
  }

  const byPerson = new Map<string, any[]>();
  (data || []).forEach((m) => byPerson.set(m.email, [...(byPerson.get(m.email) || []), m]));

  return (
    <div className="screen">
      <Header title="Nhân viên" back="/tai-khoan" sub={mine.length > 1 ? `${mine.length} cơ sở của bạn` : outlet.name} />
      <main className="main">
        <section className="card">
          <div className="h2">Thêm người</div>
          <label className="field">
            <span className="label">Email</span>
            <input className="input sm" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@gmail.com" />
          </label>
          {isAdmin && (
            <div className="seg" role="tablist" aria-label="Vai trò">
              <button className={role === 'staff' ? 'on' : ''} onClick={() => setRole('staff')}>Nhân viên</button>
              <button className={role === 'owner' ? 'on' : ''} onClick={() => setRole('owner')}>Chủ cơ sở</button>
            </div>
          )}
          <span className="label strong small">Vào cơ sở</span>
          <div className="chips wrap">
            {mine.map((o) => (
              <button key={o.id} className={`chip ${picked.includes(o.id) ? 'on' : ''}`} onClick={() => setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]))}>
                {picked.includes(o.id) && <Icon name="check" size={16} />} {o.name}
              </button>
            ))}
          </div>
          <p className="xs muted">{role === 'staff' ? 'Nhân viên ghi đơn, nấu, nhập kho, đối chiếu. Không xem chi phí, lợi nhuận, không mở khóa ngày.' : 'Chủ cơ sở xem được mọi số liệu và quản lý nhân viên của cơ sở đó.'}</p>
          {err && <span className="err">{err}</span>}
          <button className="btn block" disabled={busy || !email} onClick={add}>
            {busy ? 'Đang thêm…' : `Thêm ${ROLE[role].toLowerCase()}`}
          </button>
        </section>

        {loading && !data ? (
          <Loading />
        ) : byPerson.size === 0 ? (
          <Empty icon="user" title="Chưa có ai khác" text="Thêm nhân viên bằng email ở trên. Họ đăng nhập bằng email đó là thấy cơ sở được giao." />
        ) : (
          <section className="card tight">
            <div className="h2" style={{ padding: '12px 0 2px' }}>Người dùng · {byPerson.size}</div>
            {[...byPerson.entries()].map(([e, ms]) => (
              <div key={e} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                <div className="row between">
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ms[0].full_name || e}</span>
                    <span className="xs muted">{e}{ms.some((m) => m.status === 'invited') ? ' · chưa đăng nhập lần nào' : ''}</span>
                  </span>
                </div>
                {ms.map((m) => (
                  <div key={m.membership_id} className="row small" style={{ minHeight: 36 }}>
                    <span className="grow">{m.outlet_name}</span>
                    <span className={`badge ${m.role === 'owner' ? 'ok' : ''}`}>{ROLE[m.role]}</span>
                    {m.user_id !== profile?.id && (m.role === 'staff' || isAdmin) && (
                      <button className="btn quiet" style={{ minHeight: 30, color: 'var(--danger)' }} onClick={() => remove(m)}>Gỡ</button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}
      </main>
      <Nav />
      {toast.node}
    </div>
  );
}
