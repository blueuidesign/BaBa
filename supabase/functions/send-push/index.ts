// Edge Function send-push: gửi thông báo đẩy (Web Push) tới điện thoại.
//
// Ba cách gọi (0: body { action: 'public_key' } trả khóa công khai VAPID cho app):
// 1. Từ DB (trigger notifications_push, qua pg_net): header x-push-secret = khóa 'push_hook_secret' trong Vault,
//    body { notification_id }. Gửi tới mọi máy của người được gán vào cơ sở đó.
// 2. Từ app (nút "Gửi thử"): header Authorization: Bearer <JWT người dùng>, body { action: 'test' }.
//    Gửi tới các máy của chính người đó.
//
// Khóa VAPID và khóa hook nằm trong Supabase Vault, đọc qua RPC fn_push_config (chỉ service_role gọi được).
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY có sẵn trong môi trường Edge Function.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

let config: Record<string, string> | null = null;
async function getConfig() {
  if (config) return config;
  let { data, error } = await admin.rpc('fn_push_config');
  if (error) throw error;
  if (!data?.vapid_public_key) {
    // Lần chạy đầu: tự sinh cặp khóa VAPID và cất vào Vault. Không ai phải chép khóa bí mật.
    const k = webpush.generateVAPIDKeys();
    const r = await admin.rpc('fn_push_init', { p_public: k.publicKey, p_private: k.privateKey });
    if (r.error) throw r.error;
    ({ data, error } = await admin.rpc('fn_push_config'));
    if (error) throw error;
  }
  config = (data || {}) as Record<string, string>;
  webpush.setVapidDetails(config.vapid_subject || 'mailto:admin@suababa.vn', config.vapid_public_key, config.vapid_private_key);
  return config;
}

type Sub = { id: string; endpoint: string; p256dh: string | null; auth: string | null };

async function sendTo(userIds: string[], payload: Record<string, unknown>) {
  if (!userIds.length) return { sent: 0, removed: 0 };
  const { data: subs, error } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id', userIds);
  if (error) throw error;
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    ((subs || []) as Sub[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh || '', auth: s.auth || '' } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: 'high' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410: máy đã gỡ app hoặc tắt thông báo, địa chỉ nhận không còn dùng được
        if (code === 404 || code === 410) dead.push(s.id);
        else console.error('push failed', code, (e as Error).message);
      }
    })
  );
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  return { sent, removed: dead.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await req.json().catch(() => ({}));
  const cfg = await getConfig();

  // 0. App lấy khóa công khai để đăng ký nhận thông báo (khóa này để lộ được)
  if (body.action === 'public_key') return json({ publicKey: cfg.vapid_public_key });

  // 1. Gọi từ DB
  const hook = req.headers.get('x-push-secret');
  if (hook) {
    if (!cfg.push_hook_secret || hook !== cfg.push_hook_secret) return json({ error: 'forbidden' }, 403);
    const { data: n, error } = await admin.from('notifications').select('id,outlet_id,title,body,link,kind').eq('id', body.notification_id).maybeSingle();
    if (error || !n) return json({ error: 'notification not found' }, 404);
    const [{ data: members }, { data: outlet }] = await Promise.all([
      admin.from('memberships').select('user_id').eq('outlet_id', n.outlet_id).eq('status', 'active').not('user_id', 'is', null),
      admin.from('outlets').select('org_id,name').eq('id', n.outlet_id).maybeSingle()
    ]);
    // Chỉ gửi cho người được gán vào cơ sở (chủ, nhân viên). Admin không tự nhận push của mọi cơ sở để khỏi bị dồn tin.
    const users = [...new Set((members || []).map((m: { user_id: string }) => m.user_id))];
    const r = await sendTo(users, { title: n.title, body: [outlet?.name, n.body].filter(Boolean).join(' · '), link: n.link || '/thong-bao', tag: n.id });
    return json(r);
  }

  // 2. Gọi từ app: gửi thử cho chính mình
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: 'Cần đăng nhập' }, 401);
  if (body.action !== 'test') return json({ error: 'unknown action' }, 400);
  const r = await sendTo([u.user.id], { title: 'Kho BaBa', body: 'Thông báo đã bật. Nhắc đặt hàng và nhắc đối chiếu sẽ hiện như thế này.', link: '/thong-bao', tag: 'test' });
  return json(r);
});
