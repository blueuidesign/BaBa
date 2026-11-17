import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { AppProvider } from './lib/app';
import { startQueueSync } from './lib/queue';
import App from './App';
import './styles.css';

registerSW({ immediate: true });
startQueueSync();

// iOS bỏ qua user-scalable=no trong thẻ viewport, nên chặn thêm cử chỉ phóng to hai ngón tay
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);
