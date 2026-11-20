# Quyết định 19/11/2026 · Giảm theo tiền, đổi ngày bán

Người chốt: Tùng (chat 19/11/2026, 21:34–22:13). Thiết kế: canvas "Kho BaBa – Thiết kế app bản 1.1", hàng X (X01–X10), bản PNG ở `docs/thiet-ke/man-hinh/X*.png`.

## Đã chốt

| # | Nội dung | Thay cho |
| --- | --- | --- |
| 1 | Giảm giá có thêm **Theo tiền**: mỗi phần (mặc định 5.000 đ) hoặc một khoản cho tổng đơn. Thứ tự nút: 5% · 10% · Theo tiền. Mở Giảm giá là chọn sẵn 5.000 đ mỗi phần | Y05 (chỉ 5%, 10%) |
| 2 | Chủ cơ sở **đổi ngày bán** của đơn: một hoặc nhiều đơn một lúc, tối đa trong 7 ngày gần nhất, **không cần lý do** | — |
| 3 | Đơn chuyển ngày lấy số thứ tự mới của ngày mới, giữ giờ bán (Claude chọn, Tùng không phản đối) | — |
| 1a | **20/11:** mặc định đổi thành **10% · Tất cả phần**; thứ tự nút 10% · 5% · Theo tiền; hai hàng lựa chọn phụ kiểu viền xanh | mặc định 5.000 đ mỗi phần (19/11) |
| 4 | Sửa luôn lỗi đơn rỗng (mọi dòng số lượng 0) trong `fn_post_order` | Điểm 9.7 Thiết kế DB |

## Hệ quả

- Migration `0063_giam_theo_tien_doi_ngay_don.sql`; kiểm thử `tests/db/t_08_giam_theo_tien.sql`, `t_09_doi_ngay_don.sql`.
- User Stories B-3, B-4; Thiết kế DB mục 9.3, 9.3a, 9.5, 9.6.
- Màn: Ghi đơn (bảng Giảm giá), Sửa đơn (dòng Ngày bán, bộ chọn giảm giá), Hóa đơn (nút Chọn, đổi ngày nhiều đơn), Chi tiết đơn (nhãn giảm).

## Câu hỏi còn mở (hỏi Hà)

- Có hay dùng kiểu giảm Tổng đơn không? Nếu không, bỏ đi cho màn gọn.
- Các mức bớt hay dùng (2.000, 3.000, 5.000, 10.000) đã đúng chưa?
