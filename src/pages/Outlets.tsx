import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MODELS, useApp } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { Empty, Icon } from '../components/ui';

const ROLE: Record<string, string> = { owner: 'Chủ cơ sở', staff: 'Nhân viên', admin: 'Admin BaBa' };

export default function Outlets() {
  const { outlets, outlet, selectOutlet, profile, isAdmin, reloadOutlets } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [model, setModel] = useState('M1_cart');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCreate = isAdmin || outlets.some((o) => o.role === 'owner');

  async function create() {
    setErr(null);
    if (!name.trim()) return setErr('Nhập tên cơ sở.');
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_create_outlet', { p_name: name.trim(), p_model: model });
    setBusy(false);
    if (error) return setErr(errorText(error));
    await reloadOutlets();
    selectOutlet(data as string);
    nav('/');
  }

  return (
    <div className="screen">
      <header className="header">
        <div className="titles">
          <h1>Chọn cơ sở</h1>
          <span className="sub">{profile?.email}</span>
        </div>
        <Link to="/tai-khoan" className="icon-btn" aria-label="Tài khoản">
          <Icon name="user" size={24} />
        </Link>
      </header>
      <main className="main no-nav">
        {outlets.length === 0 ? (
          <Empty icon="sprout" title="Bạn chưa thuộc cơ sở nào" text={`Nhờ chủ cơ sở mời email ${profile?.email || ''} vào cơ sở, rồi mở lại app.`}>
            <button className="btn secondary" onClick={() => reloadOutlets()}>
              Tải lại
            </button>
          </Empty>
        ) : (
          <>
            <p className="small muted">Bấm vào cơ sở bạn đang đứng bán. Mỗi cơ sở có kho, đơn và báo cáo riêng.</p>
            {outlets.map((o) => (
              <button
                key={o.id}
                className="card"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '12px 16px', minHeight: 64, textAlign: 'left', cursor: 'pointer', border: outlet?.id === o.id ? '2px solid var(--brand)' : '1px solid var(--border)' }}
                onClick={() => {
                  selectOutlet(o.id);
                  nav('/');
                }}
              >
                <span className="ico-box" style={{ width: 40, height: 40 }}>
                  <Icon name={o.model === 'M1_cart' ? 'bike' : 'cart'} size={22} />
                </span>
                <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{o.name}</span>
                  <span className="small muted">
                    {MODELS[o.model] || o.model} · {ROLE[o.role]}
                  </span>
                </span>
                {outlet?.id === o.id ? <Icon name="check" size={24} sw={2} style={{ color: 'var(--ink-brand)' }} /> : <Icon name="chev" size={20} style={{ color: 'var(--ink-muted)' }} />}
              </button>
            ))}
          </>
        )}

        {canCreate && (
          <section className="card">
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Mở thêm cơ sở</h2>
            <p className="small muted">Một xe mới, một quầy mới. Cơ sở mới dùng công thức và giá chung của BaBa, kho trống.</p>
            <label className="field">
              <span className="label">Tên cơ sở</span>
              <input className="input" placeholder="Ví dụ: Xe Bãi Cháy" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="field">
              <span className="label">Mô hình</span>
              <div className="chips wrap" role="group">
                {['M1_cart', 'M2_street', 'M2_shop'].map((m) => (
                  <button key={m} type="button" className={`chip ${model === m ? 'on' : ''}`} aria-pressed={model === m} onClick={() => setModel(m)}>
                    {MODELS[m]}
                  </button>
                ))}
              </div>
            </div>
            {err && <span className="err">{err}</span>}
            <button className="btn secondary block" disabled={busy} onClick={create}>
              {busy ? 'Đang tạo…' : 'Tạo cơ sở'}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
