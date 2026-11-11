import { supabase } from './supabase';

/** Khóa công khai VAPID lấy từ Edge Function send-push (khóa bí mật chỉ nằm trong Vault của Supabase). */
async function vapidPublic(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'public_key' } });
  if (error || !data?.publicKey) throw new Error('Chưa lấy được khóa thông báo từ máy chủ. Kiểm tra mạng rồi thử lại.');
  return data.publicKey as string;
}

export type PushState = 'unsupported' | 'ios-browser' | 'denied' | 'off' | 'on';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

/** Trạng thái thông báo đẩy trên máy này. iPhone chỉ nhận được khi mở app từ biểu tượng ngoài màn hình chính. */
export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'ios-browser';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Xin quyền và đăng ký nhận thông báo đẩy. Phải gọi từ một lần bấm nút (iPhone bắt buộc). */
export async function enablePush(userId: string) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Mở Cài đặt của máy → Thông báo → Kho BaBa để bật.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await vapidPublic()) }));
  const j = sub.toJSON();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Gửi một thông báo thử tới các máy của chính mình. */
export async function testPush() {
  const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'test' } });
  if (error) throw error;
  return data as { sent: number };
}
