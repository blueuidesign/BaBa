import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './lib/app';
import { DialogHost, Loading } from './components/ui';
import Login from './pages/Login';
import Outlets from './pages/Outlets';
import Home from './pages/Home';
import Order from './pages/Order';
import OrderSaved from './pages/OrderSaved';
import CookPlan from './pages/CookPlan';
import Ingredients from './pages/Ingredients';
import Batches from './pages/Batches';
import Stock from './pages/Stock';
import StockItem from './pages/StockItem';
import Purchase from './pages/Purchase';
import StockCount from './pages/StockCount';
import Bottles from './pages/Bottles';
import DayClose from './pages/DayClose';
import OrderDetail from './pages/OrderDetail';
import DayOrders from './pages/DayOrders';
import Revenue from './pages/Revenue';
import Notifications from './pages/Notifications';
import History from './pages/History';
import Account from './pages/Account';
import Expenses from './pages/Expenses';
import Export from './pages/Export';
import Historical from './pages/Historical';
import Suppliers from './pages/Suppliers';
import Members from './pages/Members';
import AdminProducts from './pages/AdminProducts';
import AdminOverview from './pages/AdminOverview';

export default function App() {
  const { session, loading, outlet, outlets } = useApp();
  const loc = useLocation();

  if (loading) return <Loading text="Đang mở Kho BaBa…" />;
  if (!session) return <Login />;
  // Chưa chọn cơ sở (hoặc thuộc nhiều cơ sở): vào màn chọn cơ sở trước
  if (!outlet && loc.pathname !== '/co-so' && loc.pathname !== '/tai-khoan') return <Navigate to="/co-so" replace />;

  return (
    <>
    <DialogHost />
    <Routes>
      <Route path="/co-so" element={<Outlets />} />
      <Route path="/" element={<Home />} />
      <Route path="/ban" element={<Order />} />
      <Route path="/ban/da-luu" element={<OrderSaved />} />
      <Route path="/nau" element={<CookPlan />} />
      <Route path="/nau/nguyen-lieu" element={<Ingredients />} />
      <Route path="/nau/me" element={<Batches />} />
      <Route path="/kho" element={<Stock />} />
      <Route path="/kho/nhap" element={<Purchase />} />
      <Route path="/kho/kiem-ke" element={<StockCount />} />
      <Route path="/kho/chai" element={<Bottles />} />
      <Route path="/kho/:id" element={<StockItem />} />
      <Route path="/doi-chieu" element={<DayClose />} />
      <Route path="/bao-cao" element={<Revenue />} />
      <Route path="/thong-bao" element={<Notifications />} />
      <Route path="/lich-su" element={<History />} />
      <Route path="/tai-khoan" element={<Account />} />
      <Route path="/bao-cao/xuat" element={<Export />} />
      <Route path="/bao-cao/don" element={<DayOrders />} />
      <Route path="/bao-cao/don/:id" element={<OrderDetail />} />
      <Route path="/chi-phi" element={<Expenses />} />
      <Route path="/chi-phi/moi" element={<Expenses openNew />} />
      <Route path="/thang-cu" element={<Historical />} />
      <Route path="/nha-cung-cap" element={<Suppliers />} />
      <Route path="/nhan-vien" element={<Members />} />
      <Route path="/quan-tri" element={<AdminOverview />} />
      <Route path="/quan-tri/mon" element={<AdminProducts />} />
      <Route path="*" element={<Navigate to={outlets.length ? '/' : '/co-so'} replace />} />
    </Routes>
    </>
  );
}
