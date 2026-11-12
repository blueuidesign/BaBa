import csv, uuid, collections
import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data', 'import') + '/'
MIG = os.path.join(ROOT, 'supabase', 'migrations') + '/'
# Chạy: python3 scripts/import/build_import_sql.py  → sinh 0019 và 0020
NS = uuid.uuid5(uuid.NAMESPACE_URL, 'https://github.com/blueuidesign/BaBa/import')
OUT = '3e1f4df8-6dcb-4593-85a4-2bef47468f42'   # Phan Văn Hớn
TUNG = '2e8b7277-123f-4b66-8475-eb01a5266e0d'
q = lambda s: "'" + str(s).replace("'", "''") + "'" if s not in (None, '') else 'null'
CAT = {'Nguyên liệu chính':'nl_chinh','Phụ liệu':'phu_lieu','Nguyên liệu khác':'nl_khac','Vật tư tiêu hao':'vat_tu',
       'Máy móc thiết bị':'dt_may','Xe, quầy, kệ, bàn':'dt_xe_quay','Dụng cụ':'dt_dung_cu','Nhận diện, in ấn':'dt_nhan_dien',
       'Khác (đầu tư)':'dt_khac','Mặt bằng':'mat_bang','Lương':'luong','Điện nước, internet':'dien_nuoc','Vệ sinh, rác':'ve_sinh',
       'Thử công thức':'thu_cong_thuc','Khác':'khac'}
REF = {'Phần I':'excel_I','Phần II':'excel_II','Phần III':'excel_III','Theo ngày':'excel_ngay'}

def exp_row(ref, row, date, item, amount, cat, ing, note):
  cid = uuid.uuid5(NS, f'{ref}:{row}')
  ing_sql = f"(select id from ingredients where code = {q(ing)} and org_id = o.org_id)" if ing else 'null'
  return (f"({q(str(cid))}::uuid, {q(date)}::date, {q(item[:120])}, {amount}, {q(cat)}, {ing_sql}, {q(note)}, {q(ref)}, {row})")

def expenses_sql(rows, label):
  vals = ',\n'.join(rows)
  return f"""-- {label}
insert into public.expenses (outlet_id, client_id, spent_on, category, amount_vnd, note, source, status, created_by,
                             category_id, item_name, ingredient_id, import_ref, import_row)
select o.id, v.cid, v.d, c.legacy_category, v.amt, v.note, 'import', 'active', '{TUNG}'::uuid,
       c.id, v.item, v.ing, v.ref, v.rn
from public.outlets o
cross join lateral (values
{vals}
) as v(cid, d, item, amt, cat, ing, note, ref, rn)
join public.expense_categories c on c.org_id = o.org_id and c.code = v.cat and c.valid_to is null
where o.id = '{OUT}'::uuid
on conflict do nothing;
"""

# ---- Excel
ex = list(csv.DictReader(open(DATA + 'BaBa_Doi_chieu_chi_phi_Excel.csv', encoding='utf-8-sig')))
erows = []
for x in ex:
  stt = int(x['STT']); loai = x['Loại']; note_extra = x['Ghi chú']
  if stt == 82: loai = 'Nguyên liệu khác'; note_extra = ''
  if stt == 69: note_extra = 'Tùng chốt 12/11: tính là chi phí'
  ing = x['Mã vật tư'].rstrip('*')
  label = f"[Excel {x['Nguồn']}]"
  sl = f" · SL gốc {x['Số lượng gốc']}" if x['Số lượng gốc'] else ''
  note = f"{label} {x['Nội dung gốc']}{sl}" + (f" · {note_extra}" if note_extra and note_extra != x['Nội dung gốc'] else '')
  d = '2026-10-01' if x['Nguồn'] != 'Theo ngày' else x['Ngày']
  erows.append(exp_row(REF[x['Nguồn']], stt, d, x['Nội dung gốc'], int(x['Số tiền (VND)']), CAT[loai], ing, note))

# ---- Knote chi phí
kc = list(csv.DictReader(open(DATA + 'BaBa_Chi_phi_Knote_03-11_11-11.csv', encoding='utf-8-sig')))
krows = []
DECIDED = {  # Tùng chốt 12/11 14:45
  'da': ('Phụ liệu', '', 'Tùng 12/11: đá xếp Phụ liệu'),
  'duong': ('Phụ liệu', 'thot_not', 'Tùng 12/11: đường thốt nốt'),
}
for x in kc:
  loai, ing, ghichu = x['Loại'], x['Mã vật tư'], x['Ghi chú']
  ten = x['Nội dung gốc'].lower()
  if 'đá' in ten: loai, ing, ghichu = DECIDED['da']
  elif 'đường' in ten: loai, ing, ghichu = DECIDED['duong']
  elif 'chai mẫu' in ten: ghichu = 'Tùng 12/11: không trùng, mua 2 lần'
  elif ten == 'nhập hàng': ghichu = 'Tùng 12/11: tạm xếp Nguyên liệu chính, chưa rõ mua gì'
  elif ten == 'mặt bằng': ghichu = 'Tùng 12/11: tạm tính là tiền thuê tháng 11'
  note = f"[Knote · {x['Loại trong Knote']}] {x['Nội dung gốc']}" + (f" · {ghichu}" if ghichu else '')
  x['Loại'] = loai
  krows.append(exp_row('knote_cp', int(x['STT']), x['Ngày'], x['Nội dung gốc'], int(x['Số tiền (VND)']), CAT[loai], ing, note))

