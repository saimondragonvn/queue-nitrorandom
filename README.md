# 🚀 NITRO RANDOM QUEUE BOT (MK SHOP CLONE)

Bot Discord quản lý hệ thống nạp credit, hàng đợi săn Nitro Random (Nitro Basic / Nitro Boost), tích hợp thanh toán VietQR tự động, quản lý ví sỉ, tạo key đổi credit, chế độ ưu tiên không trừ lượt và phân quyền chủ shop.

---

## 📌 1. Bảng lệnh hoàn chỉnh

### 👤 Cho Khách
| Lệnh | Mô tả |
| :--- | :--- |
| `/bank balance` | Xem số dư của bạn kèm hướng dẫn chi tiết và cách lấy token |
| `/bank gift <user> <amount>` | Tặng credit cho thành viên khác |
| `/redeem key [code]` | Đổi mã key thành credit (hỗ trợ dán tối đa 25 key cùng lúc) |
| `/redeem credits [turns] [token] [priority]` | Dùng credit để vào hàng đợi săn Nitro |
| `/queue view` | Xem danh sách hàng đợi hiện tại kèm lượt, khiên, chế độ ưu tiên |
| `/queue mine` | Xem các đơn đang chạy của chính bạn |
| `/queue leave` | Rút đơn và hoàn lại số credit của các lượt chưa nhận |
| `/queue position` | Xem vị trí hiện tại của đơn trong hàng đợi |
| `/queue check [order_id]` | Xem chi tiết thông tin đơn hàng (token đã che, khiên, thời gian) |
| `/newtoken <token>` | Đổi token mới cho đơn bị token chết, giữ nguyên số lượt còn lại |
| `/stats` | Xem thống kê số lượng mã Nitro shop đã săn được và tỉ lệ loại |
| `/leaderboard` | Xem bảng xếp hạng số dư credit của thành viên |

---

### 👑 Cho Chủ Shop (Quản trị viên)
| Lệnh | Mô tả |
| :--- | :--- |
| `/setup build` | **Tự động tạo danh mục, toàn bộ kênh bán hàng, role ping và gửi sẵn các bảng panel** |
| `/panel shop` | Gửi bảng nạp credit kèm menu chọn gói và nút kiểm tra đơn (Ảnh 1) |
| `/panel queue` | Gửi bảng điều khiển Nitro Random kèm 5 nút bấm tương tác (Ảnh 2) |
| `/panel stats` | Gửi bảng thống kê số lượng Nitro săn được ra kênh |
| `/bank confirm <mã NAP>` | Cộng credit cho đơn nạp khi thấy tiền về (chấp nhận cả mã quá hạn) |
| `/bank pending` | Xem danh sách đơn nạp đang chờ khách chuyển tiền |
| `/bank add <user> <amount>` | Cộng credit cho khách (tự động gửi tin nhắn riêng cho khách) |
| `/bank remove <user> <amount>` | Trừ credit của khách (tự động gửi tin nhắn riêng) |
| `/bank set <user> <amount>` | Đặt số dư credit của khách (tự động gửi tin nhắn riêng) |
| `/bank check <user>` | Xem số dư, thứ hạng và các đơn đang chạy của khách |
| `/bank transfer <from> <to> <amount>` | Chuyển credit từ khách này sang khách khác |
| `/bank supply` | Xem ví sỉ của shop còn bao nhiêu credit (chỉ xem, không nạp) |
| `/key create <credits> [code]` | Tạo 1 mã đổi credit |
| `/key bulk <credits> <count>` | Tạo hàng loạt mã đổi credit và xuất file `.txt` đính kèm |
| `/key list [status]` | Xem lại các mã chưa dùng hoặc tất cả mã trong hệ thống |
| `/queue add <user> <turns> <token> [priority]` | Thêm khách vào hàng đợi không trừ credit khách (trừ ví sỉ) |
| `/queue remove <order_id>` | Gỡ đơn **CÓ HOÀN** credit cho khách |
| `/queue delete <order_id>` | Gỡ đơn **KHÔNG HOÀN** credit (xóa thẳng) |
| `/queue entry <order_id> <add/remove> <amount>` | Cộng hoặc trừ lượt đã nhận của một đơn |
| `/orders find <id>` | Tra cứu chi tiết một đơn theo mã (kể cả đơn đã xong) |
| `/orders list [status]` | Tra sổ đơn đã lưu (tất cả, đang chờ, đang săn, hoàn thành, đã hủy) |
| `/settings pause` | Tạm nghỉ nhận đơn mới (khách không thể vào hàng đợi) |
| `/settings resume` | Mở bán lại bình thường |
| `/settings sale-start <discount_percent> <duration_minutes>` | Chạy sự kiện giảm giá sale |
| `/settings sale-extend <minutes>` | Gia hạn thêm thời gian cho đợt sale hiện tại |
| `/settings sale-next <start_time> <discount_percent> <duration>` | Hẹn giờ đợt sale kế tiếp |
| `/settings sale-stop` | Dừng đợt sale ngay lập tức |
| `/settings sale-status` | Xem tình trạng sale hiện tại |
| `/settings channel <type> <channel>` | Chuyển kênh cho hàng đợi, bảng giá, log claim hoặc vouch |
| `/settings payment <bank> <account_no> <account_name>` | Cập nhật tài khoản nhận tiền ngân hàng VietQR ngay trong Discord |
| `/settings brand <name> [banner_url] [logo_url]` | Sửa tên shop và ảnh banner ngay trong Discord |
| `/settings package-add <id> <credits> <price> <label>` | Thêm gói nạp mới |
| `/settings package-remove <id>` | Xóa gói nạp theo mã ID |
| `/upstream status` | Xem trạng thái liên kết tài khoản gốc, số credit gốc, kênh/tin nhắn đích |
| `/upstream toggle <enabled>` | Bật hoặc tắt tính năng tự động chuyển tiếp đơn sang shop gốc |
| `/upstream credits <amount>` | Cập nhật số credit bạn đang sở hữu bên shop gốc |
| `/upstream set <guild_id> <channel_id> <message_id> [claim_channel_id]` | Cài đặt thông số kênh và tin nhắn chứa bảng queue của shop gốc |
| `/hunt simulate [nitro_type] [speed_ms] [order_id]` | Giả lập săn trúng Nitro để test thông báo và bảng theo dõi (Ảnh 10, 11) |

