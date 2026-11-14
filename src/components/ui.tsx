import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app';

const PATHS: Record<string, string> = {
  home: '<path d="M3 11L12 4L21 11"/><path d="M5 10V20H19V10"/><path d="M10 20V14H14V20"/>',
  cart: '<path d="M3 9H21L19.5 13H4.5Z"/><path d="M5 13V20M19 13V20M5 17H19"/><path d="M6 9L8 4H16L18 9"/>',
  blender: '<path d="M7 3H17L15.5 14H8.5Z"/><path d="M8.5 14H15.5V17H8.5Z"/><path d="M6.5 17H17.5V21H6.5Z"/><path d="M12 7V10"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ai: '<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8Z"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  scale: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7 2 14a3.5 3.5 0 0 0 6 0Z"/><path d="M19 7l-3 7a3.5 3.5 0 0 0 6 0Z"/>',
  truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  gift: '<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8c-2-3-6-3-6 0h6Zm0 0c2-3 6-3 6 0h-6Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
  warn: '<path d="M12 3 2 20h20Z"/><path d="M12 9v5M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5L11 15.5L16.5 9.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  bottle: '<rect x="9" y="2.5" width="6" height="3" rx="1"/><path d="M9.5 5.5V7C9.5 8 7.5 9 7.5 11V19.5A2 2 0 0 0 9.5 21.5H14.5A2 2 0 0 0 16.5 19.5V11C16.5 9 14.5 8 14.5 7V5.5"/><path d="M7.5 14H16.5"/>',
  sprout: '<path d="M12 21V11"/><path d="M12 13C12 9 9 6 4 6C4 10 7 13 12 13Z"/><path d="M12 11C12 7 15 4 20 4C20 8 17 11 12 11Z"/><path d="M7 21H17"/>',
  spark: '<path d="M12 3V7M12 17V21M3 12H7M17 12H21M5.6 5.6L8.4 8.4M15.6 15.6L18.4 18.4M5.6 18.4L8.4 15.6M15.6 8.4L18.4 5.6"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 6.5L12 13L21 6.5"/>',
  bike: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17H11L14 11H18L20 15"/><rect x="2.5" y="6" width="7" height="6" rx="1"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9C14 8 13 7.5 12 7.5C10.5 7.5 9.5 8.3 9.5 9.5C9.5 12 14.5 11 14.5 14C14.5 15.3 13.4 16.5 12 16.5C10.8 16.5 9.8 15.9 9.3 15"/><path d="M12 6V7.5M12 16.5V18"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M12 19h.01"/><path d="M3 3l18 18"/>'
};

export function Icon({ name, size = 22, sw = 1.8, className, style }: { name: keyof typeof PATHS | string; size?: number; sw?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: PATHS[name] || '' }}
    />
  );
}

export function Bottle({ color, size = 40 }: { color: string | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 64" aria-hidden="true">
      <rect x="17" y="2" width="14" height="7" rx="2" fill="#1F3A2A" opacity="0.85" />
      <path d="M18 9h12v6c0 3 7 5 7 11v30a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V26c0-6 7-8 7-11Z" fill={color || '#ddd'} stroke="#1F3A2A" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="14" y="30" width="20" height="16" rx="3" fill="#F7F3EB" opacity="0.92" />
      <circle cx="24" cy="38" r="4.5" fill="#296241" />
    </svg>
  );
}

export function Cup({ color, size = 40 }: { color: string | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 64" aria-hidden="true">
      <rect x="9" y="12" width="30" height="6" rx="3" fill="#1F3A2A" opacity="0.85" />
      <path d="M11 18h26l-3.2 38a4 4 0 0 1-4 3.6H18.2a4 4 0 0 1-4-3.6Z" fill="#F7F3EB" stroke="#1F3A2A" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M12.6 30h22.8l-1.2 14H13.8Z" fill={color || '#ddd'} />
      <rect x="22.5" y="2" width="3" height="14" rx="1.5" fill="#1F3A2A" opacity="0.6" />
    </svg>
  );
}

