import { useMemo, useState } from 'react';
import { useApp } from '../lib/app';
import { errorText, supabase } from '../lib/supabase';
import { fold, type ExpCat, type ExpenseRow } from '../lib/expenses';
import { GROUP_COLOR, GROUP_NAME, GROUP_ORDER } from '../lib/reports';
import type { Ingredient } from '../lib/app';
import { num, timeHM, unitLabel, uuid, vnd, vnToday } from '../lib/format';
import { Icon, MoneyInput, NumberField, confirmDialog, reasonDialog } from './ui';

/**
 * Màn toàn màn hình thêm / sửa khoản chi (H02, H04, H07, H08, H09, W03, W04).
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
  const { outlet, catalog, reloadCatalog } = useApp();
  const byId = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const exCat = existing?.category_id ? byId[existing.category_id] : undefined;
  // Cấp 1: 4 nhóm; cấp 2: các loại trong nhóm (bỏ dòng cha "Đầu tư thiết bị"). Không có cấp 3.
  const optionsOf = (g: string | null) => cats.filter((c) => c.group_code === g && c.code !== 'dau_tu');

  const [grp, setGrp] = useState<string | null>(exCat?.group_code || null);
  const [catId, setCatId] = useState<string>(exCat && exCat.code !== 'dau_tu' ? exCat.id : '');
  const [name, setName] = useState(existing?.item_name || '');
  const [ingId, setIngId] = useState<string | null>(existing && existing.source === 'manual' ? existing.ingredient_id : null);
  const [qty, setQty] = useState(existing?.qty && existing.purchase_id ? String(existing.qty) : '');
  const [amount, setAmount] = useState(existing ? String(existing.amount_vnd) : '');
  const [date, setDate] = useState(existing?.spent_on || vnToday());
  const [focus, setFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clientId] = useState(uuid);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('g');
  const [created, setCreated] = useState<Ingredient[]>([]);
  // Nhiều món trong một lần ghi (chỉ khi thêm mới): mỗi món là một khoản chi riêng, có loại riêng
  type Item = { clientId: string; cat: ExpCat; name: string | null; ing?: Ingredient; qty: number | null; amount: number };
  const [items, setItems] = useState<Item[]>([]);
  const [unitPrice, setUnitPrice] = useState('');
  // Hoa quả: nhập theo quả, app quy ra gam theo số gam mỗi quả (sửa được từng lần mua)
  const [byPiece, setByPiece] = useState(false);
  const [pieceG, setPieceG] = useState('');
  // Số lượng × đơn giá = số tiền: nhập hai số, app tính số còn lại
  const onQty = (v: string) => { setQty(v); if (Number(v) > 0 && Number(unitPrice) > 0) setAmount(String(Math.round(Number(v) * Number(unitPrice)))); };
  const onUnitPrice = (v: string) => { setUnitPrice(v); if (Number(v) > 0 && Number(qty) > 0) setAmount(String(Math.round(Number(v) * Number(qty)))); };
  const onAmount = (v: string) => { setAmount(v); if (Number(qty) > 0) setUnitPrice(Number(v) > 0 ? String(Math.round(Number(v) / Number(qty))) : ''); };

  if (!outlet || !catalog) return null;
  const finalCat = catId ? byId[catId] : undefined;
  const stockMode = !!finalCat?.ingredient_grp;
  const allIngs = [...catalog.ingredients, ...created.filter((c) => !catalog.ingredientById[c.id])];
  const ing = ingId ? allIngs.find((i) => i.id === ingId) : undefined;
  const fromPurchase = existing?.source === 'purchase';
  const stockOpts = stockMode ? allIngs.filter((i) => i.kind === 'purchased' && i.grp === finalCat!.ingredient_grp) : [];

  // Gợi ý tên đã dùng (chỉ cho loại không vào kho)
  const q = fold(name);
  const sugUsed = q ? usedNames.filter((n) => fold(n).includes(q) && fold(n) !== q).slice(0, 4) : [];
  const showSug = focus && !stockMode && sugUsed.length > 0;

  function pickGroup(g: string) {
    setGrp(g);
    setErr(null);
    const opts = optionsOf(g);
    const next = opts[0]?.id || '';
    setCatId(next);
    if (ing && byId[next]?.ingredient_grp !== ing.grp) setIngId(null);
  }
  function pickCat(id: string) {
    setCatId(id);
    setErr(null);
    if (ing && byId[id]?.ingredient_grp !== ing.grp) setIngId(null);
  }
  async function addIngredient() {
    if (!newName.trim()) return setErr('Nhập tên món mới.');
    setBusy(true);
    const { data, error } = await supabase.rpc('fn_create_ingredient', { p_outlet: outlet!.id, p_name: newName.trim(), p_grp: finalCat!.ingredient_grp, p_unit: newUnit });
    setBusy(false);
    if (error) return setErr(errorText(error));
    const id = (data as any).id as string;
    setCreated((c) => [...c, { id, code: '', name: newName.trim(), grp: finalCat!.ingredient_grp!, unit: newUnit, purchase_unit: newUnit, purchase_factor: 1, kind: 'purchased', shelf_days: null, storage_note: null, sort_order: 90 }]);
    setIngId(id);
    setAdding(false);
    setNewName('');
    setErr(null);
    reloadCatalog();
  }

  const piece = byPiece && !!ing?.piece_g;
  const gPerPiece = piece ? Number(pieceG) || Number(ing!.piece_g) : 0;
  // Số lượng theo đơn vị mua của món (kg…), dù người dùng nhập theo quả
  const qtyPU = piece ? Math.round(((Number(qty) * gPerPiece) / ing!.purchase_factor) * 1000) / 1000 : Number(qty);
  const qtyUnit = piece ? 'quả' : ing ? unitLabel(ing.purchase_unit) : '';
  const stockApplied = !!ing && qtyPU > 0;
  const needsStockWarn = stockMode && !stockApplied;

  /** Kiểm tra món đang nhập, hỏi các cảnh báo; trả về null nếu người dùng dừng lại. */
  async function buildCurrent(): Promise<Item | null> {
    setErr(null);
    if (!finalCat) { setErr('Chọn nhóm và loại chi.'); return null; }
    if (stockMode && !ing) { setErr('Chọn món trong kho, hoặc bấm "Thêm món mới".'); return null; }
    const amt = Number(amount);
    if (!amt) { setErr('Nhập số tiền lớn hơn 0.'); return null; }
    if (date > vnToday()) { setErr('Không ghi chi phí cho ngày chưa tới.'); return null; }
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
        if (!go) return null;
      }
    }
    if (needsStockWarn) {
      const go = await confirmDialog({
        title: 'Khoản này không vào tồn kho',
        text: ing
          ? `Chưa ghi số lượng nên app chỉ ghi ${vnd(amt)} vào chi phí ${finalCat.name}. ${ing.name} trong kho cập nhật khi kiểm kê.`
          : `App chỉ ghi ${vnd(amt)} vào chi phí ${finalCat.name}.`,
        ok: 'Vẫn lưu',
        cancel: 'Sửa lại',
        tone: 'warn'
      });
      if (!go) return null;
    }
    return { clientId: uuid(), cat: finalCat, name: stockMode ? ing!.name : name.trim() || null, ing: stockApplied ? ing : undefined, qty: stockApplied ? qtyPU : null, amount: amt };
  }
  const payloadOf = (it: Item) => ({
    outlet_id: outlet!.id, client_id: it.clientId, category_id: it.cat.id, item_name: it.name,
    ingredient_id: it.ing ? it.ing.id : null, qty: it.ing ? it.qty : null, amount_vnd: it.amount, spent_on: date
  });
  const currentEmpty = !Number(amount) && !ing && !name.trim();

  async function addMore() {
    const it = await buildCurrent();
    if (!it) return;
    setItems((l) => [...l, it]);
    setName(''); setIngId(null); setQty(''); setAmount(''); setUnitPrice(''); setByPiece(false); setPieceG('');
  }

  async function save() {
    if (existing) {
      const it = await buildCurrent();
      if (!it) return;
      setBusy(true);
      const { data, error } = await supabase.rpc('fn_edit_expense', { p_id: existing.id, p: { ...payloadOf(it), client_id: clientId } });
      setBusy(false);
      if (error) return setErr(errorText(error));
      return onDone(negMsg((data as any)?.negative_stock) || 'Đã sửa khoản chi');
    }
    let list = items;
    if (!(items.length && currentEmpty)) {
      const it = await buildCurrent();
      if (!it) return;
      list = [...items, it];
    }
    setBusy(true);
    const neg: any[] = [];
    for (let i = 0; i < list.length; i++) {
      const { data, error } = await supabase.rpc('fn_post_expense_v2', { p: payloadOf(list[i]) });
      if (error) {
        // Các món trước đã ghi xong: bỏ khỏi danh sách để bấm Lưu lại không ghi trùng
        setItems(list.slice(i));
        setName(''); setIngId(null); setQty(''); setAmount(''); setUnitPrice(''); setByPiece(false); setPieceG('');
        setBusy(false);
        return setErr(`${i > 0 ? `Đã ghi ${i} món. ` : ''}Món "${list[i].name || list[i].cat.name}" chưa ghi được: ${errorText(error)}`);
      }
      neg.push(...(((data as any)?.negative_stock as any[]) || []));
    }
    setBusy(false);
    const stocked = list.filter((x) => x.ing).length;
    onDone(negMsg(neg) || (list.length > 1 ? `Đã ghi ${list.length} khoản chi · ${vnd(list.reduce((a, x) => a + x.amount, 0))}${stocked ? `, ${stocked} món cộng vào kho` : ''}`
      : list[0].ing ? `Đã ghi và cộng ${num(list[0].qty!, 2)} ${unitLabel(list[0].ing.purchase_unit)} ${list[0].ing.name} vào kho` : 'Đã ghi khoản chi'));
  }

  function negMsg(neg: any[] | undefined) {
    if (!neg || !neg.length) return '';
    const names = neg.map((n) => allIngs.find((i) => i.id === n.ingredient_id)?.name).filter(Boolean).join(', ');
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

  const chipStyle = { minHeight: 34, fontSize: 13, padding: '0 10px' };

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="fullpage" role="dialog" aria-modal="true" aria-labelledby="exp-t">
        <div className="fp-head">
          <button className="icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="x" size={22} /></button>
          <h2 id="exp-t" style={{ fontSize: 18, margin: 0 }}>{existing ? `Sửa khoản chi` : 'Thêm khoản chi'}</h2>
        </div>
        <div className="fp-body">
        {items.length > 0 && (
          <div className="card tight" style={{ padding: '4px 12px', gap: 0, background: 'var(--bg-200)', boxShadow: 'none' }}>
            {items.map((it) => (
              <div key={it.clientId} className="list-row" style={{ minHeight: 48, padding: '6px 0' }}>
                <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="strong">{it.name || it.cat.name}</span>
                  <span className="xs muted">{it.cat.name === 'Nguyên liệu khác' ? 'N.liệu khác' : it.cat.name}{it.ing ? ` · ${num(it.qty!, 2)} ${unitLabel(it.ing.purchase_unit)} · vào kho` : ' · chỉ ghi tiền'}</span>
                </span>
                <span className="strong num">{vnd(it.amount)}</span>
                <button type="button" className="icon-btn" aria-label={`Bỏ ${it.name || it.cat.name}`} onClick={() => setItems((l) => l.filter((x) => x.clientId !== it.clientId))}><Icon name="x" size={18} /></button>
              </div>
            ))}
            <span className="xs muted" style={{ padding: '6px 0' }}>Đã thêm {items.length} món. Chưa ghi cho tới khi bấm Lưu.</span>
          </div>
        )}

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
            <span className="small strong">Nhóm chi phí</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
              {GROUP_ORDER.map((g) => (
                <button key={g} type="button" className={`chip ${grp === g ? 'on' : ''}`} style={{ justifyContent: 'flex-start', gap: 8, minHeight: 42 }} onClick={() => pickGroup(g)}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: GROUP_COLOR[g], flexShrink: 0 }} />
                  {GROUP_NAME[g]}
                </button>
              ))}
            </div>
            {grp && optionsOf(grp).length > 1 && (
              <>
                <span className="small strong">Loại</span>
                <div className="chips wrap" style={{ gap: 6 }}>
                  {optionsOf(grp).map((c) => (
                    <button key={c.id} type="button" className={`chip ${catId === c.id ? 'on' : ''}`} style={chipStyle} onClick={() => pickCat(c.id)}>
                      {c.name === 'Nguyên liệu khác' ? 'N.liệu khác' : c.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {grp === 'dau_tu' && <span className="xs muted">Khoản đầu tư không trừ vào lãi tháng. Báo cáo Toàn bộ sẽ trừ và cho biết đã thu hồi được bao nhiêu phần trăm.</span>}

            {finalCat && stockMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--bg-000)', borderRadius: 'var(--radius-md)' }}>
                <label className="field">
                  <span className="label small strong">Món trong kho</span>
                  <select className="input sm" value={ingId || ''} aria-label="Món trong kho"
                    onChange={(e) => { if (e.target.value === '__new') { setAdding(true); } else { setIngId(e.target.value || null); setAdding(false); } }}>
                    <option value="">Chọn {finalCat.name.toLowerCase()}…</option>
                    {stockOpts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    <option value="__new">+ Thêm món mới…</option>
                  </select>
                </label>
                {adding && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--bg-100)', borderRadius: 'var(--radius-md)' }}>
                    <span className="xs muted">Món mới sẽ có trong Tồn kho, nhóm {finalCat.name.toLowerCase()}.</span>
                    <span className="input-wrap"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên món, vd: hạt bí" maxLength={60} style={{ textAlign: 'left', fontSize: 16 }} aria-label="Tên món mới" /></span>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="xs muted">Đơn vị</span>
                      {['g', 'ml', 'cai'].map((u) => (
                        <button key={u} type="button" className={`chip ${newUnit === u ? 'on' : ''}`} style={{ minHeight: 32, fontSize: 13 }} onClick={() => setNewUnit(u)}>{unitLabel(u)}</button>
                      ))}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button type="button" className="btn sm" disabled={busy} onClick={addIngredient}>Thêm vào kho</button>
                      <button type="button" className="btn quiet sm" onClick={() => setAdding(false)}>Thôi</button>
                    </div>
                  </div>
                )}
                {ing?.piece_g && (
                  <div className="seg sm" role="tablist" aria-label="Đơn vị nhập" style={{ alignSelf: 'flex-start' }}>
                    <button type="button" className={!byPiece ? 'on' : ''} onClick={() => { setByPiece(false); setQty(''); setUnitPrice(''); }}>Theo {unitLabel(ing.purchase_unit)}</button>
                    <button type="button" className={byPiece ? 'on' : ''} onClick={() => { setByPiece(true); setQty(''); setUnitPrice(''); }}>Theo quả</button>
                  </div>
                )}
                {ing && (
                  <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <div className="field" style={{ flex: '0 0 auto' }}>
                      <span className="label small strong">Số lượng</span>
                      <NumberField value={qty} onChange={onQty} unit={qtyUnit} label="Số lượng" width={130} decimals />
                    </div>
                    <div className="field grow" style={{ minWidth: 0 }}>
                      <span className="label small strong">Đơn giá (đ/{qtyUnit})</span>
                      <MoneyInput value={unitPrice} onChange={onUnitPrice} label="Đơn giá" placeholder="không bắt buộc" />
                    </div>
                  </div>
                )}
                {piece && (
                  <div className="field">
                    <span className="label small strong">Mỗi quả khoảng</span>
                    <NumberField value={pieceG} onChange={setPieceG} unit="g" label="Số gam mỗi quả" width={130} />
                    <span className="xs muted">Để trống thì lấy {num(Number(ing!.piece_g))} g (ước tính). Cân được thì ghi số thật để kho đúng hơn.</span>
                  </div>
                )}
                <div className="row small" style={{ gap: 8, padding: '8px 10px', background: stockApplied ? 'var(--bg-brand-soft)' : 'var(--bg-200)', borderRadius: 'var(--radius-md)', alignItems: 'flex-start' }}>
                  <Icon name={stockApplied ? 'box' : 'scale'} size={18} style={{ color: 'var(--ink-brand)', flexShrink: 0 }} />
                  <span>
                    {stockApplied ? (
                      <>Sẽ cộng vào kho: <strong>{piece ? `${num(Number(qty))} quả = ` : ''}{num(qtyPU, 2)} {unitLabel(ing!.purchase_unit)} {ing!.name}</strong>{ing!.purchase_factor !== 1 ? ` (${num(qtyPU * ing!.purchase_factor)} ${unitLabel(ing!.unit)})` : ''}, giống Nhập hàng.</>
                    ) : ing ? (
                      <>Chưa có số lượng nên <strong>chỉ ghi tiền</strong>. {ing.name} trong kho cập nhật khi kiểm kê.</>
                    ) : (
                      'Chọn món rồi ghi số lượng để cộng vào kho, giống Nhập hàng.'
                    )}
                  </span>
                </div>
              </div>
            )}

            {finalCat && !stockMode && (
              <>
                <label className="field">
                  <span className="label small strong">Tên khoản chi</span>
                  <span className="input-wrap">
                    <input value={name} onChange={(e) => setName(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
                      placeholder={grp === 'nguyen_lieu' ? 'Vd: hạt óc chó, dây thừng' : grp === 'dau_tu' ? 'Vd: máy xay thứ 2' : 'Vd: tiền điện tháng 10'}
                      maxLength={120} style={{ textAlign: 'left', fontSize: 16 }} aria-label="Tên khoản chi" />
                  </span>
                </label>
                {showSug && (
                  <div className="card tight" role="listbox" style={{ marginTop: -6, padding: 0, gap: 0, boxShadow: 'var(--shadow-soft)' }}>
                    {sugUsed.map((n) => (
                      <button key={n} type="button" className="list-row" style={{ border: 0, background: 'transparent', width: '100%', textAlign: 'left', padding: '8px 12px' }}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => { setName(n); setFocus(false); }}>
                        <Icon name="history" size={18} style={{ color: 'var(--ink-muted)' }} />
                        <span className="grow"><span className="strong">{n}</span> <span className="xs muted">· đã dùng</span></span>
                      </button>
                    ))}
                  </div>
                )}
                {grp === 'nguyen_lieu' && <span className="xs muted">Loại này chỉ ghi tiền, không vào tồn kho.</span>}
              </>
            )}

            <div className="field">
              <span className="label small strong">Số tiền</span>
              <MoneyInput value={amount} onChange={onAmount} label="Số tiền" big />
              {stockMode && ing && <span className="xs muted">Nhập số lượng và đơn giá thì app tự tính số tiền, hoặc nhập thẳng số tiền.</span>}
            </div>
            {!existing && (grp === 'nguyen_lieu' || grp === 'vat_tu') && (
              <button type="button" className="btn secondary block" disabled={busy} onClick={addMore}>
                <Icon name="plus" size={18} sw={2} /> Thêm món khác
              </button>
            )}
            <label className="field">
              <span className="label small strong">Ngày chi</span>
              <span className="input-wrap">
                <input type="date" value={date} max={vnToday()} onChange={(e) => setDate(e.target.value)} style={{ textAlign: 'left', fontSize: 16 }} />
              </span>
            </label>
            {existing && <p className="xs muted">Sửa không xóa khoản cũ. App hủy khoản cũ rồi ghi khoản mới, cả hai vẫn xem được trong Lịch sử.</p>}
          </>
        )}

        </div>
        <div className="fp-foot">
        {err && <span className="err">{err}</span>}
        {!fromPurchase && (
          <button className="btn lg block" disabled={busy} onClick={save}>
            {busy ? 'Đang lưu…' : existing ? 'Lưu thay đổi' : items.length ? `Lưu ${items.length + (currentEmpty ? 0 : 1)} khoản · ${vnd(items.reduce((a, x) => a + x.amount, 0) + Number(amount || 0))}` : 'Lưu khoản chi'}
          </button>
        )}
        {existing && (
          <button className="btn secondary block" disabled={busy} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={cancelIt}>
            <Icon name="trash" size={18} sw={2} /> {fromPurchase ? 'Hủy phiếu nhập…' : 'Hủy khoản chi…'}
          </button>
        )}
        </div>
      </div>
    </>
  );
}
