import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MODELS, useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { readQueue } from '../lib/queue';
import { Header, Icon, Nav } from '../components/ui';
import PushCard from '../components/PushCard';

function Item({ icon, title, sub, to, right }: { icon: string; title: string; sub?: string; to: string; right?: React.ReactNode }) {
  return (
    <Link to={to} className="list-row">
      <span className="ico-box">
        <Icon name={icon} size={20} />
      </span>
      <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="strong">{title}</span>
        {sub && <span className="small muted">{sub}</span>}
      </span>
      {right ?? <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />}
    </Link>
  );
}

const ROLE: Record<string, string> = { owner: 'Chủ cơ sở', staff: 'Nhân viên', admin: 'Admin BaBa' };

export default function Account() {
  const { profile, outlet, isAdmin, canManage } = useApp();
  const nav = useNavigate();
  const [admins, setAdmins] = useState<string[]>([]);
  const [members, setMembers] = useState<number>(0);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    supabase
      .from('org_memberships')
      .select('role,profiles(email)')
      .eq('role', 'admin')
      .eq('status', 'active')
      .then(({ data }) => setAdmins((data || []).map((r: any) => r.profiles?.email).filter(Boolean)));
    if (outlet)
      supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('outlet_id', outlet.id)
        .eq('status', 'active')
        .then(({ count }) => setMembers(count || 0));
  }, [outlet]);

  const pending = readQueue().filter((q) => !q.rejected).length;
  async function logout() {
    if (pending > 0 && !confirm) return setConfirm(true);
    localStorage.removeItem('kho-baba-queue');
    localStorage.removeItem('kho-baba-outlet');
    await supabase.auth.signOut();
    nav('/');
  }

  const initial = (profile?.full_name || profile?.email || '?').trim()[0]?.toUpperCase();
  return (
    <div className="screen">
      <Header title="Tài khoản" />
      <main className="main">
        <section className="card" style={{ padding: 20 }}>
          <div className="row" style={{ gap: 14 }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 22, margin: 0 }}>{initial}</span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{profile?.full_name || profile?.email}</span>
              <span className="small muted">{profile?.email}</span>
              <span className="xs muted">{isAdmin ? 'Admin BaBa' : outlet ? ROLE[outlet.role] : ''}</span>
            </span>
          </div>
        </section>

        <PushCard />

        {outlet && (
          <section className="card tight">
            <div className="h2" style={{ padding: '12px 0 2px' }}>Cơ sở đang làm việc</div>
            <Item icon={outlet.model === 'M1_cart' ? 'bike' : 'cart'} title={outlet.name} sub={`${MODELS[outlet.model] || ''} · ${members} người dùng`} to="/co-so" right={<span className="small strong" style={{ color: 'var(--ink-brand)' }}>Đổi cơ sở</span>} />
          </section>
        )}

        {outlet && (
          <section className="card tight">
            <div className="h2" style={{ padding: '12px 0 2px' }}>Quản lý</div>
            <Item icon="box" title="Tồn kho và nhập hàng" sub="Nguyên liệu, bao bì, nhắc đặt hàng" to="/kho" />
            <Item icon="bottle" title="Chai đang có" sub="Tồn thành phẩm theo món" to="/kho/chai" />
            <Item icon="history" title="Lịch sử bản ghi" sub="Đơn, nấu, nhập, kiểm kê, đối chiếu" to="/lich-su" />
            <Item icon="bell" title="Thông báo và nhắc nhở" sub="Đặt hàng, hết hạn, chốt ngày" to="/thong-bao" />
            <Item icon="truck" title="Nhà cung cấp" sub="Ai cung cấp vật tư nào" to="/nha-cung-cap" />
          </section>
        )}

        {outlet && canManage && (
          <section className="card tight">
            <div className="h2" style={{ padding: '12px 0 2px' }}>Chủ cơ sở</div>
            <Item icon="coin" title="Chi phí" sub="Ghi chi phí, xem chi theo loại" to="/chi-phi" />
            <Item icon="history" title="Số liệu tháng cũ" sub="Nhập doanh thu, chi phí trước khi dùng app" to="/thang-cu" />
            <Item icon="user" title="Nhân viên" sub="Thêm người bằng email, chọn cơ sở" to="/nhan-vien" />
          </section>
        )}

        <section className="card">
          <div className="h2">Quản trị hệ thống</div>
          {isAdmin ? (
            <>
              <Link to="/quan-tri" className="btn secondary block">Báo cáo tất cả cơ sở, chủ cơ sở</Link>
              <Link to="/quan-tri/mon" className="btn secondary block">Quản lý món: tên, nhóm, giá, ngừng bán</Link>
            </>
          ) : (
            <p className="small muted">Admin BaBa tạo cơ sở mới, gán chủ cơ sở, quản lý công thức và giá chung.</p>
          )}
          {admins.map((e) => (
            <div key={e} className="row small">
              <Icon name="check" size={18} sw={2} style={{ color: 'var(--ink-brand)' }} />
              <span className="grow strong">{e}</span>
              <span className="badge ok">Admin</span>
            </div>
          ))}
        </section>

        {confirm && (
          <div className="alert danger" role="alert">
            <Icon name="warn" size={20} sw={2} />
            <span>Còn {pending} đơn chưa gửi lên máy chủ. Đăng xuất bây giờ sẽ mất các đơn này. Bấm Đăng xuất lần nữa nếu chắc chắn.</span>
          </div>
        )}
        <button className="btn secondary block" onClick={logout}>
          Đăng xuất
        </button>
        <p className="xs muted" style={{ textAlign: 'center' }}>Kho BaBa · bản 1.0</p>
      </main>
      <Nav />
    </div>
  );
}
