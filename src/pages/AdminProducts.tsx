import { useState } from 'react';
import { useApp, LINES, type Product } from '../lib/app';
import { supabase, errorText } from '../lib/supabase';
import { vnd } from '../lib/format';
import { Empty, Header, Icon, Loading, MoneyInput, Nav, useToast } from '../components/ui';

type Draft = { id: string | null; name: string; short: string; line: string; price: string; active: boolean };

/** Admin quản lý món: thêm, đổi tên, đổi nhóm, đổi giá, ngừng hoặc bán lại. Ghi qua fn_admin_save_product. */
export default function AdminProducts() {
  const { outlet, catalog, isAdmin, reloadCatalog } = useApp();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!outlet) return null;

  const all = catalog?.allProducts || [];
  const active = all.filter((p) => p.status !== 'retired');
  const retired = all.filter((p) => p.status === 'retired');
  const edit = (p: Product) => { setErr(null); setDraft({ id: p.id, name: p.name, short: p.short_name || '', line: p.line, price: String(p.price || ''), active: p.status !== 'retired' }); };
  const add = () => { setErr(null); setDraft({ id: null, name: '', short: '', line: 'xanh', price: '', active: true }); };

  async function save() {
    if (!draft) return;
    setErr(null);
    if (!draft.name.trim()) return setErr('Nhập tên món.');
    if (!Number(draft.price)) return setErr('Nhập giá bán lớn hơn 0.');
    setBusy(true);
    const { error } = await supabase.rpc('fn_admin_save_product', {
      p: { id: draft.id, name: draft.name.trim(), short_name: draft.short.trim(), line: draft.line, price_vnd: Number(draft.price), status: draft.active ? 'active' : 'retired' }
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    toast.show(draft.id ? `Đã lưu món ${draft.name.trim()}` : `Đã thêm món ${draft.name.trim()}, bật ở mọi cơ sở`);
    setDraft(null);
    reloadCatalog();
  }

  const row = (p: Product, last: boolean) => (
    <button key={p.id} type="button" className="list-row" onClick={() => edit(p)}
      style={{ border: 0, borderBottom: last ? 0 : '1px solid var(--border)', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: '6px 0' }}>
      <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="strong">{p.name}</span>
        <span className="xs muted">{p.recipe.length ? `Công thức ${p.recipe.length} nguyên liệu` : 'Chưa có công thức'}</span>
      </span>
      <span className="num strong">{vnd(p.price)}</span>
      <Icon name="chev" size={18} style={{ color: 'var(--ink-muted)' }} />
    </button>
  );

  return (
    <div className="screen">
      <Header title="Quản lý món" sub="Dùng chung cho mọi cơ sở" back="/tai-khoan" />
      <main className="main">
        {!isAdmin ? (
          <Empty icon="user" title="Chỉ admin xem được màn này" text="Danh sách món và giá dùng chung cho mọi cơ sở nên chỉ admin BaBa sửa được." />
        ) : !catalog ? (
          <Loading />
        ) : (
          <>
            <button className="btn secondary block" onClick={add}><Icon name="plus" size={18} sw={2} /> Thêm món</button>
            {LINES.map((l) => {
              const ps = active.filter((p) => p.line === l.id);
              return (
                <section key={l.id} className="card tight">
                  <div className="row between" style={{ padding: '12px 0 2px' }}>
                    <span className="h2">{l.name}</span>
                    <span className="xs muted">{ps.length} món</span>
                  </div>
                  {ps.length === 0 && <p className="small muted" style={{ paddingBottom: 12 }}>Nhóm này chưa có món đang bán.</p>}
                  {ps.map((p, i) => row(p, i === ps.length - 1))}
                </section>
              );
            })}
            {retired.length > 0 && (
              <section className="card tight">
                <div className="row between" style={{ padding: '12px 0 2px' }}>
                  <span className="h2">Đã ngừng bán</span>
                  <span className="xs muted">{retired.length} món</span>
                </div>
                {retired.map((p, i) => row(p, i === retired.length - 1))}
              </section>
            )}
            <p className="xs muted">Đổi giá chỉ tính cho đơn ghi từ lúc đổi; đơn cũ giữ giá lúc bán. Ngừng bán không xóa món, đơn cũ vẫn hiện đúng tên. Công thức chưa sửa được ở đây.</p>
          </>
        )}
      </main>
      <Nav />

      {draft && (
        <>
          <div className="sheet-back" onClick={() => !busy && setDraft(null)} />
          <div className="fullpage" role="dialog" aria-modal="true" aria-labelledby="prod-t">
            <div className="fp-head">
              <button className="icon-btn" aria-label="Đóng" onClick={() => setDraft(null)}><Icon name="x" size={22} /></button>
              <h2 id="prod-t" style={{ fontSize: 18, margin: 0 }}>{draft.id ? 'Sửa món' : 'Thêm món'}</h2>
            </div>
            <div className="fp-body">
              <label className="field">
                <span className="label small strong">Tên món</span>
                <span className="input-wrap"><input value={draft.name} maxLength={60} placeholder="Ví dụ: Mầm Sáng Trí Tuệ" style={{ textAlign: 'left', fontSize: 16 }} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></span>
              </label>
              <label className="field">
                <span className="label small strong">Tên ngắn <span className="muted" style={{ fontWeight: 400 }}>· hiện trên ô món ở màn Ghi đơn</span></span>
                <span className="input-wrap"><input value={draft.short} maxLength={40} placeholder="Để trống thì dùng tên món" style={{ textAlign: 'left', fontSize: 16 }} onChange={(e) => setDraft({ ...draft, short: e.target.value })} /></span>
              </label>
              <div className="field">
                <span className="label small strong">Nhóm</span>
                <div className="chips wrap">
                  {LINES.map((l) => (
                    <button key={l.id} type="button" className={`chip ${draft.line === l.id ? 'on' : ''}`} aria-pressed={draft.line === l.id} onClick={() => setDraft({ ...draft, line: l.id })}>{l.name}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label small strong">Giá bán một phần</span>
                <MoneyInput value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} label="Giá bán" big />
              </div>
              <div className="field">
                <span className="label small strong">Trạng thái</span>
                <div className="seg" role="tablist" aria-label="Trạng thái món">
                  <button type="button" className={draft.active ? 'on' : ''} onClick={() => setDraft({ ...draft, active: true })}>Đang bán</button>
                  <button type="button" className={!draft.active ? 'on' : ''} onClick={() => setDraft({ ...draft, active: false })}>Ngừng bán</button>
                </div>
                <span className="xs muted">{draft.active ? 'Món hiện ở màn Ghi đơn của các cơ sở đang bật món này.' : 'Món biến mất khỏi màn Ghi đơn ở mọi cơ sở. Đơn cũ không đổi.'}</span>
              </div>
              {!draft.id && <p className="xs muted">Món mới được bật ở mọi cơ sở và chưa có công thức, nên chưa trừ nguyên liệu khi nấu.</p>}
            </div>
            <div className="fp-foot">
              {err && <span className="err">{err}</span>}
              <button className="btn lg block" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : draft.id ? 'Lưu thay đổi' : 'Thêm món'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
