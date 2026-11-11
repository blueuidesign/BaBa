import { useEffect, useState } from 'react';
import { useApp } from '../lib/app';
import { errorText } from '../lib/supabase';
import { disablePush, enablePush, pushState, testPush, type PushState } from '../lib/push';
import { Icon } from './ui';

/** Bật thông báo đẩy (hiện ở màn hình khóa) cho máy đang dùng. */
export default function PushCard({ compact = false }: { compact?: boolean }) {
  const { profile } = useApp();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  if (!state || (compact && state === 'on')) return null;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message && !e.code ? e.message : errorText(e) });
    } finally {
      setBusy(false);
      setState(await pushState().catch(() => 'unsupported' as PushState));
    }
  }

  return (
    <section className="card">
      <div className="row" style={{ gap: 10 }}>
        <span className="ico-box"><Icon name="bell" size={20} /></span>
        <span className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
          <strong>Thông báo trên điện thoại</strong>
          <span className="small muted">
            {state === 'on' && 'Đang bật trên máy này. Nhắc đặt hàng 6:00 và nhắc đối chiếu 21:00 hiện ở màn hình khóa.'}
            {state === 'off' && 'Bật để nhận nhắc đặt hàng, hết hạn, đối chiếu ngay ở màn hình khóa, không cần mở app.'}
            {state === 'denied' && 'Máy đang chặn thông báo của Kho BaBa. Mở Cài đặt của máy → Thông báo → Kho BaBa → Cho phép, rồi quay lại đây.'}
            {state === 'ios-browser' && 'Trên iPhone, thông báo chỉ chạy khi mở app từ màn hình chính: bấm nút Chia sẻ của Safari → "Thêm vào MH chính", rồi mở Kho BaBa từ biểu tượng mới và bật ở đây.'}
            {state === 'unsupported' && 'Trình duyệt này không nhận được thông báo đẩy. Trên iPhone cần iOS 16.4 trở lên và mở app từ màn hình chính.'}
          </span>
        </span>
      </div>
      {state === 'off' && (
        <button className="btn secondary block" disabled={busy || !profile} onClick={() => run(() => enablePush(profile!.id), 'Đã bật. Bấm "Gửi thử" để xem thông báo hiện ra.')}>
          {busy ? 'Đang bật…' : 'Bật thông báo trên máy này'}
        </button>
      )}
      {state === 'on' && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn secondary grow" disabled={busy} onClick={() => run(async () => {
            const r = await testPush();
            if (!r?.sent) throw new Error('Chưa gửi được tới máy nào. Tắt rồi bật lại thông báo trên máy này.');
          }, 'Đã gửi. Thông báo sẽ hiện trong vài giây.')}>
            Gửi thử
          </button>
          <button className="btn quiet" disabled={busy} onClick={() => run(disablePush, 'Đã tắt trên máy này.')}>Tắt</button>
        </div>
      )}
      {msg && <span className={msg.ok ? 'small' : 'err'} style={msg.ok ? { color: 'var(--ink-brand)' } : undefined}>{msg.text}</span>}
    </section>
  );
}