export function Header({ title, sub, back, right }: { title: string; sub?: ReactNode; back?: string | true; right?: ReactNode }) {
  const nav = useNavigate();
  const { online, queue } = useApp();
  const pending = queue.filter((q) => !q.rejected).length;
  return (
    <>
      <header className="header">
        {back && (
          <button className="icon-btn" style={{ marginLeft: -8 }} aria-label="Quay lại" onClick={() => (back === true ? nav(-1) : nav(back))}>
            <Icon name="back" size={24} sw={2} />
          </button>
        )}
        <div className="titles">
          <h1>{title}</h1>
          {sub && <span className="sub">{sub}</span>}
        </div>
        {right}
      </header>
      {(!online || pending > 0) && (
        <div className="banner" role="status">
          <Icon name={online ? 'warn' : 'wifi'} size={18} sw={2} style={{ color: 'var(--warn)' }} />
          <span>
            {!online ? <strong>Mất mạng. </strong> : null}
            {pending > 0 ? `${pending} đơn đang chờ gửi, sẽ tự gửi khi có mạng.` : 'Vẫn ghi đơn được, app sẽ gửi khi có mạng lại.'}
          </span>
        </div>
      )}
    </>
  );
}

/** Biểu tượng trợ lý: ngôi sao lấp lánh tô màu chuyển sắc, chỉ dùng cho chatbot. */
export function AiMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ai-grad" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7B5CFA" />
          <stop offset="0.55" stopColor="#E0569B" />
          <stop offset="1" stopColor="#F5A524" />
        </linearGradient>
      </defs>
      <path d="M10 2.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2Z" fill="url(#ai-grad)" />
      <path d="M18 13.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" fill="url(#ai-grad)" />
    </svg>
  );
}

export function BellLink() {
  const { outlet, profile, dataVersion, canManage } = useApp();
  const { pathname } = useLocation();
  const [n, setN] = useState(0);
  const [tick, setTick] = useState(0);
  // Quay lại app (mở từ màn hình khóa, đổi tab) thì đếm lại thông báo
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && setTick((t) => t + 1);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  useEffect(() => {
    if (!outlet || !profile) return;
    import('../lib/supabase').then(async ({ supabase }) => {
      // Cùng mốc 30 ngày với màn Thông báo
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [{ data: ns }, { data: rs }] = await Promise.all([
        supabase.from('notifications').select('id').eq('outlet_id', outlet.id).gte('created_at', since),
        supabase.from('notification_reads').select('notification_id').eq('user_id', profile.id)
      ]);
      const read = new Set((rs || []).map((r: any) => r.notification_id));
      const count = (ns || []).filter((x: any) => !read.has(x.id)).length;
      setN(count);
      // Số trên biểu tượng app ngoài màn hình chính (iPhone, Android có hỗ trợ)
      const nav = navigator as any;
      if (nav.setAppBadge) (count ? nav.setAppBadge(count) : nav.clearAppBadge?.())?.catch?.(() => undefined);
    });
  }, [outlet, profile, dataVersion, tick]);
  const bell = (
    <Link to="/thong-bao" className="icon-btn" aria-label={`Thông báo, ${n} chưa đọc`}>
      <Icon name="bell" size={24} />
      {n > 0 && <span className="dot">{n}</span>}
    </Link>
  );
  // Trợ lý báo cáo: chỉ chủ cơ sở và admin, nằm ngay bên trái chuông
  if (!canManage || !['/', '/bao-cao', '/chi-phi'].includes(pathname)) return bell; // chỉ ở Trang chủ, Báo cáo, Chi phí
  return (
    <span className="row" style={{ gap: 0 }}>
      <Link to="/bao-cao/hoi" className="icon-btn" aria-label="Hỏi trợ lý báo cáo">
        <AiMark size={32} />
      </Link>
      {bell}
    </span>
  );
}

/** Thanh dưới (quyết định 12/11): Trang chủ · Bán · Báo cáo · Chi phí · Tài khoản.
 *  Nấu mở từ Trang chủ nên các màn /nau sáng ô Trang chủ. Chi phí chỉ hiện cho chủ cơ sở và admin,
 *  vì DB hiện chỉ cho họ ghi và xem chi phí (fn_post_expense, RLS expenses_read). */
