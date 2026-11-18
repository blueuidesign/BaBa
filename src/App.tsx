import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './lib/app';
import { DialogHost, Loading, OfflineGate } from './components/ui';
import Login from './pages/Login';
import Outlets from './pages/Outlets';
import Home from './pages/Home';
import Order from './pages/Order';
import CookPlan from './pages/CookPlan';
import Ingredients from './pages/Ingredients';
import Batches from './pages/Batches';
import Stock from './pages/Stock';
import StockItem from './pages/StockItem';
import Purchase from './pages/Purchase';
import StockCount from './pages/StockCount';
import Bottles from './pages/Bottles';
import DayEnd from './pages/DayEnd';
import OrderDetail from './pages/OrderDetail';
import DayOrders from './pages/DayOrders';
import Assistant from './pages/Assistant';
import OrderEdit from './pages/OrderEdit';
import OrderChanges from './pages/OrderChanges';
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
import ProfitByProduct from './pages/ProfitByProduct';
import HourReport from './pages/HourReport';
import OutletModel from './pages/OutletModel';

export default function App() {
  const { session, loading, outlet, outlets, online } = useApp();
  const loc = useLocation();

  // Không có mạng thì không cho dùng (Tùng 18/11)
  if (!online) return <OfflineGate />;

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
      <Route path="/ban/da-luu" element={<Navigate to="/ban" replace />} />
      <Route path="/hoa-don" element={<DayOrders />} />
      <Route path="/nau" element={<CookPlan />} />
      <Route path="/nau/nguyen-lieu" element={<Ingredients />} />
      <Route path="/nau/me" element={<Batches />} />
      <Route path="/kho" element={<Stock />} />
      <Route path="/kho/nhap" element={<Purchase />} />
      <Route path="/kho/kiem-ke" element={<StockCount />} />
      <Route path="/kho/chai" element={<Bottles />} />
      <Route path="/kho/:id" element={<StockItem />} />
      <Route path="/cuoi-ngay" element={<DayEnd />} />
      <Route path="/doi-chieu" element={<DayEnd />} />
      <Route path="/bao-cao" element={<Revenue />} />
      <Route path="/thong-bao" element={<Notifications />} />
      <Route path="/lich-su" element={<History />} />
      <Route path="/tai-khoan" element={<Account />} />
      <Route path="/bao-cao/xuat" element={<Export />} />
      <Route path="/bao-cao/don" element={<DayOrders />} />
      <Route path="/bao-cao/hoi" element={<Assistant />} />
      <Route path="/bao-cao/lai-gop" element={<ProfitByProduct />} />
      <Route path="/bao-cao/theo-gio" element={<HourReport />} />
      <Route path="/bao-cao/mo-hinh" element={<OutletModel />} />
      <Route path="/bao-cao/don/:id" element={<OrderDetail />} />
      <Route path="/bao-cao/don/:id/sua" element={<OrderEdit />} />
      <Route path="/lich-su-don" element={<OrderChanges />} />
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
