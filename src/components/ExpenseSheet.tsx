import { useMemo, useState } from 'react';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { fold, isStockGroup, type ExpCat, type ExpenseRow } from '../lib/expenses';
import { num, timeHM, unitLabel, uuid, vnd, vnToday } from '../lib/format';
import { Icon, MoneyInput, NumberField, confirmDialog, reasonDialog } from './ui';

/**
 * Bottom sheet thêm / sửa khoản chi (H02, H04, H07, H08, H09, W03, W04).
 * - Chip loại: hàng đầu 4 loại nhóm Nguyên liệu, Vật tư (có dòng ví dụ); Đầu tư thiết bị có chip con.
 * - Tên khoản chi gõ tự do; gợi ý tên trong kho (đúng nhóm kho của loại) và tên đã dùng.
 * - Cộng kho khi tên chọn từ kho và có số lượng; ngược lại chỉ ghi tiền, hỏi lại trước khi lưu (W04).
 * - Sửa = DB hủy khoản cũ + ghi khoản mới (fn_edit_expense).
 */
export default function ExpenseSheet({
  cats,
  usedNames,
  existing,
  onClose,
  onDone
}: {
  cats: ExpCat[];
  usedNames: string[];
  existing: ExpenseRow | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { outlet, catalog } = useApp();
  const byId = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const top = cats.filter((c) => !c.parent_id);
  const dauTu = top.find((c) => c.code === 'dau_tu');
  const subs = cats.filter((c) => dauTu && c.parent_id === dauTu.id);
  const exCat = existing?.category_id ? byId[existing.category_id] : undefined;

  const [topId, setTopId] = useState<string>(exCat ? exCat.parent_id || exCat.id : top.find((c) => c.code === 'nl_chinh')?.id || '');
  const [subId, setSubId] = useState<string>(exCat?.parent_id ? exCat.id : subs[0]?.id || '');
  const [name, setName] = useState(existing?.item_name || '');
  const [ingId, setIngId] = useState<string | null>(existing?.purchase_id && existing.source === 'manual' ? existing.ingredient_id : null);
  const [qty, setQty] = useState(existing?.qty && existing.purchase_id ? String(existing.qty) : '');
  const [amount, setAmount] = useState(existing ? String(existing.amount_vnd) : '');
  const [date, setDate] = useState(existing?.spent_on || vnToday());
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clientId] = useState(uuid);

  if (!outlet || !catalog) return null;
  const cat = byId[topId];
  const finalCat = cat?.code === 'dau_tu' ? byId[subId] || cat : cat;
  const ing = ingId ? catalog.ingredientById[ingId] : undefined;
  const fromPurchase = existing?.source === 'purchase';

  // Gợi ý: món trong kho đúng nhóm kho của loại đang chọn, rồi tên đã dùng
  const q = fold(name);
  const stockOpts = cat?.ingredient_grp ? catalog.ingredients.filter((i) => i.kind === 'purchased' && i.grp === cat.ingredient_grp) : [];
  const sugStock = q ? stockOpts.filter((i) => fold(i.name).includes(q)).slice(0, 4) : [];
  const sugUsed = q ? usedNames.filter((n) => fold(n).includes(q) && fold(n) !== q && !sugStock.some((i) => fold(i.name) === fold(n))).slice(0, 3) : [];
  const showSug = focus && q.length > 0 && !ing;

  function pickCat(id: string) {
    setTopId(id);
    setErr(null);
    // đổi loại thì món trong kho cũ có thể không còn đúng nhóm
    if (ing && byId[id]?.ingredient_grp !== ing.grp) setIngId(null);
  }
  function typeName(v: string) {
    setName(v);
    // tên gõ khớp đúng một món trong kho thì tự gắn
    const exact = stockOpts.find((i) => fold(i.name) === fold(v));
    setIngId(exact ? exact.id : null);
  }

  const stockApplied = !!ing && Number(qty) > 0;
  const needsStockWarn = isStockGroup(cat) && !stockApplied;

  async function save() {
    setErr(null);
    if (!finalCat) return setErr('Chọn loại chi.');
    const amt = Number(amount);
    if (!amt) return setErr('Nhập số tiền lớn hơn 0.');
    if (date > vnToday()) return setErr('Không ghi chi phí cho ngày chưa tới.');
    if (!existing) {
      const { data: dup } = await supabase.rpc('fn_find_duplicate_expense', { p_outlet: outlet!.id, p_spent_on: date, p_category_id: finalCat.id, p_amount: amt });
      if (dup && (dup as any).id) {
        const d = dup as any;
        const go = await confirmDialog({
          title: `Có vẻ khoản này đã ghi lúc ${timeHM(d.created_at)}`,
          text: `Đã có ${finalCat.name} · ${vnd(amt)}${d.item_name ? ` (${d.item_name})` : ''}${d.by ? ` do ${d.by} ghi` : ''}. Ghi thêm sẽ thành 2 khoản.`,
          ok: 'Vẫn ghi',
          cancel: 'Bỏ',
          tone: 'warn'
        });
        if (!go) return;
      }
    }
    if (needsStockWarn) {
      const go = await confirmDialog({
        title: 'Khoản này không vào tồn kho',
        text: ing
          ? `Chưa ghi số lượng nên app chỉ ghi ${vnd(amt)} vào chi phí ${finalCat.name}. ${ing.name} trong kho cập nhật khi kiểm kê.`
          : `"${name.trim() || finalCat.name}" không có trong danh sách kho. App chỉ ghi ${vnd(amt)} vào chi phí ${finalCat.name}. Muốn cộng kho thì chọn tên có nhãn "trong kho" và ghi số lượng.`,
        ok: 'Vẫn lưu',
        cancel: 'Sửa lại',
        tone: 'warn'
      });
      if (!go) return;
    }
    setBusy(true);
    const p = {
      outlet_id: outlet!.id,
      client_id: clientId,
      category_id: finalCat.id,
      item_name: name.trim() || null,
      ingredient_id: stockApplied ? ingId : null,
      qty: stockApplied ? Number(qty) : null,
      amount_vnd: amt,
      spent_on: date
    };
    const { data, error } = existing ? await supabase.rpc('fn_edit_expense', { p_id: existing.id, p }) : await supabase.rpc('fn_post_expense_v2', { p });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone(negMsg((data as any)?.negative_stock) || (existing ? 'Đã sửa khoản chi' : stockApplied ? `Đã ghi và cộng ${num(Number(qty), 2)} ${unitLabel(ing!.purchase_unit)} ${ing!.name} vào kho` : 'Đã ghi khoản chi'));
  }

  function negMsg(neg: any[] | undefined) {
    if (!neg || !neg.length) return '';
    const names = neg.map((n) => catalog!.ingredientById[n.ingredient_id]?.name).filter(Boolean).join(', ');
    return `Tồn kho ${names} đang âm, nhớ kiểm kê.`;
  }

  async function cancelIt() {
    if (!existing) return;
    const linked = existing.source === 'manual' && existing.purchase_id;
    const why = await reasonDialog({
      title: fromPurchase ? 'Hủy phiếu nhập kho này?' : 'Hủy khoản chi này?',
      text: fromPurchase
        ? 'Phiếu nhập bị hủy: hàng đã cộng vào kho sẽ trừ lại, các khoản chi tự ghi từ phiếu cũng hủy theo.'
        : `${existing.item_name || ''} · ${vnd(existing.amount_vnd)}. Khoản chi vẫn còn trong Lịch sử với chữ "đã hủy".${linked ? ' Số hàng đã cộng vào kho cũng trừ lại.' : ''}`,
      ok: fromPurchase ? 'Hủy phiếu nhập' : 'Hủy khoản chi',
      danger: true,
      reason: { label: 'Lý do', placeholder: 'Ví dụ: ghi trùng', required: true }
    });
    if (!why) return;
    setBusy(true);
    const { data, error } = fromPurchase
      ? await supabase.rpc('fn_reverse_purchase', { p_id: existing.purchase_id, p_reason: why })
      : await supabase.rpc('fn_reverse_expense', { p_id: existing.id, p_reason: why });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone(negMsg((data as any)?.negative_stock) || (fromPurchase ? 'Đã hủy phiếu nhập' : 'Đã hủy khoản chi'));
  }

  const row1 = top.filter((c) => isStockGroup(c));
  const rest = top.filter((c) => !isStockGroup(c));
  const chipStyle = { minHeight: 34, fontSize: 13, padding: '0 10px' };

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-labelledby="exp-t" style={{ maxHeight: '92vh', overflowY: 'auto', scrollbarWidth: 'none' }}>
        <div className="row between">
          <h2 id="exp-t" style={{ fontSize: 18, margin: 0 }}>{existing ? `Sửa khoản chi` : 'Thêm khoản chi'}</h2>
          <button className="icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="x" size={20} /></button>
        </div>

        {fromPurchase ? (
          <>
            <p className="small">
              <strong>{existing!.item_name}</strong> · {vnd(existing!.amount_vnd)}
            </p>
            <p className="small muted">Khoản này tự ghi từ một phiếu nhập kho. Muốn sửa thì hủy phiếu nhập rồi nhập lại ở Tồn kho → Nhập hàng.</p>
          </>
        ) : (
          <>
            {existing?.purchase_id && (
              <div className="row small" style={{ gap: 8, padding: '8px 10px', background: 'var(--bg-brand-soft)', borderRadius: 'var(--radius-md)', alignItems: 'flex-start' }}>
                <Icon name="box" size={18} style={{ color: 'var(--ink-brand)', flexShrink: 0 }} />
                <span>Khoản này đã cộng hàng vào kho. Sửa số lượng hoặc số tiền thì kho được chỉnh theo.</span>
              </div>
            )}
            <span className="small strong">Loại chi</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
              {row1.map((c) => (
                <button key={c.id} type="button" className={`chip ${topId === c.id ? 'on' : ''}`} onClick={() => pickCat(c.id)}
                  style={{ minHeight: 48, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 0, borderRadius: 'var(--radius-md)', whiteSpace: 'normal', textAlign: 'left', padding: '4px 10px' }}>
                  <span style={{ fontSize: 13 }}>{c.name}</span>
                  {c.example_text && <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.75 }}>{c.example_text}</span>}
                </button>
              ))}
            </div>
            <div className="chips wrap" style={{ gap: 6 }}>
              {rest.map((c) => (
                <button key={c.id} type="button" className={`chip ${topId === c.id ? 'on' : ''}`} style={chipStyle} onClick={() => pickCat(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            {cat?.code === 'dau_tu' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--bg-000)', borderRadius: 'var(--radius-md)' }}>
                <span className="xs muted">Đầu tư cho gì</span>
                <div className="chips wrap" style={{ gap: 6 }}>
                  {subs.map((c) => (
                    <button key={c.id} type="button" className={`chip ${subId === c.id ? 'on' : ''}`} style={chipStyle} onClick={() => setSubId(c.id)}>
                      {c.name}
                    </button>
                  ))}
                </div>
                <span className="xs muted">Khoản đầu tư không trừ vào lãi tháng. Báo cáo Toàn bộ sẽ trừ và cho biết đã thu hồi được bao nhiêu phần trăm.</span>
              </div>
            )}

            <label className="field" style={{ position: 'relative' }}>
              <span className="label small strong">Tên khoản chi</span>
              <span className="input-wrap">
                <input
                  value={name}
                  onChange={(e) => typeName(e.target.value)}
                  onFocus={() => setFocus(true)}
                  onBlur={() => setTimeout(() => setFocus(false), 150)}
                  placeholder={cat?.ingredient_grp ? 'Gõ tên, vd: óc chó' : 'Vd: tiền điện tháng 10'}
                  maxLength={120}
                  style={{ textAlign: 'left', fontSize: 16 }}
                  aria-label="Tên khoản chi"
                />
                {ing ? <span className="badge ok">trong kho</span> : name.trim() && isStockGroup(cat) ? <span className="badge warn">tên tự do</span> : null}
              </span>
            </label>
            {showSug && (sugStock.length > 0 || sugUsed.length > 0 || name.trim()) && (
              <div className="card tight" role="listbox" style={{ marginTop: -6, padding: 0, gap: 0, boxShadow: 'var(--shadow-soft)' }}>
                {sugStock.map((i) => (
                  <button key={i.id} type="button" className="list-row" style={{ border: 0, background: 'transparent', width: '100%', textAlign: 'left', padding: '8px 12px' }}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => { setName(i.name); setIngId(i.id); setFocus(false); }}>
                    <Icon name="box" size={18} style={{ color: 'var(--ink-brand)' }} />
                    <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="strong">{i.name}</span>
                      <span className="xs muted">trong kho · cộng kho được</span>
                    </span>
                  </button>
                ))}
                {sugUsed.map((n) => (
                  <button key={n} type="button" className="list-row" style={{ border: 0, background: 'transparent', width: '100%', textAlign: 'left', padding: '8px 12px' }}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => { typeName(n); setFocus(false); }}>
                    <Icon name="history" size={18} style={{ color: 'var(--ink-muted)' }} />
                    <span className="grow"><span className="strong">{n}</span> <span className="xs muted">· đã dùng</span></span>
                  </button>
                ))}
                {isStockGroup(cat) && name.trim() && !stockOpts.some((i) => fold(i.name) === q) && (
                  <button type="button" className="list-row" style={{ border: 0, background: 'transparent', width: '100%', textAlign: 'left', padding: '8px 12px' }}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => setFocus(false)}>
                    <Icon name="plus" size={18} style={{ color: 'var(--ink-muted)' }} />
                    <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="strong">Dùng tên "{name.trim()}"</span>
                      <span className="xs muted">Chỉ ghi tiền, không vào tồn kho</span>
                    </span>
                  </button>
                )}
              </div>
            )}

            {cat?.ingredient_grp && ing && (
              <div className="field">
                <span className="label small strong">Số lượng (bỏ trống nếu chỉ ghi tiền)</span>
                <NumberField value={qty} onChange={setQty} unit={unitLabel(ing.purchase_unit)} label="Số lượng" width={160} decimals />
              </div>
            )}
            {isStockGroup(cat) && (
              <div className="row small" style={{ gap: 8, padding: '8px 10px', background: stockApplied ? 'var(--bg-brand-soft)' : 'var(--bg-200)', borderRadius: 'var(--radius-md)', alignItems: 'flex-start' }}>
                <Icon name={stockApplied ? 'box' : 'scale'} size={18} style={{ color: 'var(--ink-brand)', flexShrink: 0 }} />
                <span>
                  {stockApplied ? (
                    <>Sẽ cộng vào kho: <strong>{num(Number(qty), 2)} {unitLabel(ing!.purchase_unit)} {ing!.name}</strong>{ing!.purchase_factor !== 1 ? ` (${num(Number(qty) * ing!.purchase_factor)} ${unitLabel(ing!.unit)})` : ''}.</>
                  ) : cat?.ingredient_grp == null ? (
                    'Loại này không vào kho, chỉ ghi tiền.'
                  ) : ing ? (
                    <>Chưa có số lượng nên <strong>chỉ ghi tiền</strong>. {ing.name} trong kho cập nhật khi kiểm kê.</>
                  ) : (
                    <>Chọn tên có nhãn "trong kho" và ghi số lượng để cộng vào kho. Để vậy thì <strong>chỉ ghi tiền</strong>.</>
                  )}
                </span>
              </div>
            )}

            <div className="field">
              <span className="label small strong">Số tiền</span>
              <MoneyInput value={amount} onChange={setAmount} label="Số tiền" big />
            </div>
            <label className="field">
              <span className="label small strong">Ngày chi</span>
              <span className="input-wrap">
                <input type="date" value={date} max={vnToday()} onChange={(e) => setDate(e.target.value)} style={{ textAlign: 'left', fontSize: 16 }} />
              </span>
            </label>
            {existing && <p className="xs muted">Sửa không xóa khoản cũ. App hủy khoản cũ rồi ghi khoản mới, cả hai vẫn xem được trong Lịch sử.</p>}
          </>
        )}

        {err && <span className="err">{err}</span>}
        {!fromPurchase && (
          <button className="btn lg block" disabled={busy} onClick={save}>
            {busy ? 'Đang lưu…' : existing ? 'Lưu thay đổi' : 'Lưu khoản chi'}
          </button>
        )}
        {existing && (
          <button className="btn secondary block" disabled={busy} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={cancelIt}>
            <Icon name="trash" size={18} sw={2} /> {fromPurchase ? 'Hủy phiếu nhập…' : 'Hủy khoản chi…'}
          </button>
        )}
      </div>
    </>
  );
}