export function Nav() {
  const { canManage } = useApp();
  const { pathname } = useLocation();
  const items = [
    { to: '/', icon: 'home', label: 'Trang chủ', active: pathname === '/' || pathname.startsWith('/nau') },
    { to: '/ban', icon: 'cart', label: 'Bán' },
    { to: '/bao-cao', icon: 'chart', label: 'Báo cáo' },
    ...(canManage ? [{ to: '/chi-phi', icon: 'coin', label: 'Chi phí' }] : []),
    { to: '/tai-khoan', icon: 'user', label: 'Tài khoản' }
  ];
  return (
    <nav className="nav" aria-label="Điều hướng chính" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => ((it.active ?? isActive) ? 'active' : '')}>
          {({ isActive }) => {
            const on = it.active ?? isActive;
            return (
              <>
                <Icon name={it.icon} size={22} sw={on ? 2 : 1.8} />
                {it.label}
              </>
            );
          }}
        </NavLink>
      ))}
    </nav>
  );
}

/** Ô số người dùng gõ: chỉ nhận số dương. Gõ dấu "-" thì báo lỗi dưới ô và không đổi giá trị. */
export const NEG_MSG = 'Chỉ nhập số dương. Số âm không được lưu.';
export function hasMinus(raw: string) {
  return raw.includes('-') || raw.includes('−');
}

export function Stepper({ value, onChange, label, min = 0, step = 1, editable = false }: { value: number; onChange: (v: number) => void; label: string; min?: number; step?: number; editable?: boolean }) {
  const [bad, setBad] = useState(false);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <span className="stepper">
        <button type="button" aria-label={`Bớt ${label}`} onClick={() => { setBad(false); onChange(Math.max(min, +(value - step).toFixed(2))); }}>
          <Icon name="minus" size={18} sw={2.2} />
        </button>
        {editable ? (
          <input
            className="val"
            inputMode="numeric"
            aria-label={label}
            aria-invalid={bad}
            value={value}
            onChange={(e) => {
              if (hasMinus(e.target.value)) return setBad(true);
              setBad(false);
              const v = Number(e.target.value.replace(/\D/g, ''));
              onChange(Number.isFinite(v) ? Math.max(min, v) : min);
            }}
          />
        ) : (
          <span className="val" aria-live="polite">{value}</span>
        )}
        <button type="button" className="plus" aria-label={`Thêm ${label}`} onClick={() => { setBad(false); onChange(+(value + step).toFixed(2)); }}>
          <Icon name="plus" size={18} sw={2.2} />
        </button>
      </span>
      {bad && <span className="err xs">Chỉ nhập số dương</span>}
    </span>
  );
}

export function NumberField({ value, onChange, unit, label, width = 130, decimals = false }: { value: string; onChange: (v: string) => void; unit?: string; label: string; width?: number; decimals?: boolean }) {
  const [bad, setBad] = useState(false);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, width, flexShrink: 0 }}>
      <label className="input-wrap" style={{ width }}>
        <input
          inputMode={decimals ? 'decimal' : 'numeric'}
          aria-label={label}
          aria-invalid={bad}
          value={value}
          onChange={(e) => {
            if (hasMinus(e.target.value)) return setBad(true);
            setBad(false);
            onChange(decimals ? e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') : e.target.value.replace(/\D/g, ''));
          }}
        />
        {unit && <span className="u">{unit}</span>}
      </label>
      {bad && <span className="err xs">Chỉ nhập số dương</span>}
    </span>
  );
}

/** Ô nhập tiền VND (hiện dấu chấm nghìn). value là chuỗi chữ số. */
export function MoneyInput({ value, onChange, label, big = false, placeholder }: { value: string; onChange: (v: string) => void; label: string; big?: boolean; placeholder?: string }) {
  const [bad, setBad] = useState(false);
  return (
    <>
      <label className="input-wrap">
        <input
          inputMode="numeric"
          style={big ? { fontSize: 24, fontWeight: 700 } : undefined}
          value={value ? Number(value).toLocaleString('vi-VN') : ''}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={bad}
          onChange={(e) => {
            if (hasMinus(e.target.value)) return setBad(true);
            setBad(false);
            onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''));
          }}
        />
        <span className="u">đ</span>
      </label>
      {bad && <span className="err">{NEG_MSG}</span>}
    </>
  );
}

