import { supabase } from './supabase';

/**
 * Hàng đợi gửi lại cho lệnh ghi đơn.
 * Từ 18/11 app chặn hẳn khi mất mạng (màn Mất mạng), nên hàng đợi chỉ còn giữ đơn đang gửi dở
 * đúng lúc rớt mạng, để có mạng lại thì tự gửi tiếp. Mỗi lệnh mang client_id riêng; máy chủ bỏ qua
 * lệnh trùng, nên gửi lại bao nhiêu lần cũng an toàn.
 */
export type QueuedCall = {
  id: string; // = client_id
  fn: string;
  payload: Record<string, any>;
  createdAt: string;
  outletId: string;
  summary: string;
  lastError?: string;
  rejected?: boolean; // máy chủ từ chối hẳn (không phải lỗi mạng): giữ lại để người dùng xem
};

const KEY = 'kho-baba-queue';
type Listener = (items: QueuedCall[]) => void;
const listeners = new Set<Listener>();

export function readQueue(): QueuedCall[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedCall[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items));
}

export function subscribeQueue(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function enqueue(call: QueuedCall) {
  writeQueue([...readQueue().filter((c) => c.id !== call.id), call]);
}

export function removeFromQueue(id: string) {
  writeQueue(readQueue().filter((c) => c.id !== id));
}

/** Báo cho app biết vừa gặp lỗi mạng, để app kiểm tra lại và hiện màn Mất mạng nếu đúng là mất. */
export const NET_FAIL_EVENT = 'kho-baba-net-fail';
const isNetworkError = (e: any) => {
  const yes = !navigator.onLine || /Failed to fetch|NetworkError|network|timeout|aborted/i.test(e?.message || '');
  if (yes) window.dispatchEvent(new Event(NET_FAIL_EVENT));
  return yes;
};

/** Gọi thử máy chủ (tối đa 5 giây). Trả lời được, kể cả lỗi, nghĩa là có mạng. */
export async function pingServer(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Gọi RPC; nếu lỗi mạng thì xếp hàng và trả về { queued: true }. */
export async function callOrQueue(call: QueuedCall, timeoutMs = 10000): Promise<{ data?: any; queued?: boolean }> {
  if (!navigator.onLine) {
    enqueue(call);
    return { queued: true };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const { data, error } = await supabase.rpc(call.fn, { p: call.payload }).abortSignal(ctrl.signal);
    if (error) {
      if (isNetworkError(error)) {
        enqueue(call);
        return { queued: true };
      }
      throw error;
    }
    return { data };
  } catch (e: any) {
    if (e?.name === 'AbortError' || isNetworkError(e)) {
      const err = new Error('timeout') as any;
      err.timeout = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

let flushing = false;
/** Gửi lần lượt theo thứ tự; dừng khi gặp lỗi mạng. */
export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (const call of readQueue()) {
      if (call.rejected) continue;
      const { error } = await supabase.rpc(call.fn, { p: call.payload });
      if (!error) {
        removeFromQueue(call.id);
        continue;
      }
      if (isNetworkError(error)) break;
      writeQueue(readQueue().map((c) => (c.id === call.id ? { ...c, rejected: true, lastError: error.message } : c)));
    }
  } finally {
    flushing = false;
  }
}

export function startQueueSync() {
  window.addEventListener('online', () => flushQueue());
  setInterval(() => flushQueue(), 30000);
  flushQueue();
}
