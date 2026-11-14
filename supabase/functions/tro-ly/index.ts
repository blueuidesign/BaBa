// Edge Function tro-ly: trợ lý hỏi đáp báo cáo (chỉ đọc) cho chủ cơ sở và admin.
//
// Cách gọi từ app: supabase.functions.invoke('tro-ly', { body: { outlet_id, messages: [{ role, content }] } })
// - Chạy bằng JWT của người đang đăng nhập, nên RLS áp dụng như mọi màn báo cáo. Không dùng service_role.
// - Mô hình chỉ được gọi các công cụ ĐỌC khai báo bên dưới; không có công cụ nào ghi dữ liệu.
// - Không gửi tên khách cho mô hình.
// Khóa API: secret ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets). Không để khóa trong repo.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-sonnet-5-5';
const MAX_ROUNDS = 6;       // số lượt mô hình được gọi công cụ cho một câu hỏi
const MAX_HISTORY = 8;      // số tin nhắn gần nhất gửi kèm
const MAX_DAYS = 400;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const range = { type: 'object', properties: { tu_ngay: { type: 'string', description: 'YYYY-MM-DD' }, den_ngay: { type: 'string', description: 'YYYY-MM-DD, tính cả ngày này' } }, required: ['tu_ngay', 'den_ngay'] };
const tools = [
  { name: 'doanh_thu_theo_ngay', description: 'Doanh thu, số đơn, số phần bán (chai và cốc), số phần tặng của từng ngày trong khoảng.', input_schema: range },
  { name: 'ban_theo_mon', description: 'Số phần bán và doanh thu của từng món trong khoảng ngày, tách chai và cốc giấy.', input_schema: range },
  { name: 'thu_chi_theo_ngay', description: 'Doanh thu và chi phí theo 4 nhóm (nguyên liệu, vật tư, vận hành, đầu tư thiết bị) của từng ngày. Chi phí là tiền đã chi, KHÔNG phải giá vốn của hàng đã bán.', input_schema: range },
  { name: 'tien_mat_chuyen_khoan', description: 'Doanh thu và số đơn theo cách nhận tiền (tiền mặt, chuyển khoản, chưa ghi) trong khoảng ngày.', input_schema: range },
  { name: 'cac_khoan_chi', description: 'Danh sách từng khoản chi trong khoảng ngày (ngày, số tiền, tên món, ghi chú). Tối đa 200 dòng.', input_schema: range },
  { name: 'cac_don_trong_ngay', description: 'Danh sách đơn của một ngày: giờ, tổng tiền, giảm giá, cách nhận tiền, các món.', input_schema: { type: 'object', properties: { ngay: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['ngay'] } }
];

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nextDay = (s: string) => new Date(Date.parse(s + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

async function runTool(db: any, outlet: string, name: string, input: any) {
  if (name === 'cac_don_trong_ngay') {
    if (!isDate(input?.ngay)) return { loi: 'ngay phải có dạng YYYY-MM-DD' };
    const [{ data: orders, error }, { data: prods }] = await Promise.all([
      db.from('orders').select('seq_in_day,placed_at,total_vnd,discount_vnd,is_gift,payment_method,channel,order_lines(qty,product_id,container,unit_price_vnd)')
        .eq('outlet_id', outlet).eq('business_date', input.ngay).eq('status', 'active').order('seq_in_day').limit(300),
      db.from('products').select('id,name')
    ]);
    if (error) return { loi: error.message };
    const nm = new Map((prods || []).map((p: any) => [p.id, p.name]));
    return (orders || []).map((o: any) => ({
      so: o.seq_in_day, gio: o.placed_at, tong_vnd: o.total_vnd, giam_gia_vnd: o.discount_vnd, tang: o.is_gift,
      nhan_tien: o.payment_method || 'chua_ghi', don_bo_sung: o.channel === 'aggregate',
      mon: o.order_lines.map((l: any) => ({ ten: nm.get(l.product_id) || '?', sl: l.qty, loai: l.container, gia: l.unit_price_vnd }))
    }));
  }
  const from = input?.tu_ngay, to = input?.den_ngay;
  if (!isDate(from) || !isDate(to) || to < from) return { loi: 'tu_ngay, den_ngay phải có dạng YYYY-MM-DD và den_ngay không trước tu_ngay' };
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) return { loi: `Khoảng ngày tối đa ${MAX_DAYS} ngày` };
  const end = nextDay(to);
  if (name === 'doanh_thu_theo_ngay') {
    const { data, error } = await db.from('v_daily_sales').select('business_date,orders_count,bottles,gift_bottles,revenue_vnd').eq('outlet_id', outlet).gte('business_date', from).lt('business_date', end).order('business_date');
    return error ? { loi: error.message } : (data || []).map((r: any) => ({ ngay: r.business_date, so_don: r.orders_count, so_phan: r.bottles, phan_tang: r.gift_bottles, doanh_thu_vnd: r.revenue_vnd }));
  }
  if (name === 'ban_theo_mon') {
    const [{ data, error }, { data: prods }] = await Promise.all([
      db.from('orders').select('is_gift,order_lines(qty,product_id,container,line_total_vnd)').eq('outlet_id', outlet).eq('status', 'active').gte('business_date', from).lt('business_date', end).limit(5000),
      db.from('products').select('id,name')
    ]);
    if (error) return { loi: error.message };
    const nm = new Map((prods || []).map((p: any) => [p.id, p.name]));
    const m = new Map<string, any>();
    for (const o of data || []) for (const l of o.order_lines) {
      const r = m.get(l.product_id) || { mon: nm.get(l.product_id) || '?', chai: 0, coc: 0, doanh_thu_vnd: 0 };
      if (l.container === 'coc') r.coc += l.qty; else r.chai += l.qty;
      if (!o.is_gift) r.doanh_thu_vnd += l.line_total_vnd;
      m.set(l.product_id, r);
    }
    return { ghi_chu: 'doanh_thu_vnd theo giá niêm yết, chưa trừ giảm giá ở tổng đơn', mon: [...m.values()].sort((a, b) => b.chai + b.coc - a.chai - a.coc) };
  }
  if (name === 'thu_chi_theo_ngay') {
    const { data, error } = await db.from('v_daily_pnl_groups').select('business_date,revenue_vnd,nguyen_lieu,vat_tu,van_hanh,dau_tu,has_historical').eq('outlet_id', outlet).gte('business_date', from).lt('business_date', end).order('business_date');
    return error ? { loi: error.message } : (data || []).map((r: any) => ({ ngay: r.business_date, doanh_thu_vnd: r.revenue_vnd, chi_nguyen_lieu: r.nguyen_lieu, chi_vat_tu: r.vat_tu, chi_van_hanh: r.van_hanh, chi_dau_tu: r.dau_tu, so_lieu_cu_theo_thang: r.has_historical }));
  }
  if (name === 'tien_mat_chuyen_khoan') {
    const { data, error } = await db.from('v_daily_payments').select('payment_method,revenue_vnd,orders_count').eq('outlet_id', outlet).gte('business_date', from).lt('business_date', end);
    if (error) return { loi: error.message };
    const m: Record<string, { doanh_thu_vnd: number; so_don: number }> = {};
    for (const r of data || []) { const k = r.payment_method; m[k] = m[k] || { doanh_thu_vnd: 0, so_don: 0 }; m[k].doanh_thu_vnd += r.revenue_vnd; m[k].so_don += r.orders_count; }
    return m;
  }
  if (name === 'cac_khoan_chi') {
    const { data, error } = await db.from('expenses').select('spent_on,amount_vnd,item_name,note,category,qty').eq('outlet_id', outlet).eq('status', 'active').gte('spent_on', from).lt('spent_on', end).order('spent_on').limit(200);
    return error ? { loi: error.message } : (data || []).map((r: any) => ({ ngay: r.spent_on, so_tien_vnd: r.amount_vnd, ten: r.item_name, ghi_chu: r.note, loai: r.category, so_luong: r.qty }));
  }
  return { loi: 'Không có công cụ này' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'Trợ lý chưa được cài khóa API. Admin cần thêm secret ANTHROPIC_API_KEY cho Edge Function trên Supabase.' }, 503);
    const auth = req.headers.get('Authorization') || '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await db.auth.getUser();
    if (!u?.user) return json({ error: 'Phiên đăng nhập đã hết. Hãy đăng nhập lại.' }, 401);

    const body = await req.json().catch(() => ({}));
    const outlet = String(body.outlet_id || '');
    const { data: can } = await db.rpc('can_manage_outlet', { p_outlet: outlet });
    if (!can) return json({ error: 'Chỉ chủ cơ sở hoặc admin dùng được trợ lý báo cáo.' }, 403);
    const { data: o } = await db.from('outlets').select('name').eq('id', outlet).maybeSingle();

    const messages: any[] = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_HISTORY).map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Chưa có câu hỏi.' }, 400);

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const thu = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long' }).format(new Date());
    const system = `Bạn là trợ lý báo cáo trong app Kho BaBa (bán sữa hạt Sữa lành từ BaBa). Cơ sở đang xem: ${o?.name || ''}. Hôm nay là ${thu}, ${today} (giờ Việt Nam).
Xưng hô: xưng "mình", gọi người hỏi là "bạn". Giọng ấm, giản dị, không khách sáo.
Quy tắc về số liệu:
- Mọi con số phải lấy từ công cụ. Không ước lượng, không tự bịa. Công cụ báo lỗi hoặc không có dữ liệu thì nói rõ.
- App chưa tính giá vốn và lãi theo từng cốc. Nếu được hỏi lãi, chỉ nêu doanh thu trừ tiền đã chi trong kỳ và nói rõ đây không phải lãi thật vì tiền mua hàng chưa khớp với hàng đã bán.
- Bạn chỉ xem được dữ liệu, không ghi đơn, không sửa hay xóa gì. Câu hỏi ngoài việc bán hàng của cơ sở này thì từ chối ngắn gọn.
- "Phần" gồm cả chai và cốc giấy. Tiền viết kiểu 175.000 đ.
Cách trình bày câu trả lời, theo đúng thứ tự:
1. Một hoặc hai câu trả lời thẳng vào câu hỏi, có ngày hoặc khoảng ngày đã dùng (viết kiểu 14/11/2026), con số chính in đậm bằng **...**.
2. Dòng "### Điểm chính" rồi 2 đến 4 gạch đầu dòng ngắn (bắt đầu bằng "- "), mỗi dòng một con số đáng chú ý, số in đậm. Câu hỏi quá đơn giản, không còn gì đáng nói thêm thì bỏ mục này.
3. Dòng "### Lưu ý" rồi một đoạn ngắn, CHỈ khi có điều người đọc dễ hiểu nhầm hoặc số liệu chưa đủ (ví dụ chưa tách theo món, chưa phải lãi thật). Không có gì cần lưu ý thì bỏ hẳn mục này, đừng viết cho có.
4. Cuối cùng luôn có khối gợi ý, đúng định dạng sau, mỗi dòng một câu hỏi ngắn mà bạn trả lời được bằng công cụ đang có, 2 đến 3 câu, không đánh số:
<goi_y>
câu hỏi 1
câu hỏi 2
</goi_y>
Chỉ dùng các định dạng trên: **đậm**, "### tiêu đề", gạch đầu dòng "- ". Không dùng bảng, không dùng biểu tượng cảm xúc.`;

    let usage = { input_tokens: 0, output_tokens: 0 };
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 900, system, tools, messages })
      });
      if (!r.ok) {
        const t = await r.text();
        console.error('anthropic', r.status, t.slice(0, 500));
        const msg = r.status === 401 ? 'Khóa API không hợp lệ hoặc đã bị thu hồi.' : r.status === 429 ? 'Trợ lý đang quá tải hoặc đã hết hạn mức. Thử lại sau ít phút.' : r.status === 404 ? `Không gọi được mô hình ${MODEL}.` : 'Trợ lý đang lỗi. Thử lại sau.';
        return json({ error: msg }, 502);
      }
      const res = await r.json();
      usage.input_tokens += res.usage?.input_tokens || 0;
      usage.output_tokens += res.usage?.output_tokens || 0;
      if (res.stop_reason !== 'tool_use') {
        const raw = (res.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
        // Tách khối <goi_y> thành danh sách câu hỏi gợi ý; phần còn lại là câu trả lời
        const m = raw.match(/<goi_y>([\s\S]*?)(<\/goi_y>|$)/);
        const suggestions = m ? m[1].split('\n').map((x: string) => x.replace(/^[-\d.\s]+/, '').trim()).filter((x: string) => x && x.length <= 120).slice(0, 3) : [];
        const text = (m ? raw.slice(0, m.index) : raw).trim();
        console.log('tro-ly', JSON.stringify({ user: u.user.id, outlet, rounds: i + 1, ...usage }));
        return json({ reply: text || 'Mình chưa trả lời được câu này.', suggestions, usage });
      }
      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const c of res.content) if (c.type === 'tool_use') {
        const out = await runTool(db, outlet, c.name, c.input).catch((e) => ({ loi: String(e?.message || e) }));
        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out).slice(0, 60000) });
      }
      messages.push({ role: 'user', content: results });
    }
    return json({ reply: 'Câu hỏi này cần tra quá nhiều bước. Hãy hỏi hẹp hơn, ví dụ một khoảng ngày cụ thể.', usage });
  } catch (e) {
    console.error('tro-ly', e);
    return json({ error: 'Trợ lý gặp lỗi. Thử lại sau.' }, 500);
  }
});