/* ===== Popup xác nhận (thay confirm() của trình duyệt) ===== */
type DialogReq = {
  title: string; text?: ReactNode; ok?: string; cancel?: string; danger?: boolean; tone?: 'warn' | 'info';
  reason?: { label: string; placeholder?: string; required?: boolean };
  resolve: (v: { ok: boolean; reason: string }) => void;
};
let pushDialog: ((r: DialogReq) => void) | null = null;

/** Hỏi xác nhận bằng popup có nền mờ. Trả về true khi người dùng bấm nút chính. */
export function confirmDialog(o: Omit<DialogReq, 'resolve' | 'reason'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushDialog) return resolve(window.confirm(o.title));
    pushDialog({ ...o, resolve: (v) => resolve(v.ok) });
  });
}
/** Popup có ô ghi lý do. Trả về lý do, hoặc null khi bấm hủy. */
export function reasonDialog(o: Omit<DialogReq, 'resolve'> & { reason: NonNullable<DialogReq['reason']> }): Promise<string | null> {
  return new Promise((resolve) => {
    if (!pushDialog) return resolve(window.prompt(o.title) || null);
    pushDialog({ ...o, resolve: (v) => resolve(v.ok ? v.reason : null) });
  });
}

export function DialogHost() {
  const [req, setReq] = useState<DialogReq | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    pushDialog = (r) => {
      setReason('');
      setReq(r);
    };
    return () => {
      pushDialog = null;
    };
  }, []);
  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve({ ok, reason: reason.trim() });
    setReq(null);
  };
  const needReason = !!req.reason?.required && !reason.trim();
  return (
    <>
      <div className="dialog-back" onClick={() => close(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        <span className={`dialog-ico ${req.tone === 'info' ? 'info' : ''}`}>
          <Icon name="warn" size={26} sw={2} />
        </span>
        <strong id="dlg-t" className="dialog-title">{req.title}</strong>
        {req.text && <div className="small muted" style={{ textAlign: 'center' }}>{req.text}</div>}
        {req.reason && (
          <label className="field" style={{ alignSelf: 'stretch' }}>
            <span className="small strong">{req.reason.label}</span>
            <textarea rows={2} value={reason} placeholder={req.reason.placeholder} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
        )}
        <div className="dialog-actions">
          <button className="btn secondary" onClick={() => close(false)}>{req.cancel || 'Quay lại'}</button>
          <button className={`btn ${req.danger ? 'danger' : ''}`} disabled={needReason} onClick={() => close(true)}>{req.ok || 'Đồng ý'}</button>
        </div>
      </div>
    </>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return { show: setMsg, node };
}

export function Loading({ text = 'Đang tải…' }: { text?: string }) {
  return <div className="center-load">{text}</div>;
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="circle">
        <Icon name={icon} size={28} />
      </span>
      <strong>{title}</strong>
      {text && <span className="muted small" style={{ maxWidth: 320 }}>{text}</span>}
      {children}
    </div>
  );
}

/** Hai ô Từ ngày – Đến ngày, mỗi ô nửa chiều ngang. Chữ hiện dd/MM/yyyy; ô <input type="date"> thật nằm trong suốt phía trên
 *  để bấm vào vẫn mở lịch của máy (ô date của iPhone tự giãn rộng nên không dùng để hiển thị). */
export function DateRange({ from, to, min, max, onChange }: { from: string; to: string; min?: string; max?: string; onChange: (from: string, to: string) => void }) {
  const fmt = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : 'Chọn ngày');
  const box = (label: string, value: string, lo: string | undefined, hi: string | undefined, set: (v: string) => void) => (
    <label className="datebox">
      <span className="xs strong muted">{label}</span>
      <span className="datebox-val num">{fmt(value)}</span>
      <input type="date" value={value} min={lo} max={hi} aria-label={label} onChange={(e) => e.target.value && set(e.target.value)} />
    </label>
  );
  return (
    <div className="date2">
      {box('Từ ngày', from, min, to || max, (v) => onChange(v, to))}
      {box('Đến ngày', to, from || min, max, (v) => onChange(from, v))}
    </div>
  );
}