# ---- checks
def grp_of(code): return {'nl_chinh':'nguyen_lieu','phu_lieu':'nguyen_lieu','nl_khac':'nguyen_lieu','vat_tu':'vat_tu','mat_bang':'van_hanh','luong':'van_hanh','dien_nuoc':'van_hanh','ve_sinh':'van_hanh','thu_cong_thuc':'van_hanh','khac':'van_hanh'}.get(code,'dau_tu')
def totals(rows_csv, override=None):
  t = collections.Counter()
  for x in rows_csv:
    loai = x['Loại']
    if override and override(x): loai = override(x)
    t[grp_of(CAT[loai])] += int(x['Số tiền (VND)'])
  return t
te = totals(ex, lambda x: 'Nguyên liệu khác' if x['STT'] == '82' else None)
tk = totals(kc)
by_ref = collections.Counter()
for x in ex: by_ref[REF[x['Nguồn']]] += int(x['Số tiền (VND)'])
print('excel', dict(te), sum(te.values()), dict(by_ref)); print('knote', dict(tk), sum(tk.values()))

def check_block(ref_list, expect_total, expect_n, groups, label):
  refs = ','.join(q(r) for r in ref_list)
  g = '\n'.join(f"  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='{OUT}' and e.import_ref in ({refs}) and e.status='active' and c.group_code='{k}') <> {v} then raise exception '{label}: nhóm {k} lệch'; end if;" for k, v in sorted(groups.items()))
  return f"""do $$ begin
  if (select count(*) from expenses where outlet_id='{OUT}' and import_ref in ({refs}) and status='active') <> {expect_n} then raise exception '{label}: số dòng lệch'; end if;
  if (select sum(amount_vnd) from expenses where outlet_id='{OUT}' and import_ref in ({refs}) and status='active') <> {expect_total} then raise exception '{label}: tổng tiền lệch'; end if;
{g}
end $$;
"""
refsum = '\n'.join(f"--   {k}: {v:,}".replace(',', '.') for k, v in by_ref.items())
sql19 = (f"""-- 0019 · Nhập chi phí cũ vào cơ sở Phan Văn Hớn
-- Nguồn: claude/data/BaBa_Doi_chieu_chi_phi_Excel.csv (82 dòng) và claude/data/BaBa_Chi_phi_Knote_03-11_11-11.csv (23 dòng).
-- Sinh bằng scripts/import/build_import_sql.py. client_id = uuid v5 theo nguồn + STT nên chạy lại không trùng.
-- Chỉ ghi tiền, không tạo phiếu nhập, không cộng kho. Quyết định của Tùng 12/11: Excel STT 69 là chi phí; STT 82 vào
-- Nguyên liệu khác; Knote: đá vào Phụ liệu, đường là đường thốt nốt, 2 dòng "4 chai mẫu" không trùng.
-- Tổng theo nguồn Excel:
{refsum}
""" + expenses_sql(erows, 'Excel') + expenses_sql(krows, 'Knote chi phí')
  + check_block(list(REF.values()), sum(te.values()), len(ex), te, 'Excel')
  + check_block(['knote_cp'], sum(tk.values()), len(kc), tk, 'Knote chi phí'))
open(MIG + '0019_import_chi_phi_excel_knote.sql', 'w').write(sql19)

