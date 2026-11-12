import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';
import { useLoad } from '../lib/data';
import { GROUP_COLOR, GROUP_NAME, GROUP_ORDER } from '../lib/reports';
import { loadExpenseCats, type ExpCat, type ExpenseRow } from '../lib/expenses';
import { rangeOf, type Range } from '../lib/period';
import { ddmm, vnd, vndShort, vnToday } from '../lib/format';
import { Empty, Header, Icon, Loading, Nav, useToast } from '../components/ui';
import ExpenseSheet from '../components/ExpenseSheet';

/** Biểu đồ tròn rỗng giữa, vẽ bằng stroke-dasharray để không cần thư viện. */
function Donut({ parts, total, caption }: { parts: { id: string; value: number; color: string }[]; total: number; caption: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={112} height={112} viewBox="0 0 120 120" role="img" aria-label={`${caption} ${vnd(total)}`} style={{ flexShrink: 0 }}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bg-200)" strokeWidth="16" />
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle key={p.id} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="16"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
            );
            offset += len;
            return el;
          })}
      <text x="60" y="56" textAnchor="middle" fontSize="10" fill="var(--ink-muted)">{caption}</text>
      <text x="60" y="72" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)">{vndShort(total)}</text>
    </svg>
  );
}

const SHADES = ['1', '0.78', '0.58', '0.42', '0.3', '0.22', '0.16'];

