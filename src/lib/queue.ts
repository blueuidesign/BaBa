import { supabase } from './supabase';

/**
 * Hàng đợi ngoại tuyến cho các lệnh ghi (bản 1 dùng cho đơn hàng).
 * Mỗi lệnh mang client_id riêng; máy chủ bỏ qua lệnh trùng, nên gửi lại bao nhiêu lần cũng an toàn.
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

const isNetworkError = (e: any) =>
  !navigator.onLine || /Failed to fetch|NetworkError|network|timeout|aborted/i.test(e?.message || '');

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
