import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './ui';

export type ReportKey = 'day' | 'week' | 'month' | 'all' | 'model' | 'hours';
const OTHER: [ReportKey, string, string][] = [
  ['all', 'Toàn bộ thời gian', 'Toàn bộ'],
  ['model', 'Mô hình một cơ sở', 'Mô hình'],
  ['hours', 'Bán theo giờ và thứ', 'Theo giờ']
];

/** Hàng chip Ngày · Tuần · Tháng · Khác▾. Chip thứ tư xổ ra các báo cáo khác; đang xem báo cáo nào thì chip hiện tên ngắn của báo cáo đó. */
export function ReportTabs({ active, onPick, staffLimited = false }: { active: ReportKey; onPick?: (k: 'day' | 'week' | 'month' | 'all') => void; staffLimited?: boolean }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const go = (k: ReportKey) => {
    setOpen(false);
    if (k === 'model') return nav('/bao-cao/mo-hinh');
    if (k === 'hours') return nav('/bao-cao/theo-gio');
    if (onPick) onPick(k);
    else nav(`/bao-cao?ky=${k}`);
  };
  const other = OTHER.find((o) => o[0] === active);
  const dim = (on: boolean) => (staffLimited && !on ? { opacity: 0.45 } : undefined);
  return (
    <div className="chips fit4" ref={box} style={{ position: 'relative', overflow: 'visible' }}>
      {([['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']] as [ReportKey, string][]).map(([k, l]) => (
        <button key={k} className={`chip ${active === k ? 'on' : ''}`} disabled={staffLimited && k === 'all'} style={dim(k !== 'all')} onClick={() => go(k)}>{l}</button>
      ))}
      <button className={`chip ${other ? 'on' : ''}`} disabled={staffLimited} style={{ ...dim(false), gap: 2 }} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {other ? other[2] : 'Khác'}
        <Icon name="chev" size={14} sw={2.2} style={{ transform: `rotate(${open ? -90 : 90}deg)` }} />
      </button>
      {open && (
        <div className="menu-pop" role="listbox" aria-label="Báo cáo khác">
          {OTHER.map(([k, l]) => (
            <button key={k} role="option" aria-selected={active === k} className={active === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}
