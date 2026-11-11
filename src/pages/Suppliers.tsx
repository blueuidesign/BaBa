import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { fetchStock, useLoad } from '../lib/data';
import { Empty, Header, Icon, Loading, Nav } from '../components/ui';

export default function Suppliers() {
  const { outlet, bump } = useApp();
  const [params] = useSearchParams();
  const focus = params.get('id');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const { data, loading } = useLoad(async (oid) => {
    const [sup, stock] = await Promise.all([supabase.from('suppliers').select('*').eq('outlet_id', oid).order('name'), fetchStock(oid)]);
    if (sup.error) throw sup.error;
    return { suppliers: (sup.data || []) as any[], stock };
  });

  if (!outlet) return null;

  async function add() {
    setErr(null);
    if (!name.trim()) return setErr('Nhập tên nhà cung cấp.');
    const { error } = await supabase.from('suppliers').insert({ outlet_id: outlet!.id, name: name.trim(), phone: phone.trim() || null });
    if (error) return setErr(error.code === '23505' ? `Đã có nhà cung cấp tên "${name.trim()}".` : errorText(error));
    setName('');
    setPhone('');
    setAdding(false);
    bump();
  }

  const unassigned = (data?.stock || []).filter((s) => s.enabled && s.kind === 'purchased' && !s.supplier_id);
  const list = [...(data?.suppliers || [])].sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));

  return (
    <div className="screen">
      <Header
        title="Nhà cung cấp"
        back
        sub={outlet.name}
        right={
          <button className="icon-btn" aria-label="Thêm nhà cung cấp" style={{ color: 'var(--ink-brand)' }} onClick={() => setAdding(true)}>
            <Icon name="plus" size={26} sw={2.2} />
          </button>
        }
      />
      <main className="main">
        {adding && (
          <section className="card">
            <div className="h2">Thêm nhà cung cấp</div>
            <label className="field">
              <span className="label">Tên</span>
              <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Chợ Hạ Long 1, cô Lan" autoFocus />
            </label>
            <label className="field">
              <span className="label">Số điện thoại (không bắt buộc)</span>
              <input className="input sm" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            {err && <span className="err">{err}</span>}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn secondary grow" onClick={() => setAdding(false)}>Thôi</button>
              <button className="btn grow" onClick={add}>Lưu</button>
            </div>
          </section>
        )}
        {loading && !data ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty icon="truck" title="Chưa có nhà cung cấp nào" text="Thêm nơi bạn hay mua hàng. Sau đó mở từng vật tư trong Tồn kho để chọn nhà cung cấp, app sẽ gom nhắc đặt hàng theo từng nơi.">
            <button className="btn secondary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={20} sw={2.2} /> Thêm nhà cung cấp
            </button>
          </Empty>
        ) : (
          list.map((s) => {
            const items = (data?.stock || []).filter((x) => x.supplier_id === s.id);
            const need = items.filter((x) => x.needs_order);
            return (
              <section key={s.id} className="card tight" style={s.id === focus ? { outline: '2px solid var(--brand)' } : undefined}>
                <div className="row between" style={{ padding: '12px 0 2px' }}>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="strong" style={{ fontSize: 16 }}>{s.name}</span>
                    <span className="xs muted">
                      {items.length} vật tư{need.length ? ` · nên đặt ${need.length}` : ''}
                    </span>
                  </span>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="btn secondary" style={{ minHeight: 36, padding: '0 12px', fontSize: 14 }}>
                      Gọi {s.phone}
                    </a>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="small muted" style={{ padding: '4px 0 12px' }}>Chưa gán vật tư nào. Mở vật tư trong Tồn kho để chọn nhà cung cấp này.</p>
                ) : (
                  items.map((x) => (
                    <Link key={x.ingredient_id} to={`/kho/${x.ingredient_id}`} className="list-row" style={{ minHeight: 44 }}>
                      <span className="grow">{x.name}</span>
                      {x.needs_order && <span className="badge warn">Nên đặt</span>}
                      <Icon name="chev" size={18} style={{ color: 'var(--ink-muted)' }} />
                    </Link>
                  ))
                )}
              </section>
            );
          })
        )}
        {unassigned.length > 0 && list.length > 0 && (
          <section className="card tight">
            <div className="h2" style={{ padding: '12px 0 2px' }}>Chưa gán nhà cung cấp · {unassigned.length}</div>
            {unassigned.map((x) => (
              <Link key={x.ingredient_id} to={`/kho/${x.ingredient_id}`} className="list-row" style={{ minHeight: 44 }}>
                <span className="grow">{x.name}</span>
                <span className="small strong" style={{ color: 'var(--ink-brand)' }}>Chọn</span>
              </Link>
            ))}
          </section>
        )}
      </main>
      <Nav />
    </div>
  );
}
