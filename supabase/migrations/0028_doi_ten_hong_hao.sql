-- 0028 · Sửa tên món: "Hồng Đào" → "Hồng Hào" (Tùng xác nhận 13/11). Chỉ sửa chữ hiển thị, mã món và công thức giữ nguyên.
update public.products set name = replace(name, 'Hồng Đào', 'Hồng Hào'), short_name = replace(short_name, 'Hồng Đào', 'Hồng Hào')
 where name like '%Hồng Đào%' or short_name like '%Hồng Đào%';
-- Kiểm tra: select code, name, short_name from products where code in ('md', 'sh');