# ---- Knote đơn hàng
kr = list(csv.DictReader(open(DATA + 'BaBa_Doanh_thu_Knote_29-10_12-11.csv', encoding='utf-8-sig')))
orders = collections.OrderedDict()
for x in kr: orders.setdefault(x['Mã đơn Knote'], []).append(x)
PAY = {'tiền mặt': 'cash', 'chuyển khoản': 'transfer'}
seq = collections.Counter()
ovals, lvals = [], []
for code, lines in sorted(orders.items(), key=lambda kv: (kv[1][0]['Ngày'], kv[1][0]['Giờ'], kv[0])):
  h = lines[0]; d = h['Ngày']; seq[d] += 1
  cid = uuid.uuid5(NS, f'knote:{code}')
  disc = int(h['Giảm giá'])
  parts = [f"Knote {code}"]
  if h['Khách'] and h['Khách'] != 'Khách lẻ': parts.append(f"khách: {h['Khách']}")
  if h['Ghi chú Knote']: parts.append(h['Ghi chú Knote'])
  if not h['Hình thức TT']: parts.append('Knote không ghi hình thức thanh toán')
  if h['Cờ']: parts.append(h['Cờ'])
  reason = f"{h['Cờ'].capitalize()} (Knote)" if disc else ''
  ovals.append(f"({q(str(cid))}::uuid, {q(d)}::date, {seq[d]}, {q(d + ' ' + h['Giờ'] + ':00+07')}::timestamptz, {int(h['Thu thực'])}, {disc}, {q(reason)}, {q(PAY.get(h['Hình thức TT']))}, {q(' · '.join(parts))}, {q(h['Khách'])}, {q(code)})")
  for i, l in enumerate(lines):
    lt = int(l['Thành tiền dòng'])
    lvals.append(f"({q(str(cid))}::uuid, {q(l['Mã món app'])}, {int(l['Số chai'])}, {int(l['Đơn giá'])}, {lt})")
  assert sum(int(l['Thành tiền dòng']) for l in lines) - disc == int(h['Thu thực']), code

byd = collections.defaultdict(lambda: [0, 0, 0])
for code, lines in orders.items():
  byd[lines[0]['Ngày']][0] += int(lines[0]['Thu thực']); byd[lines[0]['Ngày']][1] += 1
  byd[lines[0]['Ngày']][2] += sum(int(l['Số chai']) for l in lines)
tot = [sum(v[i] for v in byd.values()) for i in range(3)]
print('orders', len(orders), tot)
day_checks = '\n'.join(
  f"  if (select row(revenue_vnd, orders_count, bottles)::text from v_daily_sales where outlet_id='{OUT}' and business_date='{d}') <> row({v[0]}, {v[1]}::bigint, {v[2]})::text then raise exception 'Knote ngày {d} lệch'; end if;"
  for d, v in sorted(byd.items()))
sql20 = f"""-- 0020 · Nhập doanh thu cũ từ Knote vào cơ sở Phan Văn Hớn
-- Nguồn: claude/data/BaBa_Doanh_thu_Knote_29-10_12-11.csv: {len(orders)} đơn, {len(kr)} dòng, {tot[2]} chai, thu {tot[0]:,} đ.
-- Đơn có source='import', import_ref='knote', client_id = uuid v5 theo mã đơn Knote. Món ngừng bán (smt, lnb, lvx, lnl)
-- vẫn gắn được vì order_lines trỏ products theo id, không lọc status; màn Bán không hiện các món này.
-- Giá lấy đúng giá Knote lúc bán. Giảm giá (1 đơn, 2.000 đ) ghi ở orders.discount_vnd; total_vnd = thu thực.
-- Tùng chốt 12/11: mọi đơn có tiền đều là doanh thu, không đơn nào là đơn tặng.
-- Không tạo bản ghi nấu, không đổi tồn kho.

with v(cid, d, seq, at, total, disc, reason, pay, note, cust, code) as (values
{',\n'.join(ovals)}
)
insert into public.orders (id, outlet_id, client_id, seq_in_day, business_date, placed_at, channel, status, is_gift, total_vnd,
                           discount_vnd, discount_reason, payment_method, note, created_by, source, import_ref, customer_name)
select v.cid, '{OUT}'::uuid, v.cid, v.seq, v.d, v.at, 'counter', 'active', false, v.total, v.disc, v.reason, v.pay, v.note,
       '{TUNG}'::uuid, 'import', 'knote', v.cust
from v
on conflict do nothing;

with v(oid, pcode, qty, price, lt) as (values
{',\n'.join(lvals)}
)
insert into public.order_lines (order_id, product_id, qty, unit_price_vnd, line_total_vnd)
select v.oid, p.id, v.qty, v.price, v.lt
from v
join public.orders o on o.id = v.oid
join public.outlets ot on ot.id = o.outlet_id
join public.products p on p.org_id = ot.org_id and p.code = v.pcode
where not exists (select 1 from public.order_lines x where x.order_id = v.oid);

do $$ begin
  if (select count(*) from orders where outlet_id='{OUT}' and import_ref='knote') <> {len(orders)} then raise exception 'Knote: số đơn lệch'; end if;
  if (select count(*) from order_lines l join orders o on o.id=l.order_id where o.outlet_id='{OUT}' and o.import_ref='knote') <> {len(kr)} then raise exception 'Knote: số dòng lệch (có mã món không khớp?)'; end if;
  if (select sum(total_vnd) from orders where outlet_id='{OUT}' and import_ref='knote') <> {tot[0]} then raise exception 'Knote: tổng thu lệch'; end if;
{day_checks}
end $$;
"""
open(MIG + '0020_import_doanh_thu_knote.sql', 'w').write(sql20)
