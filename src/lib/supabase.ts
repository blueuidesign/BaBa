import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  // Báo rõ khi quên khai báo biến môi trường trên Vercel
  console.error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'kho-baba-auth' }
});

/** Đổi lỗi Supabase/Postgres thành câu tiếng Việt cho người dùng. */
export function errorText(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  if (!e) return 'Có lỗi không rõ, thử lại sau.';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Mất mạng. Kiểm tra kết nối rồi thử lại.';
  const msg = e.message || '';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  if (/Token has expired|invalid/i.test(msg) && /otp|token/i.test(msg)) return 'Mã không đúng hoặc đã hết hạn.';
  if (/rate limit|security purposes/i.test(msg)) return 'Bạn thao tác quá nhanh. Đợi một chút rồi thử lại.';
  if (e.code === '42501') return msg || 'Bạn không có quyền làm việc này.';
  // Lỗi do hàm fn_* ném ra đã là tiếng Việt
  return msg || 'Có lỗi không rõ, thử lại sau.';
}
