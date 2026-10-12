const readline = require('readline');
const db = require('../src/database');
const { getConfig } = require('../src/config');
const queueService = require('../src/services/queueService');
const bankService = require('../src/services/bankService');
const sniperService = require('../src/services/sniperService');
const helpers = require('../src/utils/helpers');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = question => new Promise(resolve => rl.question(question, resolve));

async function main() {
  console.clear();
  console.log('===============================================================');
  console.log('🎮 TRÌNH GIẢ LẬP TEST BOT NITRO RANDOM QUEUE (TEST LOCAL CLI)');
  console.log('===============================================================');
  console.log('Shop:', getConfig().shop.name);
  console.log('Chế độ: Đang chạy thử nghiệm local offline');
  console.log('---------------------------------------------------------------');

  const testUser = 'user_demo_123';
  db.getUser(testUser); // init

  while (true) {
    const config = getConfig();
    const user = db.getUser(testUser);
    const activeQueue = db.getActiveQueue();

    console.log(`\n👤 [TÀI KHOẢN TEST: ${testUser}] | Số dư ví: ${user.balance} credit | Đơn chờ: ${activeQueue.length}`);
    console.log('---------------------------------------------------------------');
    console.log('1. 💵 Tạo đơn nạp tiền VietQR (Chọn gói 1 xu / 5 xu / 10 xu)');
    console.log('2. 💳 Duyệt đơn nạp tiền (Cộng credit vào ví)');
    console.log('3. 🔑 Tạo mã Key đổi credit (Đơn lẻ hoặc xuất file .txt)');
    console.log('4. 🎁 Đổi mã Key thành credit');
    console.log('5. 🎯 Vào hàng đợi săn Nitro (Nhập số lượt, token, Ưu tiên)');
    console.log('6. 📋 Xem bảng hàng đợi Nitro (/queue view)');
    console.log('7. 🚀 Giả lập săn trúng Nitro (Test bảng Live Tracker)');
    console.log('8. 🛑 Rời hàng đợi & Hoàn lại credit (/queue leave)');
    console.log('9. 📊 Xem thống kê shop săn được (/stats)');
    console.log('10. 🔗 Kiểm tra liên kết Shop gốc (/upstream status)');
    console.log('0. 🚪 Thoát');
    console.log('---------------------------------------------------------------');

    const choice = (await ask('👉 Nhập lựa chọn (0-10): ')).trim();

    if (choice === '0') {
      console.log('👋 Tạm biệt!');
      rl.close();
      process.exit(0);
    }

    if (choice === '1') {
      console.log('\n--- CÁC GÓI NẠP ---');
      config.pricing.packages.forEach((p, idx) => {
        console.log(`[${idx + 1}] ${p.label}`);
      });
      const pIdx = parseInt(await ask('Chọn gói (1, 2, 3...): '), 10) - 1;
      const selected = config.pricing.packages[pIdx];
      if (!selected) {
        console.log('❌ Lựa chọn không hợp lệ!');
        continue;
      }
      const dep = bankService.createDeposit(testUser, selected.id);
      console.log('\n✅ ĐÃ TẠO HÓA ĐƠN NẠP TIỀN THÀNH CÔNG:');
      console.log(`• Mã chuyển khoản: ${dep.deposit.code}`);
      console.log(`• Số tiền: ${helpers.formatVND(dep.deposit.amount)}`);
      console.log(`• Ngân hàng: ${config.bank.bankId} | STK: ${config.bank.accountNo} | Tên: ${config.bank.accountName}`);
      console.log(`• Link VietQR: ${helpers.getVietQRUrl(config.bank.bankId, config.bank.accountNo, config.bank.accountName, dep.deposit.amount, dep.deposit.code)}`);
    }

    if (choice === '2') {
      const code = (await ask('Nhập mã chuyển khoản (ví dụ NAP...): ')).trim();
      const res = db.confirmDeposit(code, 'TEST_ADMIN');
      if (!res) {
        console.log('❌ Mã không tồn tại!');
      } else if (res.alreadyApproved) {
        console.log('⚠️ Mã này đã duyệt trước đó!');
      } else {
        console.log(`✅ Đã duyệt thành công! Cộng +${res.deposit.credits} credit cho khách. Số dư mới: ${res.user.balance} credit.`);
      }
    }

    if (choice === '3') {
      const credits = parseInt(await ask('Số credit mỗi key: '), 10);
      const count = parseInt(await ask('Số lượng key cần tạo: '), 10);
      const keys = db.generateBatchKeys(count, credits);
      console.log(`\n🎉 Đã tạo ${count} mã key:`);
      keys.forEach(k => console.log(`• ${k.code} (${k.credits} credit)`));
    }

    if (choice === '4') {
      const input = await ask('Dán danh sách mã key (cách nhau khoảng trắng hoặc xuống dòng): ');
      const keyList = input.split(/[\s,]+/).filter(Boolean);
      const res = db.redeemBatchKeys(keyList, testUser);
      console.log(`✅ Đổi thành công: ${res.successCount} mã (+${res.successCredits} credit). Thất bại: ${res.failedCount} mã.`);
      console.log(`Số dư ví hiện tại: ${db.getUser(testUser).balance} credit.`);
    }

    if (choice === '5') {
      const turns = parseInt(await ask('Số lượt muốn mua: '), 10);
      const token = await ask('Token nhận hàng (Ví dụ OTY4MTIz...): ');
      const prioAns = (await ask('Bật chế độ Ưu tiên (tiêu gấp 3, không trừ lượt khi ra Basic)? (co/khong): ')).toLowerCase();
      const isPriority = prioAns === 'co' || prioAns === 'có' || prioAns === 'c' || prioAns === 'y';

      const res = queueService.enterQueue({
        userId: testUser,
        username: 'DemoTester',
        turns,
        token: token.trim() || 'mock_token_abcdef123456789',
        isPriority
      });

      if (!res.success) {
        console.log(`❌ ${res.message}`);
      } else {
        console.log(`✅ VÀO HÀNG ĐỢI THÀNH CÔNG!`);
        console.log(`• Mã đơn: ${res.order.id}`);
        console.log(`• Số lượt: ${res.order.initialTurns} lượt ${isPriority ? '[Ưu tiên x3]' : ''}`);
        console.log(`• Credit đã trừ: ${res.requiredCredits} credit`);
        console.log(`• Số dư ví còn lại: ${res.remainingBalance} credit`);
      }
    }

    if (choice === '6') {
      const queue = db.getActiveQueue();
      console.log('\n--- BẢNG HÀNG ĐỢI NITRO RANDOM ---');
      if (!queue.length) {
        console.log('Hiện tại hàng đợi đang trống.');
      } else {
        queue.forEach((item, idx) => {
          const icon = idx === 0 ? '🍬' : '⚙️';
          const pri = item.isPriority ? ' [Ưu tiên]' : '';
          console.log(`#${idx + 1}. \`${item.username}\`  0${item.remainingTurns} khiên ${item.shield}/10${pri} ${icon}`);
        });
      }
    }

    if (choice === '7') {
      const nitroType = (await ask('Loại Nitro (1: Basic, 2: Boost): ')) === '2' ? 'Nitro – Tháng' : 'Nitro Basic – Tháng';
      const speedMs = Math.floor(3500 + Math.random() * 1500);

      const res = await sniperService.handleClaim(null, {
        nitroType,
        speedMs,
        giftCode: 'discord.gift/demo123'
      });

      if (!res.success) {
        console.log(`❌ ${res.message}`);
      } else {
        console.log('\n🎉 THÔNG BÁO SĂN TRÚNG NITRO VỪA KÍCH HOẠT:');
        console.log(res.chatMessage);
        console.log(`Trạng thái lượt: ${res.claimResult.deductedTurn ? 'Đã trừ 1 lượt' : '⭐ KHÔNG TRỪ LƯỢT (Ưu tiên ra Basic)'}`);
        console.log(`Số lượt còn lại của đơn: ${res.claimResult.order.remainingTurns}`);
        console.log(`Khiên hiện tại: ${res.claimResult.order.shield}/10`);
      }
    }

    if (choice === '8') {
      const res = queueService.leaveQueue(testUser);
      if (!res.success) {
        console.log(`❌ ${res.message}`);
      } else {
        console.log(`✅ Đã rút ${res.count} đơn khỏi hàng đợi! Hoàn lại: +${res.totalRefund} credit. Số dư ví: ${res.newBalance} credit.`);
      }
    }

    if (choice === '9') {
      const stats = db.getStats();
      console.log('\n--- THỐNG KÊ SHOP ---');
      console.log(`Tổng cộng: ${stats.totalClaims} mã (${helpers.formatUSD(stats.totalValueUsd)} - ${helpers.formatVND(stats.totalValueVnd)})`);
      console.log(`Hôm nay: ${stats.claimsToday} mã`);
      console.log(`Nitro Basic: ${stats.basicCount} mã`);
      console.log(`Nitro Boost: ${stats.boostCount} mã`);
    }

    if (choice === '10') {
      const up = config.upstream || {};
      console.log('\n--- TRẠNG THÁI LIÊN KẾT SHOP GỐC ---');
      console.log(`• Trạng thái kích hoạt: ${up.enabled ? 'BẬT' : 'TẮT'}`);
      console.log(`• Tự động điền biểu mẫu: ${up.autoForward ? 'BẬT' : 'TẮT'}`);
      console.log(`• Số credit bên shop gốc: ${up.upstreamCredits} credit`);
      console.log(`• Server ID: ${up.guildId || 'Chưa điền'}`);
      console.log(`• Kênh Queue ID: ${up.channelId || 'Chưa điền'}`);
      console.log(`• Tin nhắn Button ID: ${up.messageId || 'Chưa điền'}`);
    }

    await ask('\n[Nhấn Enter để tiếp tục]');
  }
}

main().catch(console.error);
