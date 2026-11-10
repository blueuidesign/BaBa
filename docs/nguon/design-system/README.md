# BaBa Design System

Bộ nhận diện dùng chung cho **Sữa lành từ BaBa** và dòng thời trang trẻ em **BABA’s Hug**. Dùng cho thiết kế in ấn, mạng xã hội, ứng dụng Kho BaBa và các phần mềm sau này.

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `brand/` | Hướng dẫn thương hiệu: sứ mệnh, giọng nói, nên và không nên |
| `tokens/` | Token thiết kế: `tokens.json` (nguồn chuẩn), `tokens.css` (biến CSS), `tailwind.colors.js` |
| `logos/baba/` | Logo BaBa: SVG màu kem (trên nền xanh), SVG màu xanh (trên nền kem), PNG hai bản nền |
| `logos/baba-hug/` | Logo BABA’s Hug `( hug )` ba bản nền và ký hiệu `( h )` |
| `typography/` | Font chữ và cách dùng |
| `components/` | `components.html`: mẫu nút, thẻ, nhãn, bảng dùng token |
| `patterns/` | Họa tiết BABA’s Hug: ngoặc ôm, chấm bi, sọc vintage (SVG lặp được) |
| `icons/` | Bộ biểu tượng nét 24 px, màu theo `currentColor` |

## Màu chính

| Tên | Hex | Dùng cho |
| --- | --- | --- |
| Xanh BaBa | `#296241` | Màu chính, nền đậm, chữ trên nền kem |
| Kem BaBa | `#F7F3EB` | Nền sáng, chữ trên nền xanh |
| Cam đất (BABA’s Hug) | `#B85F3A` | Điểm nhấn của dòng thời trang |

Tỉ lệ gợi ý cho BABA’s Hug: kem 60%, xanh 25%, cam đất 15%.

## Chữ

- **BaBa:** Quicksand 500/600/700 cho mọi cấp chữ.
- **BABA’s Hug:** Bricolage Grotesque (tiêu đề, nội dung), Fraunces nghiêng (câu thương hiệu), Caveat (viết tay, điểm nhấn).

Cỡ chữ in tối thiểu 18 px cho nội dung, 15 px cho chú thích. Xem `typography/fonts.md`.

## Cách dùng nhanh

```html
<link rel="stylesheet" href="tokens/tokens.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap">
<button style="background: var(--baba-green); color: var(--baba-cream); border-radius: var(--radius-pill); font-family: var(--font-baba)">Đặt sữa</button>
```

## Lưu ý

- Logo BaBa là vector chuẩn, không vẽ lại, không đổi màu ngoài xanh và kem.
- Logo BABA’s Hug dạng SVG dùng font web; khi gửi nhà in cần chuyển chữ thành đường nét (outline) trong phần mềm thiết kế.
- Mã CMYK trong `tokens.json` là quy đổi gần đúng, cần in thử với nhà in.
