# Quyết định 21/11/2026 · Nhân viên sửa, hủy đơn trong 7 ngày

Người chốt: Tùng (chat 21/11/2026, 07:06).

| # | Nội dung | Thay cho |
| --- | --- | --- |
| 1 | Nhân viên sửa và hủy được **mọi đơn** của cơ sở có ngày bán trong 7 ngày gần nhất (hôm nay và 6 ngày trước). Mỗi lần sửa, hủy ghi vào lịch sử (ai, lúc nào, đơn trước khi sửa, lý do) | Nhân viên chỉ hủy được đơn chính mình ghi trong 10 phút, không sửa được (0040) |
| 2 | Đổi ngày bán vẫn chỉ chủ cơ sở, quản trị. Chủ cơ sở sửa, hủy không giới hạn ngày như cũ | — |

Hệ quả: migration `0064_nhan_vien_sua_huy_7_ngay.sql`, kiểm thử `t_10_nhan_vien_sua_huy.sql`; màn Chi tiết đơn, Sửa đơn hiện nút cho nhân viên khi đơn trong 7 ngày. Lịch sử sửa, hủy vẫn chỉ chủ cơ sở xem.


## Món Buffet (cùng ngày, 10:06–10:18)

| # | Nội dung |
| --- | --- |
| 3 | Thêm món **Buffet** cuối nhóm Mầm Xanh, icon chai nhiều tầng màu. Tự chọn nguyên liệu và giá |
| 4 | Giá mặc định 30.000 đ, ±5.000 đ. Nguyên liệu: đủ các loại (chính và phụ), hay dùng nhất ở trên; nút Thêm nền xanh = 20 g, sau đó ±5 g. Không giới hạn. Bán được cốc giấy. Không đưa nguyên liệu đã chọn lên đầu |

Hệ quả: migration `0065_buffet.sql`, kiểm thử `t_11_buffet.sql`, thiết kế BF01–BF05, User Stories B-5, Thiết kế DB 9.3b.
