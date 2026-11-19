import type { ReactNode } from 'react';
import { vnd } from '../lib/format';
import {
  AMOUNT_STEP, ORDER_QUICK, PCTS, PER_PART_QUICK, allocate, discError, discTotal, grossOf, maxPerPart, partsOf, unitsOf,
  type Disc, type DiscLine
} from '../lib/discount';
import { Icon } from './ui';

export type DiscRow = DiscLine & { key: string; name: string; icon?: ReactNode };

/** Bộ chọn giảm giá dùng chung cho màn Ghi đơn (sheet) và Sửa đơn (thiết kế X01–X04).
 *  Hàng đầu: 5% · 10% · Theo tiền. Theo tiền: Mỗi phần (bước 1.000 đ) hoặc Tổng đơn (gõ số). */
export default function DiscountPicker({ rows, disc, setDisc }: { rows: DiscRow[]; disc: Disc; setDisc: (d: Disc) => void }) {
  const gross = grossOf(rows);
  const parts = partsOf(rows);
  const kind = disc?.kind ?? null;
  const ks = allocate(rows, disc);
  const us = unitsOf(rows, disc);
  const err = discError(rows, disc);
  const scopeParts = disc && disc.kind !== 'order' ? disc.parts : null;
  const someN = scopeParts != null ? Math.max(1, Math.min(scopeParts, parts)) : null;
  const withParts = (p: number | null): Disc =>
    !disc || disc.kind === 'order' ? disc : { ...disc, parts: p };
  const allPreview = disc && disc.kind !== 'order' ? discTotal(rows, { ...disc, parts: null }) : 0;
  const max = disc?.kind === 'per_part' ? maxPerPart(rows, disc) : 0;
  const pctSel = disc?.kind === 'pct' ? disc.pct : null;

  return (
    <>
      <span className="h2" style={{ margin: 0 }}>Cách giảm</span>
      <div className="seg3" role="radiogroup" aria-label="Cách giảm">
        {PCTS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={pctSel === v} className={pctSel === v ? 'on' : ''} style={{ minHeight: 44, fontSize: 16 }}
            onClick={() => setDisc({ kind: 'pct', pct: v, parts: scopeParts })}>
            {v}%
          </button>
        ))}
        <button type="button" role="radio" aria-checked={kind === 'per_part' || kind === 'order'} className={kind === 'per_part' || kind === 'order' ? 'on' : ''}
          style={{ minHeight: 44, fontSize: 16 }}
          onClick={() => { if (kind !== 'per_part' && kind !== 'order') setDisc({ kind: 'per_part', amount: 5000, parts: scopeParts }); }}>
          Theo tiền
        </button>
      </div>

      {(kind === 'per_part' || kind === 'order') && (
        <div className="seg3" role="radiogroup" aria-label="Giảm theo">
          <button type="button" role="radio" aria-checked={kind === 'per_part'} className={kind === 'per_part' ? 'on' : ''}
            style={{ flexDirection: 'column', gap: 2, minHeight: 60 }}
            onClick={() => kind !== 'per_part' && setDisc({ kind: 'per_part', amount: 5000, parts: null })}>
            <span>Mỗi phần</span>
            <span className="xs" style={{ fontWeight: 500, opacity: 0.85 }}>số tiền × số phần</span>
          </button>
          <button type="button" role="radio" aria-checked={kind === 'order'} className={kind === 'order' ? 'on' : ''}
            style={{ flexDirection: 'column', gap: 2, minHeight: 60 }}
            onClick={() => kind !== 'order' && setDisc({ kind: 'order', amount: Math.min(10000, gross) })}>
            <span>Tổng đơn</span>
            <span className="xs" style={{ fontWeight: 500, opacity: 0.85 }}>một khoản cho cả đơn</span>
          </button>
        </div>
      )}

      {disc?.kind === 'per_part' && (
        <>
          <div className="row" style={{ gap: 10 }}>
            <span className="grow">
              <span className="strong" style={{ display: 'block' }}>Giảm mỗi phần</span>
              <span className="xs muted">bước {vnd(AMOUNT_STEP)} · tối đa {vnd(max)}</span>
            </span>
            <span className="stepper">
              <button type="button" aria-label="Bớt 1.000 đ" disabled={disc.amount <= AMOUNT_STEP}
                onClick={() => setDisc({ ...disc, amount: Math.max(AMOUNT_STEP, disc.amount - AMOUNT_STEP) })}><Icon name="minus" size={20} sw={2.4} /></button>
              <span className="val" aria-live="polite" style={{ minWidth: 92, whiteSpace: 'nowrap', fontSize: 18 }}>{vnd(disc.amount)}</span>
              <button type="button" className="plus" aria-label="Thêm 1.000 đ" disabled={disc.amount + AMOUNT_STEP > max}
                onClick={() => setDisc({ ...disc, amount: disc.amount + AMOUNT_STEP })}><Icon name="plus" size={20} sw={2.4} /></button>
            </span>
          </div>
          <QuickRow values={PER_PART_QUICK} value={disc.amount} max={max} onPick={(a) => setDisc({ ...disc, amount: a })} />
        </>
      )}

      {disc?.kind === 'order' && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="strong">Số tiền giảm cho cả đơn</span>
            <span className="input-wrap" style={{ borderColor: err ? 'var(--danger)' : undefined }}>
              <input inputMode="numeric" aria-label="Số tiền giảm cho cả đơn" value={disc.amount ? disc.amount.toLocaleString('vi-VN') : ''}
                onChange={(e) => setDisc({ kind: 'order', amount: Math.min(99_999_999, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                style={{ fontSize: 20, fontWeight: 600 }} />
              <span className="muted strong">đ</span>
            </span>
            {!err && <span className="xs muted">Tối đa {vnd(gross)} (bằng tạm tính)</span>}
          </label>
          <QuickRow values={ORDER_QUICK} value={disc.amount} max={gross} onPick={(a) => setDisc({ kind: 'order', amount: a })} />
        </>
      )}

      {err && (
        <p role="alert" className="small strong" style={{ margin: 0, display: 'flex', gap: 6, color: 'var(--danger)' }}>
          <Icon name="warn" size={18} /> <span>{err}</span>
        </p>
      )}

      {disc && disc.kind !== 'order' && (
        <>
          <span className="h2" style={{ margin: 0 }}>Giảm cho</span>
          <div className="seg3" role="radiogroup" aria-label="Giảm cho">
            <button type="button" role="radio" aria-checked={someN == null} className={someN == null ? 'on' : ''}
              style={{ flexDirection: 'column', gap: 2, minHeight: 60 }} onClick={() => setDisc(withParts(null))}>
              <span>Tất cả phần</span>
              <span className="xs num" style={{ fontWeight: 500, opacity: 0.85 }}>{parts} phần · − {vnd(allPreview)}</span>
            </button>
            <button type="button" role="radio" aria-checked={someN != null} className={someN != null ? 'on' : ''}
              style={{ flexDirection: 'column', gap: 2, minHeight: 60 }} onClick={() => setDisc(withParts(someN ?? 1))}>
              <span>Một số phần</span>
              <span className="xs" style={{ fontWeight: 500, opacity: 0.85 }}>chọn số phần</span>
            </button>
          </div>
          {someN != null && (
            <div className="row" style={{ gap: 12 }}>
              <span className="grow">
                <span className="strong" style={{ display: 'block' }}>Số phần được giảm</span>
                <span className="xs muted">Đơn có {parts} phần · giá cao trước</span>
              </span>
              <span className="stepper">
                <button type="button" aria-label="Bớt một phần" disabled={someN <= 1} onClick={() => setDisc(withParts(someN - 1))}><Icon name="minus" size={20} sw={2.4} /></button>
                <span className="val" aria-live="polite">{someN}</span>
                <button type="button" className="plus" aria-label="Thêm một phần" disabled={someN >= parts} onClick={() => setDisc(withParts(someN + 1))}><Icon name="plus" size={20} sw={2.4} /></button>
              </span>
            </div>
          )}
        </>
      )}

      <div className="disc-list">
        {rows.filter((r) => r.qty > 0).map((r) => {
          const i = rows.indexOf(r);
          const k = ks[i];
          const pctShare = disc?.kind === 'order' && gross > 0 ? Math.round((r.qty * r.price * 100) / gross) : 0;
          return (
            <div key={r.key} className="row" style={{ gap: 10, opacity: !disc || k ? 1 : 0.6 }}>
              {r.icon}
              <span className="grow">
                <span className="small strong" style={{ display: 'block' }}>{r.qty} × {r.name}</span>
                <span className="xs muted">
                  {vnd(r.price)} mỗi phần
                  {!disc ? '' : disc.kind === 'order' ? ' · theo giá trị' : !k ? ' · giữ giá gốc' : k < r.qty ? ` · ${k} trong ${r.qty} phần được giảm` : ' · được giảm'}
                </span>
              </span>
              {k > 0 && us[i] > 0 ? (
                <span className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span className="small strong" style={{ display: 'block', color: 'var(--ink-brand)' }}>− {vnd(k * us[i])}</span>
                  <span className="xs muted">{disc?.kind === 'order' ? `${pctShare}% khoản giảm` : `${k} phần × ${vnd(us[i])}`}</span>
                </span>
              ) : disc ? <span className="xs muted" style={{ whiteSpace: 'nowrap' }}>không giảm</span> : <span className="small strong num">{vnd(r.qty * r.price)}</span>}
            </div>
          );
        })}
      </div>
      {disc?.kind === 'order' && (
        <p className="xs muted" style={{ margin: 0 }}>App tự chia khoản giảm theo giá trị từng món, để báo cáo lãi từng món vẫn đúng. Người bán không cần làm gì thêm.</p>
      )}
    </>
  );
}

function QuickRow({ values, value, max, onPick }: { values: number[]; value: number; max: number; onPick: (v: number) => void }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {values.map((x) => (
        <button key={x} type="button" className={`chip grow ${value === x ? 'on' : ''}`} aria-pressed={value === x} disabled={x > max}
          style={{ minHeight: 36, justifyContent: 'center', fontSize: 13 }} onClick={() => onPick(x)}>
          {x.toLocaleString('vi-VN')}
        </button>
      ))}
    </div>
  );
}
