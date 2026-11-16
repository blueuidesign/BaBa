import { useState } from 'react';
import { useApp } from '../lib/app';
import { useLoad } from '../lib/data';
import { addDays } from '../lib/period';
import { fetchNet, fetchProfit, pct } from '../lib/profit';
import { num, vnd, vndShort, vnToday } from '../lib/format';
import { BellLink, Header, Icon, Loading, MoneyInput, Nav, NumberField } from '../components/ui';
import { ReportTabs } from '../components/ReportTabs';

const CORE: [string, string][] = [['mat_bang', 'Mặt bằng'], ['luong', 'Lương'], ['dien_nuoc', 'Điện nước, internet']];

/** Mô hình một cơ sở: bỏ ra bao nhiêu, mỗi tháng tốn bao nhiêu, bán bao nhiêu chai mỗi ngày thì có lãi. Số gõ ở đây chỉ để thử, không ghi vào sổ. */
export default function OutletModel() {
  const { outlet, canManage } = useApp();
  const today = vnToday();
  const { data, error } = useLoad(async (oid) => {
    const [net, g] = await Promise.all([fetchNet(oid, `${Number(today.slice(0, 4)) - 1}-01-01`, today), fetchProfit(oid, addDays(today, -27), today)]);
    return { net, g };
  }, []);
  const [qty, setQty] = useState(20);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [days, setDays] = useState('26');
  const [price, setPrice] = useState<string | null>(null);
  const [gpp, setGpp] = useState<string | null>(null);

  if (!outlet) return null;
  const body = () => {
    if (!canManage) return <p className="small muted">Chỉ chủ cơ sở xem được mô hình này.</p>;
    if (error) return <p className="err">{error}</p>;
    if (!data) return <Loading />;
    const { net, g } = data;
    // Vận hành mỗi tháng theo loại: trung bình các tháng có ghi loại đó
    const avg = new Map<string, number>();
    net.opex_cats.forEach((c) => {
      const vals = net.months.map((m) => Number(m.opex.find((o) => o.code === c.code)?.amount || 0)).filter((x) => x > 0);
      if (vals.length) avg.set(c.code, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
    });
    const otherCodes = net.opex_cats.filter((c) => !CORE.some((k) => k[0] === c.code)).map((c) => c.code);
    const otherAvg = otherCodes.reduce((s, c) => s + (avg.get(c) || 0), 0);
    const fields: [string, string, number | null][] = [...CORE.map(([c, n]) => [c, n, avg.get(c) ?? null] as [string, string, number | null]), ['other', 'Vệ sinh, rác và khác', otherAvg || null]];
    const valOf = (c: string, base: number | null) => (edit[c] !== undefined ? (edit[c] === '' ? null : Number(edit[c])) : base);
    const missing = fields.filter(([c, , base]) => c !== 'other' && valOf(c, base) == null).map(([, n]) => n.toLowerCase());
    const opex = fields.reduce((s, [c, , base]) => s + (valOf(c, base) || 0), 0);
    const soldDays = g.by_day.filter((d) => d.parts > 0).length;
    const basePrice = g.parts ? Math.round(g.revenue / g.parts / 100) * 100 : 0;
    const baseGpp = g.parts ? Math.round((g.revenue - g.cogs) / g.parts / 100) * 100 : 0;
    const pr = price === null ? basePrice : Number(price) || 0;
    const gp = gpp === null ? baseGpp : Number(gpp) || 0;
    const nd = Number(days) || 0;
    const depr = net.invest_total / net.depr_months;
    const rev = qty * nd * pr;
    const gross = qty * nd * gp;
    const netM = gross - opex - depr;
    const cash = netM + depr;
    const be = gp > 0 && nd > 0 ? Math.ceil((opex + depr) / (gp * nd)) : null;
    const curQty = soldDays ? g.parts / soldDays : 0;
    return (
      <>
        {missing.length > 0 && (
          <div className="alert warn">
            <Icon name="warn" size={20} />
            <span>Chưa điền <strong>{missing.join(', ')}</strong>. Kết quả bên dưới đang cao hơn thật. Điền ở mục Vận hành mỗi tháng; không có khoản đó thì gõ 0.</span>
          </div>
        )}
        <section className="card">
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <span className="strong">Bán mỗi ngày</span>
            <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{qty} chai</span>
          </div>
          <input type="range" className="range" min={1} max={150} step={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} aria-label="Số chai bán mỗi ngày" />
          <p className="xs muted">Kéo để thử. {outlet.name} đang bán khoảng {num(curQty, 0)} chai mỗi ngày (4 tuần gần đây, {soldDays} ngày có bán).</p>
        </section>
        <div className="grid2">
          <section className="card" style={{ gap: 2 }}>
            <span className="small strong muted">Lãi ròng mỗi tháng</span>
            <span style={{ fontSize: 26, fontWeight: 700, color: netM < 0 ? 'var(--danger)' : 'var(--ink-brand)' }} className="num">{netM < 0 ? '− ' : ''}{vndShort(Math.abs(Math.round(netM)))}</span>
            <span className="xs muted">{be == null ? 'chưa tính được hòa vốn' : `hòa vốn từ ${be} chai/ngày`}</span>
          </section>
          <section className="card" style={{ gap: 2 }}>
            <span className="small strong muted">Thu hồi vốn</span>
            <span style={{ fontSize: 26, fontWeight: 700 }} className="num">{cash > 0 ? `${num(net.invest_total / cash, 1)} tháng` : 'Không'}</span>
            <span className="xs muted">đầu tư {vndShort(net.invest_total)}</span>
          </section>
        </div>
        <section className="card">
          <span className="h2">Kết quả mỗi tháng</span>
          <div className="pl-line"><span>Doanh thu<small>{qty} chai × {nd} ngày × {vnd(pr)}</small></span><span>{vnd(rev)}</span></div>
          <div className="pl-line"><span>Giá vốn hàng đã bán</span><span>− {vnd(rev - gross)}</span></div>
          <div className="pl-line"><span>Lãi gộp<small>{vnd(gp)} mỗi chai</small></span><span>{vnd(gross)}</span></div>
          <div className="pl-line"><span>Vận hành</span><span>− {vnd(opex)}</span></div>
          <div className="pl-line"><span>Khấu hao thiết bị</span><span>− {vnd(Math.round(depr))}</span></div>
          <div className="pl-total">
            <span>Lãi ròng<small>{pct(netM, rev)}% doanh thu</small></span>
            <span style={{ color: netM < 0 ? 'var(--danger)' : 'var(--ink-brand)' }}>{netM < 0 ? '− ' : ''}{vnd(Math.abs(Math.round(netM)))}</span>
          </div>
        </section>
        <section className="card">
          <span className="h2">Đầu tư ban đầu · {vnd(net.invest_total)}</span>
          {net.invest_by_cat.map((c) => (
            <div key={c.name} className="pl-line"><span>{c.name}</span><span>{vnd(c.amount)}</span></div>
          ))}
          <p className="xs muted">Lấy từ các khoản Đầu tư thiết bị đã ghi. Mua thêm thiết bị thì cộng thêm vào. Chia đều {net.depr_months} tháng: {vnd(Math.round(depr))} mỗi tháng.</p>
        </section>
        <section className="card">
          <span className="h2">Vận hành mỗi tháng · {vnd(opex)}</span>
          <div className="grid2">
            {fields.map(([c, n, base]) => (
              <div key={c} className="field">
                <span className="label small strong">{n}</span>
                <MoneyInput value={edit[c] !== undefined ? edit[c] : base != null ? String(base) : ''} onChange={(x) => setEdit((e) => ({ ...e, [c]: x }))} label={n} placeholder="Chưa điền" />
              </div>
            ))}
          </div>
          <p className="xs muted">Ô đã có số lấy từ trung bình các tháng đã ghi ở Chi phí vận hành. Ô chưa điền thì gõ số ước tính; không có khoản đó thì gõ 0. Số gõ ở đây chỉ dùng cho mô hình, không ghi vào sổ chi phí.</p>
        </section>
        <section className="card">
          <span className="h2">Giả định</span>
          <div className="field"><span className="label small strong">Giá bán trung bình mỗi chai</span><MoneyInput value={price === null ? String(basePrice) : price} onChange={setPrice} label="Giá bán trung bình mỗi chai" /></div>
          <div className="field"><span className="label small strong">Lãi gộp mỗi chai</span><MoneyInput value={gpp === null ? String(baseGpp) : gpp} onChange={setGpp} label="Lãi gộp mỗi chai" /></div>
          <div className="field"><span className="label small strong">Số ngày bán mỗi tháng</span><NumberField value={days} onChange={setDays} unit="ngày" label="Số ngày bán mỗi tháng" /></div>
          <p className="xs muted">Giá bán và lãi gộp lấy từ số bán thật của {outlet.name} trong 4 tuần gần đây. Mô hình giả định cơ sở mới bán cùng cơ cấu món và cùng giá vốn, chưa tính hao hụt.</p>
        </section>
      </>
    );
  };
  return (
    <div className="screen">
      <Header title="Báo cáo" sub={outlet.name} right={<BellLink />} />
      <main className="main">
        <ReportTabs active="model" staffLimited={!canManage} />
        {body()}
      </main>
      <Nav />
    </div>
  );
}
