const db = require('../database');
const { getConfig, getGuildEffectiveConfig } = require('../config');
const { generateTransferCode } = require('../utils/helpers');

class BankService {
  /**
   * Tạo đơn nạp tiền cho user khi chọn gói
   */
  createDeposit(userId, packId, guildId = null) {
    const config = guildId ? getGuildEffectiveConfig(guildId) : getConfig();
    const packages = config.pricing?.packages || [];
    let pack = packages.find(p => p.id === packId);
    if (!pack) {
      pack = getConfig().pricing.packages.find(p => p.id === packId);
    }
    if (!pack) {
      return { success: false, message: 'Gói nạp không hợp lệ!' };
    }

    // Kiểm tra xem có chương trình sale đang chạy không (ưu tiên theo server)
    const sale = db.getGuildSaleStatus(guildId);
    let finalAmount = pack.price;
    if (sale && sale.active && sale.discountPercent) {
      finalAmount = Math.max(1000, Math.round(pack.price * (1 - sale.discountPercent / 100)));
    }

    // Tạo mã chuyển khoản độc nhất (Ví dụ: NAPGY9NTC)
    const code = generateTransferCode(config.bank?.transferPrefix || 'NAP', 6);

    const deposit = db.createDeposit({
      userId,
      packId,
      credits: pack.credits,
      amount: finalAmount,
      code,
      guildId
    });

    return {
      success: true,
      deposit,
      pack
    };
  }

  /**
   * Lấy danh sách các đơn nạp đang chờ xử lý của user
   */
  getUserPendingDeposits(userId) {
    return db.getUserPendingDeposits(userId);
  }

  /**
   * Duyệt đơn nạp (cộng credit cho user)
   */
  approveDeposit(codeOrId, adminId = 'ADMIN') {
    const dep = db.approveDeposit(codeOrId, adminId);
    if (!dep) {
      return { success: false, message: 'Đơn nạp không tồn tại hoặc đã được xử lý!' };
    }
    return { success: true, deposit: dep, user: db.getUser(dep.userId, dep.guildId) };
  }

  /**
   * Duyệt đơn nạp tự động có kiểm tra số dư thực tế của token trên shop gốc
   */
  async approveDepositWithStockCheck(codeOrId, adminId = 'AUTO_BANK_WEBHOOK', discordClient = null) {
    const config = getConfig();
    const upperCode = String(codeOrId).trim().toUpperCase();
    const pendingDeposits = db.getPendingDeposits();
    const dep = pendingDeposits.find(d => d.code === upperCode || d.id === upperCode);

    if (!dep) {
      return { success: false, message: 'Đơn nạp không tồn tại hoặc đã được xử lý trước đó!' };
    }

    const upstreamBridge = require('./upstreamBridge');
    let rootStock = null;

    // 1. Kiểm tra số dư kho gốc nếu upstream đang bật
    if (config.upstream?.enabled && upstreamBridge.isReady) {
      rootStock = await upstreamBridge.getUpstreamRealBalance();
      if (rootStock !== null) {
        db.setWholesaleBalance(rootStock);

        // NẾU KHO GỐC KHÔNG ĐỦ CREDIT CHO ĐƠN NÀY:
        if (rootStock < dep.credits) {
          console.warn(`[BANK SERVICE] ⚠️ Kho gốc chỉ còn ${rootStock} credit, không đủ cho đơn ${dep.code} (${dep.credits} credit)!`);

          // Gửi cảnh báo khẩn cấp cho Chủ Shop
          if (discordClient && config.ownerId) {
            discordClient.users.fetch(config.ownerId).then(owner => {
              owner.send({
                content:
                  `⚠️ **CẢNH BÁO KHO SỈ KHÔNG ĐỦ CREDIT!**\n` +
                  `• Khách: <@${dep.userId}>\n` +
                  `• Mã đơn nạp: \`${dep.code}\` (**${dep.credits} credit** - ${(dep.amount || 0).toLocaleString('vi-VN')}đ)\n` +
                  `• Số dư token trên shop gốc hiện tại: **${rootStock} credit** (Thiếu **${dep.credits - rootStock} credit**)\n\n` +
                  `👉 **Tiền đã vào ngân hàng**, nhưng bot tạm dừng tự cộng credit để tránh cháy kho sỉ. Vui lòng nạp thêm credit cho tài khoản token trên shop gốc, sau đó dùng lệnh \`/bank confirm code:${dep.code}\` để duyệt cho khách!`
              }).catch(() => {});
            }).catch(() => {});
          }

          // Thông báo cho khách biết tiền đã nhận, đang chờ chủ shop cấp thêm lượt
          if (discordClient) {
            discordClient.users.fetch(dep.userId).then(user => {
              user.send({
                content:
                  `ℹ️ **Hệ thống đã nhận được tiền chuyển khoản cho đơn \`${dep.code}\`!**\n` +
                  `Hiện tại kho sỉ đang được chủ shop cấp thêm lượt, credit của bạn sẽ được kích hoạt ngay sau ít phút. Cảm ơn bạn đã kiên nhẫn!`
              }).catch(() => {});
            }).catch(() => {});
          }

          return {
            success: false,
            insufficientStock: true,
            rootStock,
            requiredCredits: dep.credits,
            deposit: dep,
            message: `Kho gốc không đủ credit (${rootStock}/${dep.credits}). Đã gửi cảnh báo tới chủ shop.`
          };
        }
      }
    }

    // 2. Kho gốc đủ credit (hoặc không bật upstream): Tiến hành duyệt và cộng credit!
    const approved = db.approveDeposit(dep.code, adminId);
    if (!approved) {
      return { success: false, message: 'Lỗi khi duyệt đơn nạp trong cơ sở dữ liệu!' };
    }

    const user = db.getUser(dep.userId, dep.guildId);

    // Thông báo thành công cho khách
    if (discordClient) {
      discordClient.users.fetch(dep.userId).then(clientUser => {
        clientUser.send({
          content:
            `🎉 **Tiền nạp đơn \`${dep.code}\` đã về thành công!**\n` +
            `• Bạn nhận được: **+${dep.credits} credit** vào ví.\n` +
            `• Số dư hiện tại: **${user.balance} credit**.\n\n` +
            `Gõ \`/redeem credits\` hoặc bấm nút **Dùng credit** tại kênh hàng đợi để bắt đầu săn Nitro ngay nhé!`
        }).catch(() => {});
      }).catch(() => {});
    }

    return {
      success: true,
      deposit: dep,
      user,
      rootStock
    };
  }

  /**
   * Hủy đơn nạp
   */
  cancelDeposit(codeOrId) {
    const dep = db.rejectDeposit(codeOrId);
    if (!dep) {
      return { success: false, message: 'Đơn nạp không tồn tại hoặc đã xử lý!' };
    }
    return { success: true, deposit: dep };
  }
}

module.exports = new BankService();
