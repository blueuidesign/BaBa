# Quyết định 21/11/2026 · Nhân viên sửa, hủy đơn trong 7 ngày

Người chốt: Tùng (chat 21/11/2026, 07:06).

| # | Nội dung | Thay cho |
| --- | --- | --- |
| 1 | Nhân viên sửa và hủy được **mọi đơn** của cơ sở có ngày bán trong 7 ngày gần nhất (hôm nay và 6 ngày trước). Mỗi lần sửa, hủy ghi vào lịch sử (ai, lúc nào, đơn trước khi sửa, lý do) | Nhân viên chỉ hủy được đơn chính mình ghi trong 10 phút, không sửa được (0040) |
| 2 | Đổi ngày bán vẫn chỉ chủ cơ sở, quản trị. Chủ cơ sở sửa, hủy không giới hạn ngày như cũ | — |

Hệ quả: migration `0064_nhan_vien_sua_huy_7_ngay.sql`, kiểm thử `t_10_nhan_vien_sua_huy.sql`; màn Chi tiết đơn, Sửa đơn hiện nút cho nhân viên khi đơn trong 7 ngày. Lịch sử sửa, hủy vẫn chỉ chủ cơ sở xem.
