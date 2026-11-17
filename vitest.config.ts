import { defineConfig } from 'vitest/config';

// Kiểm thử các hàm tính toán thuần của app. Không gọi mạng: địa chỉ và khóa Supabase ở đây là giá trị giả.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'khoa-gia-cho-kiem-thu' }
  }
});