/** Màn Chi phí 1.1 (H01, H05, H06): theo 4 nhóm, bấm nhóm xem theo loại; lịch sử theo ngày; thêm, sửa bằng bottom sheet. */
export default function Expenses({ openNew = false }: { openNew?: boolean }) {
  const { outlet, canManage, bump, dataVersion } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [range, setRange] = useState<Range>('month');
  const [off, setOff] = useState(0);
  const [group, setGroup] = useState<string | null>(null); // bấm nhóm trên biểu đồ: xem theo loại
  const [listGroup, setListGroup] = useState<string | null>(null); // chip trong Lịch sử chi: chỉ lọc danh sách
  const [sheet, setSheet] = useState<{ row: ExpenseRow | null } | null>(openNew ? { row: null } : null);
  const [cats, setCats] = useState<ExpCat[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadExpenseCats().then(setCats).catch(() => setCats([]));
  }, []);

  const thisMonth = vnToday().slice(0, 7) + '-01';
  const { data: firstDay } = useLoad(async (oid) => {
    const { data } = await supabase.from('expenses').select('spent_on').eq('outlet_id', oid).order('spent_on').limit(1);
    return (data?.[0]?.spent_on as string | undefined) || thisMonth;
  }, [dataVersion]);
  const [from, to, , , label] = rangeOf(range, off, (firstDay || thisMonth).slice(0, 7) + '-01');

  const { data, loading } = useLoad(
    async (oid) => {
      let q = supabase.from('expenses').select('*').eq('outlet_id', oid).lt('spent_on', to);
      if (range !== 'all') q = q.gte('spent_on', from);
      const [rows, used] = await Promise.all([
        q.order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
        supabase.from('expenses').select('item_name').eq('outlet_id', oid).eq('status', 'active').not('item_name', 'is', null).order('created_at', { ascending: false }).limit(300)
      ]);
      if (rows.error) throw rows.error;
      const names = [...new Set(((used.data || []) as any[]).map((r) => r.item_name as string))];
      return { rows: (rows.data || []) as ExpenseRow[], names };
    },
    [range, from, to, dataVersion]
  );

  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const groupOf = (r: ExpenseRow) => (r.category_id && catById[r.category_id]?.group_code) || 'van_hanh';
  const catLabel = (r: ExpenseRow) => {
    const c = r.category_id ? catById[r.category_id] : undefined;
    return c?.name || '';
  };
  /** Loại để vẽ khi xem một nhóm: Đầu tư gộp theo loại con */
  const typeOf = (r: ExpenseRow) => catLabel(r);

  if (!outlet) return null;
  if (!canManage) return <Navigate to="/" replace />;

  const all = data?.rows || [];
  // Tổng theo nhóm: gồm cả bản gốc đã hủy và bản đảo (tự triệt tiêu), như báo cáo
  const sumBy = (keyFn: (r: ExpenseRow) => string, rows: ExpenseRow[]) => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(keyFn(r), (m.get(keyFn(r)) || 0) + r.amount_vnd));
    return m;
  };
  const inGroup = group ? all.filter((r) => groupOf(r) === group) : all;
  const parts = group
    ? [...sumBy(typeOf, inGroup).entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, value], i) => ({ id, value, color: GROUP_COLOR[group], opacity: SHADES[Math.min(i, SHADES.length - 1)] }))
    : GROUP_ORDER.map((g) => ({ id: g, value: sumBy(groupOf, all).get(g) || 0, color: GROUP_COLOR[g], opacity: '1' }));
  const total = parts.reduce((s, p) => s + p.value, 0);
  // Danh sách: chỉ khoản đang có hiệu lực và khoản đã hủy (không hiện dòng đảo)
  const list = all.filter((r) => r.status !== 'reversal' && (!listGroup || groupOf(r) === listGroup));
  const shown = showAll ? list : list.slice(0, 40);
  const byDay = new Map<string, ExpenseRow[]>();
  shown.forEach((r) => byDay.set(r.spent_on, [...(byDay.get(r.spent_on) || []), r]));
  const today = vnToday();

  const tag = (r: ExpenseRow) => {
    if (r.status === 'reversed') return <span className="badge muted">{r.reversal_reason === 'Sửa khoản chi' || all.some((x) => x.replaces_id === r.id) ? 'đã sửa' : 'đã hủy'}</span>;
    if (r.source === 'import') return <span className="badge warn">Từ file cũ</span>;
    if (r.source === 'purchase') return <span className="badge ok">Từ phiếu nhập</span>;
    if (r.purchase_id) return <span className="badge ok">Đã cộng kho</span>;
    const g = groupOf(r);
    if (g === 'nguyen_lieu' || g === 'vat_tu') return <span className="badge info">Chỉ ghi tiền</span>;
    return null;
  };

  function done(msg: string) {
    setSheet(null);
    toast.show(msg);
    bump();
    if (openNew) nav('/chi-phi', { replace: true });
  }

  return (
    <div className="screen">
      <Header
        title="Chi phí"
        sub={outlet.name}
        right={
          <button className="icon-btn" aria-label="Thêm khoản chi" style={{ color: 'var(--ink-brand)' }} onClick={() => setSheet({ row: null })}>
            <Icon name="plus" size={26} sw={2.2} />
          </button>
        }
      />
      <main className="main">
        <div className="chips fit4">
          {(
            [
              ['day', 'Ngày'],
              ['week', 'Tuần'],
              ['month', 'Tháng'],
              ['all', 'Toàn bộ']
            ] as [Range, string][]
          ).map(([k, l]) => (
            <button key={k} className={`chip ${range === k ? 'on' : ''}`} onClick={() => { setRange(k); setOff(0); setShowAll(false); }}>
              {l}
            </button>
          ))}
        </div>
        {range !== 'all' && (
          <div className="row between" style={{ marginTop: -6 }}>
            <button className="icon-btn" aria-label="Kỳ trước" onClick={() => setOff(off - 1)}><Icon name="back" size={20} sw={2} /></button>
            <span className="strong">{label}</span>
            <button className="icon-btn" aria-label="Kỳ sau" disabled={off >= 0} style={off >= 0 ? { opacity: 0.3 } : undefined} onClick={() => setOff(off + 1)}><Icon name="chev" size={20} sw={2} /></button>
          </div>
        )}

        {loading && !data ? (
          <Loading />
        ) : all.length === 0 ? (
          <Empty icon="coin" title={range === 'day' ? 'Ngày này chưa có khoản chi nào' : 'Kỳ này chưa có khoản chi nào'}
            text="Ghi tiền mua nguyên liệu, ly, tiền mặt bằng, lương… để báo cáo tính đúng lãi lỗ. Nhập kho có ghi giá thì app tự thêm vào đây.">
            <button className="btn lg" onClick={() => setSheet({ row: null })}><Icon name="plus" size={22} sw={2} /> Thêm khoản chi</button>
            <Link to="/kho/nhap" className="small strong" style={{ textDecoration: 'none' }}>Hoặc nhập hàng vào kho →</Link>
          </Empty>
        ) : (
          <>
            <section className="card">
              <div className="h2">{group ? `${GROUP_NAME[group]} · theo loại` : 'Chi theo nhóm'}</div>
              <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                <Donut parts={parts.map((p) => ({ ...p, color: p.opacity === '1' ? p.color : `color-mix(in srgb, ${p.color} ${Math.round(Number(p.opacity) * 100)}%, white)` }))} total={total} caption={group ? GROUP_NAME[group] : 'Tổng chi'} />
                <div className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  {parts.map((p) => (
                    <button key={p.id} type="button" className="row" disabled={!!group}
                      style={{ border: 0, background: 'transparent', padding: '6px 0', cursor: group ? 'default' : 'pointer', fontSize: 14, gap: 8, color: 'var(--ink)' }}
                      onClick={() => !group && setGroup(p.id)}>
                      <span className="sw" style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: p.opacity === '1' ? p.color : `color-mix(in srgb, ${p.color} ${Math.round(Number(p.opacity) * 100)}%, white)` }} />
                      <span className="grow" style={{ textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group ? p.id : GROUP_NAME[p.id]}</span>
                      <span className="xs muted">{total ? Math.round((p.value / total) * 100) : 0}%</span>
                      <span className="num strong" style={{ minWidth: 48, textAlign: 'right' }}>{vndShort(p.value)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {!group && <p className="xs muted">Bấm một nhóm để xem chi tiết theo loại. Đầu tư thiết bị không trừ vào lãi tháng, chỉ trừ ở báo cáo Toàn bộ.</p>}
              {group && <button className="btn quiet" style={{ alignSelf: 'flex-start' }} onClick={() => setGroup(null)}><Icon name="back" size={16} sw={2} /> Cả 4 nhóm</button>}
            </section>

            <section className="card tight">
              <div className="row between" style={{ padding: '12px 0 2px' }}>
                <span className="h2">Lịch sử chi</span>
              </div>
              <div className="chips" style={{ gap: 6 }}>
                <button className={`chip ${!listGroup ? 'on' : ''}`} style={{ minHeight: 32, fontSize: 13 }} onClick={() => setListGroup(null)}>Tất cả</button>
                {GROUP_ORDER.map((g) => (
                  <button key={g} className={`chip ${listGroup === g ? 'on' : ''}`} style={{ minHeight: 32, fontSize: 13 }} onClick={() => setListGroup(listGroup === g ? null : g)}>{GROUP_NAME[g]}</button>
                ))}
              </div>
              {list.length === 0 && <p className="small muted" style={{ padding: '12px 0' }}>Nhóm này chưa có khoản chi nào trong kỳ.</p>}
              {[...byDay.entries()].map(([d, rows]) => (
                <div key={d}>
                  <div className="row between xs muted strong" style={{ padding: '10px 0 2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <span>{d === today ? `Hôm nay · ${ddmm(d)}` : d === '2026-10-01' && rows.some((r) => r.source === 'import') ? `${ddmm(d)} · từ file Excel` : ddmm(d)}</span>
                    <span className="num">{vnd(rows.filter((r) => r.status === 'active').reduce((s, r) => s + r.amount_vnd, 0))}</span>
                  </div>
                  {rows.map((r) => {
                    const gone = r.status !== 'active';
                    return (
                      <button key={r.id} type="button" className="list-row" disabled={gone}
                        style={{ border: 0, borderBottom: '1px solid var(--border)', background: 'transparent', width: '100%', textAlign: 'left', cursor: gone ? 'default' : 'pointer', color: 'var(--ink)' }}
                        onClick={() => setSheet({ row: r })}>
                        <span className="sw" style={{ width: 10, height: 10, borderRadius: 3, background: GROUP_COLOR[groupOf(r)], flexShrink: 0 }} />
                        <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                          <span className="strong" style={gone ? { textDecoration: 'line-through', color: 'var(--ink-muted)' } : undefined}>{r.item_name || catLabel(r)}</span>
                          <span className="xs muted row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <span>{catLabel(r)}{r.qty && r.purchase_id ? ` · ${r.qty}` : ''}</span>
                            {tag(r)}
                          </span>
                        </span>
                        <strong className="num" style={gone ? { textDecoration: 'line-through', color: 'var(--ink-muted)' } : undefined}>{vnd(r.amount_vnd)}</strong>
                      </button>
                    );
                  })}
                </div>
              ))}
              {list.length > shown.length && (
                <button className="btn quiet block" onClick={() => setShowAll(true)}>Xem thêm {list.length - shown.length} khoản</button>
              )}
            </section>
            <p className="xs muted">Bấm một khoản để sửa hoặc hủy. Sửa xong, khoản cũ vẫn còn với chữ "đã sửa". Khoản "Từ file cũ" chép từ file Excel và Knote trước khi dùng app.</p>
          </>
        )}
      </main>
      <Nav />
      {sheet && cats.length > 0 && (
        <ExpenseSheet cats={cats} usedNames={data?.names || []} existing={sheet.row}
          onClose={() => { setSheet(null); if (openNew) nav('/chi-phi', { replace: true }); }} onDone={done} />
      )}
      {toast.node}
    </div>
  );
}