---

## ⚙️ 2. Tùy chỉnh Giá và Nội dung

Bạn có 2 cách điều chỉnh:

### Cách 1: Chỉnh sửa trực tiếp file `config.json`
Mở file [config.json](file:///c:/Users/nganp/OneDrive/antigarvity/discord%20bot/queue-nitrorandom/config.json):
- **Tên shop & ảnh**: `shop.name`, `shop.bannerUrl`
- **Tài khoản ngân hàng VietQR**: `bank.bankId` (TCB, MB, VCB...), `bank.accountNo`, `bank.accountName`
- **Các gói nạp & giá tiền**: Sửa trong mảng `pricing.packages`:
  ```json
  {
    "id": "pack_1",
    "credits": 1,
    "price": 25000,
    "label": "Gói 1 xu - 1 xu, giá 25.000đ"
  }
  ```
- **Hệ số ưu tiên & Khiên**: `queueSettings.priorityMultiplier` (mặc định: 3), `queueSettings.maxShield` (mặc định: 10).
- **Văn bản hướng dẫn**: `content.tokenGuide`, `content.priorityGuide`, `content.vouchText`.

### Cách 2: Chỉnh sửa bằng lệnh Slash ngay trong Discord
- Cập nhật số tài khoản nhận tiền: `/settings payment bank:TCB account_no:19074798547016 account_name:NGUYEN HOANG ANH HUY`
- Cập nhật tên shop: `/settings brand name:MK SHOP`
- Thêm gói nạp: `/settings package-add id:pack_20 credits:20 price:450000 label:Gói 20 xu - 20 xu, giá 450.000đ`
- Xóa gói nạp: `/settings package-remove id:pack_1`

---

## 🛠️ 3. Hướng dẫn Cài đặt & Khởi chạy

### Bước 1: Cấu hình file `.env`
Mở file `.env` và điền:
```env
BOT_TOKEN=token_bot_cua_ban
CLIENT_ID=application_id_cua_bot
GUILD_ID=server_id_cua_ban
WEBHOOK_PORT=3000
WEBHOOK_SECRET=chuoi_bi_mat_tuy_chon
```

### Bước 2: Đăng ký lệnh Slash lên Discord
Chạy lệnh sau trong PowerShell hoặc Terminal:
```bash
npm run deploy
```

### Bước 3: Khởi động bot
```bash
npm start
```

---

## 🎯 4. Cơ chế hoạt động đặc biệt

1. **Chế độ Ưu tiên (Priority)**:
   - Tiêu gấp 3 credit cho mỗi lượt (Ví dụ: mua 2 lượt tiêu 6 credit).
   - Đổi lại: **KHÔNG BỊ TRỪ LƯỢT** khi săn ra **Nitro Basic**! Chỉ trừ lượt khi trúng **Nitro Boost** (Nitro – Tháng).
2. **Cơ chế Khiên (Shield 0/10)**:
   - Mỗi lần săn bảo vệ token, khiên tăng thêm 1 tầng (tối đa 10/10).
3. **Cơ chế Hoàn tiền (Leave Queue)**:
   - Khách có thể rút đơn bất kỳ lúc nào qua nút `Rời hàng đợi` hoặc `/queue leave`. Bot sẽ tự động tính số lượt chưa nhận và hoàn trả credit về ví.
4. **Tích hợp Webhook cho Sniper bên ngoài**:
   - Bot tích hợp sẵn Express REST API: `POST http://localhost:3000/api/claim`
   - Payload JSON:
     ```json
     {
       "secret": "chuoi_bi_mat_tuy_chon",
       "nitroType": "Nitro Basic – Tháng",
       "speedMs": 3930,
       "giftCode": "https://discord.gift/xxxxxx"
     }
     ```
   - Tự động gán cho đơn đầu tiên trong hàng đợi, trừ lượt theo đúng luật, gửi tin nhắn chúc mừng ping role và cập nhật bảng Live Tracker!

---

## 🔗 5. Cơ chế Cầu nối tự động sang Shop gốc (Upstream Queue Forwarder)

Hệ thống cho phép bạn dùng **tài khoản cá nhân có credit bên shop gốc** (ví dụ HQ Shop Queue) để làm nguồn cấp cho bot riêng của bạn:

```
[Khách hàng của bạn] ---> Bấm "Dùng credit" trên Bot của bạn (Nhập lượt, token, Boost)
                                   |
                                   v
             [Bot kiểm tra credit và trừ credit của khách]
                                   |
                                   v
    [Tài khoản User của bạn tự động kết nối vào server shop gốc]
                                   |
                                   v
  [Tự động nhấn nút "Dùng credit", mở Modal "Dùng credit vào hàng đợi" của shop gốc]
                                   |
                                   v
       [Điền tự động: Số lượt, Token của khách, Guaranteed Boost: CO]
                                   |
                                   v
      [Nộp biểu mẫu Modal Submit thành công vào server shop gốc!]
```

### Cách thiết lập kết nối:
1. Mở file `.env` và điền:
   * `UPSTREAM_USER_TOKEN`: Token tài khoản Discord của bạn (tài khoản đang có credit bên shop gốc).
   * `UPSTREAM_GUILD_ID`: ID server của shop gốc.
   * `UPSTREAM_CHANNEL_ID`: ID kênh chứa bảng queue của shop gốc.
   * `UPSTREAM_MESSAGE_ID`: ID tin nhắn có nút bấm "Dùng credit" bên shop gốc.
   * `UPSTREAM_CLAIM_CHANNEL_ID`: ID kênh log claim của shop gốc (tùy chọn, để bot bạn tự động bắt thông báo săn được).
2. Hoặc cấu hình trực tiếp trong Discord:
   * `/upstream set guild_id:<ID> channel_id:<ID> message_id:<ID> [claim_channel_id:<ID>]`
   * `/upstream credits <amount>`: Cập nhật số credit gốc bạn đang có để quản lý số dư.
   * `/upstream toggle enabled:True`: Bật tính năng chuyển tiếp tự động.
3. Khi khách nộp đơn, bot sẽ tự động điền đúng mẫu:
   * **Số lượt (1 lượt = 1 credit)**: Số lượt khách mua.
   * **Token Discord của bạn**: Token Discord của khách.
   * **Guaranteed Boost?**: Tự động điền `CO` nếu khách chọn ưu tiên, hoặc bỏ trống nếu thường.
   * Nếu shop gốc từ chối hoặc hết credit, bot bạn sẽ **tự động hoàn trả credit** lại cho khách và báo lỗi rõ ràng!

