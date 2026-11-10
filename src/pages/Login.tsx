import { useEffect, useRef, useState } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { Icon } from '../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Login() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  // Màn đăng nhập nền kem: thanh trạng thái điện thoại đổi theo, rời màn thì về xám.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', '#F7F3EB');
    return () => meta?.setAttribute('content', '#F7F7F7');
  }, []);
  const [email, setEmail] = useState(localStorage.getItem('kho-baba-last-email') || '');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode() {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return setErr('Email chưa đúng định dạng.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setErr(errorText(error));
    localStorage.setItem('kho-baba-last-email', e);
    setStep('code');
    setWait(60);
    setCode('');
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function verify(token = code) {
    setErr(null);
    if (token.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
    setBusy(false);
    if (error) {
      setErr('Mã không đúng hoặc đã hết hạn. Kiểm tra email mới nhất, hoặc gửi lại mã.');
      setCode('');
    }
  }

  if (step === 'code') {
    return (
      <div className="screen">
        <header className="header">
          <button className="icon-btn" style={{ marginLeft: -8 }} aria-label="Quay lại" onClick={() => setStep('email')}>
            <Icon name="back" size={24} sw={2} />
          </button>
          <div className="titles">
            <h1>Nhập mã xác nhận</h1>
          </div>
        </header>
        <main className="main no-nav" style={{ padding: 24, gap: 18 }}>
          <p style={{ fontSize: 16 }}>
            Mã 6 số đã gửi tới <strong>{email}</strong>. Mã dùng được trong ít phút.
          </p>
          <label className="field">
            <span className="label">Mã 6 số</span>
            <input
              ref={codeRef}
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              style={{ fontSize: 28, letterSpacing: '0.5em', textAlign: 'center', fontWeight: 700, borderColor: err ? 'var(--danger)' : undefined }}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (v.length === 6) verify(v);
              }}
            />
          </label>
          {err && (
            <div className="alert danger" role="alert">
              <Icon name="warn" size={20} sw={2} />
              <span>{err}</span>
            </div>
          )}
          <button className="btn lg block" disabled={busy || code.length !== 6} onClick={() => verify()}>
            {busy ? 'Đang kiểm tra…' : 'Vào app'}
          </button>
          <div className="row between">
            <span className="muted small">Chưa nhận được mã?</span>
            <button className="btn quiet" disabled={wait > 0 || busy} onClick={sendCode}>
              {wait > 0 ? `Gửi lại sau 0:${String(wait).padStart(2, '0')}` : 'Gửi lại mã'}
            </button>
          </div>
          <div className="small muted" style={{ marginTop: 'auto', padding: 14, background: 'var(--bg-200)', borderRadius: 'var(--radius-lg)' }}>
            Không thấy email? Kiểm tra mục Spam hoặc Quảng cáo. Sai nhiều lần liên tiếp sẽ bị khóa tạm vài phút.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="screen cream">
      <main className="main no-nav" style={{ padding: '64px 24px 32px', gap: 28, background: 'var(--baba-cream)', color: 'var(--baba-ink)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <img src="/logo-baba-xanh.svg" alt="Sữa lành từ BaBa" style={{ width: 96, height: 141 }} />
          <p className="small" style={{ textAlign: 'center', color: 'var(--ink-muted)' }}>Kho BaBa · ghi bán, nấu, kho cho điểm bán</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26 }}>Đăng nhập</h1>
          <p style={{ fontSize: 16 }}>Nhập email, BaBa sẽ gửi một mã 6 số để vào app. Không cần nhớ mật khẩu.</p>
          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="ten@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendCode()}
            />
          </label>
          {err && <span className="err">{err}</span>}
          <button className="btn lg block" disabled={busy} onClick={sendCode}>
            {busy ? 'Đang gửi…' : 'Gửi mã về email'}
          </button>
        </div>
        <p className="xs" style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--ink-muted)' }}>
          Chưa được mời vào cơ sở nào? Hỏi chủ cơ sở gửi lời mời qua email này.
        </p>
      </main>
    </div>
  );
}
