const db = require('../database');
const { getConfig } = require('../config');

class QueueService {
  /**
   * Thêm người dùng vào hàng đợi săn Nitro
   */
  enterQueue({ userId, username, turns, token, tokenUserId = null, tokenUsername = null, isPriority, guildId, isDm }) {
    const config = getConfig();
    const turnsNum = parseInt(turns, 10);
    if (isNaN(turnsNum) || turnsNum <= 0) {
      return { success: false, message: 'Số lượt phải là số nguyên dương lớn hơn 0!' };
    }

    // 0. BẢO MẬT UPSTREAM TOKEN: MÁY CHỦ BẮT BUỘC PHẢI GÁN TÀI KHOẢN SHOP GỐC MỚI ĐƯỢC NHẬN ĐƠN
    if (guildId) {
      const guildCfg = db.getGuildConfig(guildId) || {};
      if (!guildCfg.upstreamToken) {
        return {
          success: false,
          message:
            `⚠️ **MÁY CHỦ CHƯA SẴN SÀNG NHẬN ĐƠN HÀNG!**\n\n` +
            `Quản trị viên máy chủ chưa cài đặt tài khoản sỉ (Upstream Token) kết nối với shop gốc.\n` +
            `👉 Vui lòng liên hệ Admin/Chủ shop gõ lệnh:\n` +
            `\`/upstream token token:<token_acc_gốc>\` để kích hoạt nhận đơn!`
        };
      }
    }

    // 1. GIỚI HẠN: 1 TOKEN CHỈ ĐƯỢC XUẤT HIỆN TỐI ĐA 3 LƯỢT/ĐƠN TRONG QUEUE (TRÁNH RẢI QUEUE DÀI 1 DÂY)
    const maxEntriesPerToken = config.queueSettings?.maxQueueEntriesPerToken || 3;
    const { extractUserIdFromToken } = require('../utils/helpers');
    const { maskToken, decryptToken } = require('../utils/security');
    const effectiveTokenUserId = tokenUserId || extractUserIdFromToken(token);
    const masked = maskToken(token);

    const activeQueue = db.getActiveQueue();
    const existingOrdersForToken = activeQueue.filter(o => {
      if (effectiveTokenUserId && o.tokenUserId && o.tokenUserId === effectiveTokenUserId) return true;
      if (o.tokenMasked && o.tokenMasked === masked) return true;
      try {
        if (o.token && decryptToken(o.token) === token.trim()) return true;
      } catch (e) {}
      return false;
    });

    if (existingOrdersForToken.length >= maxEntriesPerToken) {
      return {
        success: false,
        message: `⚠️ **GIỚI HẠN HÀNG ĐỢI:** Token này đã xuất hiện **${existingOrdersForToken.length}/${maxEntriesPerToken} lượt** trong hàng đợi!\n` +
                 `Vui lòng chờ các lượt hiện tại hoàn thành trước khi thêm tiếp (Quy định: 1 token chỉ được xuất hiện tối đa ${maxEntriesPerToken} lượt trong queue để tránh rải hàng dài).`
      };
    }

    const priorityMultiplier = config.queueSettings?.priorityMultiplier || 3;
    const requiredCredits = isPriority ? turnsNum * priorityMultiplier : turnsNum;

    const user = db.getUser(userId, guildId);
    if (user.balance < requiredCredits) {
      return {
        success: false,
        message: `Số dư không đủ! Cần **${requiredCredits} credit** (${turnsNum} lượt ${isPriority ? `x ${priorityMultiplier} [Ưu tiên]` : ''}), nhưng bạn chỉ có **${user.balance} credit**.`
      };
    }

    // Trừ credit
    const deducted = db.deductCredits(userId, requiredCredits, guildId);
    if (!deducted) {
      return { success: false, message: 'Không thể trừ credit. Vui lòng thử lại!' };
    }

    // Tạo đơn hàng đợi
    const order = db.createOrder({
      userId,
      username,
      token,
      tokenUserId: effectiveTokenUserId,
      tokenUsername,
      turns: turnsNum,
      isPriority: Boolean(isPriority),
      guildId,
      isDm: Boolean(isDm)
    });

    // Thông báo cho updater service cập nhật lại bảng queue realtime
    try {
      const updaterService = require('./updaterService');
      updaterService.notifyQueueChanged();
    } catch (e) {}

    // Bắn log đơn hàng mới vào kênh bảo mật của Server Owner
    try {
      const ownerLogService = require('./ownerLogService');
      ownerLogService.logOrderCreated(order);
    } catch (e) {}

    return {
      success: true,
      order,
      requiredCredits,
      remainingBalance: db.getUser(userId, guildId).balance
    };
  }

  /**
   * Rút đơn và hoàn lại credit các lượt chưa dùng
   */
  leaveQueue(userId, guildId = null) {
    const result = db.leaveQueue(userId, guildId);
    if (!result || result.count === 0) {
      return { success: false, message: 'Bạn không có đơn nào đang chờ trong hàng đợi!' };
    }

    try {
      const updaterService = require('./updaterService');
      updaterService.notifyQueueChanged();
    } catch (e) {}

    // Bắn log hủy đơn vào kênh bảo mật của Server Owner
    try {
      const ownerLogService = require('./ownerLogService');
      ownerLogService.logOrderCancelled(result.cancelledOrders?.[0] || { userId, id: 'QUEUE-LEAVE' }, result.totalRefund);
    } catch (e) {}

    const user = db.getUser(userId, guildId);
    return {
      success: true,
      count: result.count,
      totalRefund: result.totalRefund,
      newBalance: user.balance
    };
  }

  /**
   * Xử lý khi token của khách bị hỏng / đăng xuất giữa chừng
   */
  async handleDeadToken(client, orderId) {
    const config = getConfig();
    const order = db.getOrder(orderId);
    if (!order || order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      return null;
    }

    const priorityMultiplier = config.queueSettings?.priorityMultiplier || 3;
    const multiplier = order.isPriority ? priorityMultiplier : 1;
    const refundCredits = order.remainingTurns * multiplier;

    order.status = 'PAUSED_TOKEN_DEAD';
    order.pausedAt = new Date().toISOString();
    order.tempRefundedCredits = refundCredits;
    db.updateOrder(order.id, {
      status: 'PAUSED_TOKEN_DEAD',
      pausedAt: order.pausedAt,
      tempRefundedCredits: refundCredits
    });

    // Hoàn lại credit phần chưa nhận vào ví
    if (refundCredits > 0) {
      db.addCredits(order.userId, refundCredits, order.guildId);
    }

    console.log(`[QUEUE SERVICE] ⚠️ Token đơn ${order.id} bị chết! Đã tạm dừng và hoàn +${refundCredits} credit cho <@${order.userId}>.`);

    // Bắn log token chết vào kênh bảo mật của Server Owner
    try {
      const ownerLogService = require('./ownerLogService');
      ownerLogService.logTokenDead(order, refundCredits);
    } catch (e) {}

    // Gửi thông báo công khai vào kênh thông báo token die của Server
    if (client && order.guildId) {
      try {
        const guildCfg = db.getGuildConfig(order.guildId) || {};
        const deadTokenChannelId = guildCfg.deadTokenChannelId || config.channels?.deadTokenChannelId;
        if (deadTokenChannelId) {
          const deadChannel = await client.channels.fetch(deadTokenChannelId).catch(() => null);
          if (deadChannel && deadChannel.isTextBased()) {
            const { EmbedBuilder } = require('discord.js');
            const deadEmbed = new EmbedBuilder()
              .setTitle('🥀 THÔNG BÁO TOKEN DIE / ĐĂNG XUẤT')
              .setColor('#ED4245')
              .setDescription(
                `⚠️ <@${order.userId}> ơi, tài khoản token của bạn đã bị **đăng xuất / hết hạn** giữa chừng!\n` +
                `Hệ thống đã **tạm dừng đơn hàng** và **hoàn ngay credit** vào ví cho bạn.\n\n` +
                `• 👤 **Người dùng lệnh:** <@${order.userId}> (\`@${order.username}\`)\n` +
                `• 📦 **Mã đơn hàng:** \`${order.id}\`\n` +
                `• 🏷️ **Tài khoản token:** \`${order.tokenUsername || order.username}\`\n` +
                `• 🔄 **Số lượt chưa nhận:** **${order.remainingTurns} lượt**\n` +
                `• 💰 **Credit hoàn lại ví:** **+${refundCredits} credit**\n` +
                `• ⏳ **Bảo lưu thứ hạng:** Vị trí hàng đợi được bảo lưu trong **24 giờ**.\n\n` +
                `👉 **Cách tiếp tục chạy ngay tại vị trí cũ:**\n` +
                `Lấy token Discord mới (lưu ý: đóng tab, **KHÔNG bấm Đăng xuất**) rồi dùng lệnh:\n` +
                `\`/rejoin token:<token_mới>\`\n` +
                `*(Hệ thống sẽ trừ lại ${refundCredits} credit đã hoàn và tiếp tục săn tại đúng vị trí cũ của bạn!)*`
              )
              .setFooter({ text: 'Sniper Bot • Hãy đổi token sớm để không bị trôi lượt' })
              .setTimestamp();

            const isSnowflake = /^\d{17,21}$/.test(order.userId);
            await deadChannel.send({
              content: isSnowflake
                ? `⚠️ <@${order.userId}> **Token đơn hàng \`${order.id}\` của bạn đã bị die!**`
                : `⚠️ **Token đơn hàng \`${order.id}\` của @${order.username} đã bị die!**`,
              embeds: [deadEmbed],
              allowedMentions: isSnowflake ? { users: [order.userId] } : { parse: [] }
            });
          }
        }
      } catch (channelErr) {
        console.error('[QUEUE SERVICE] Lỗi gửi thông báo vào kênh deadTokenChannel:', channelErr.message);
      }
    }

    // Gửi tin nhắn DM khẩn cấp cho khách
    if (client) {
      try {
        const user = await client.users.fetch(order.userId).catch(() => null);
        if (user) {
          await user.send({
            content:
              `⚠️ **ĐƠN HÀNG SĂN NITRO BỊ TẠM DỪNG DO TOKEN HẾT HẠN!**\n\n` +
              `• Mã đơn: \`${order.id}\`\n` +
              `• Số lượt chưa nhận: **${order.remainingTurns} lượt**\n` +
              `• Đã hoàn ngay vào ví của bạn: **+${refundCredits} credit**.\n` +
              `• **Vị trí và thứ hạng của bạn được bảo lưu trong 24 giờ.**\n\n` +
              `👉 **Để tiếp tục chạy ở thứ hạng cũ:**\n` +
              `Vui lòng lấy token Discord mới (không bấm Đăng xuất sau khi lấy) và gõ lệnh:\n` +
              `\`/rejoin token:<token_mới>\`\n` +
              `*(Hệ thống sẽ trừ lại ${refundCredits} credit đã hoàn và tiếp tục săn tại đúng vị trí cũ).*`
          });
        }
      } catch (err) {
        console.error('[QUEUE SERVICE] Không thể gửi DM thông báo token chết:', err);
      }
    }

    try {
      const updaterService = require('./updaterService');
      updaterService.notifyQueueChanged();
    } catch (e) {}

    return { order, refundCredits };
  }

  /**
   * Cập nhật token mới cho đơn bị token chết (/newtoken)
   */
  async updateDeadToken(client, userId, newToken) {
    const { checkDiscordTokenAlive } = require('../utils/helpers');
    const upstreamBridge = require('./upstreamBridge');
    const config = getConfig();

    // 1. Kiểm tra tính hợp lệ của token mới
    const tokenCheck = await checkDiscordTokenAlive(newToken);
    if (!tokenCheck.alive) {
      return {
        success: false,
        message: `Token mới không hợp lệ hoặc đã chết (${tokenCheck.message || 'Lỗi xác thực'}). Vui lòng lấy lại token mà KHÔNG bấm Đăng xuất!`
      };
    }

    // 2. Tìm các đơn bị tạm dừng hoặc đang chờ của khách
    const pausedOrders = db.getUserOrders(userId).filter(
      o => o.status === 'PAUSED_TOKEN_DEAD' || o.status === 'WAITING'
    );

    if (!pausedOrders.length) {
      return {
        success: false,
        message: 'Bạn không có đơn hàng đợi nào đang bị tạm dừng do token chết!'
      };
    }

    const order = pausedOrders[0];
    const refundCredits = order.tempRefundedCredits || 0;
    const userWallet = db.getUser(userId, order.guildId);

    // 3. Nếu trước đó đã hoàn credit cho khách, kiểm tra xem khách có đủ credit để kích hoạt lại không
    if (refundCredits > 0) {
      if (userWallet.balance < refundCredits) {
        return {
          success: false,
          message: `Số dư ví không đủ để kích hoạt lại đơn! Cần **${refundCredits} credit** (số credit đã tạm hoàn trước đó), nhưng bạn chỉ có **${userWallet.balance} credit**.`
        };
      }
      db.deductCredits(userId, refundCredits, order.guildId);
    }

    // 4. Cập nhật lại token mới và mở lại trạng thái đơn
    order.token = newToken;
    order.status = 'WAITING';
    order.tempRefundedCredits = 0;
    db.updateOrder(order.id, {
      token: newToken,
      status: 'WAITING',
      tempRefundedCredits: 0
    });

    // 5. Nếu có bật Upstream Bridge, gửi lại đơn sang shop gốc
    if (config.upstream?.enabled && config.upstream?.autoForward) {
      upstreamBridge.submitToUpstreamQueue({
        turns: order.remainingTurns,
        token: newToken,
        isPriority: order.isPriority,
        guildId: order.guildId
      }).catch(err => {
        console.error('[QUEUE SERVICE] Lỗi gửi lại đơn sang shop gốc khi đổi token:', err);
      });
    }

    try {
      const updaterService = require('./updaterService');
      updaterService.notifyQueueChanged();
    } catch (e) {}

    return {
      success: true,
      message:
        `Đã đổi token mới thành công cho đơn \`${order.id}\`!\n` +
        `• Giữ nguyên thứ hạng trong hàng đợi!\n` +
        `• Số lượt tiếp tục săn: **${order.remainingTurns} lượt** ${order.isPriority ? '[Ưu tiên]' : ''}.\n` +
        (refundCredits > 0 ? `• Đã trừ lại: **${refundCredits} credit** từ ví.` : '')
    };
  }

  /**
   * Quét tự động kiểm tra sức khỏe token của các đơn đang xếp hàng
   */
  async checkQueueTokensHealth(client) {
    const { checkDiscordTokenAlive } = require('../utils/helpers');
    const queue = db.getActiveQueue();
    // Quét 5 đơn đầu tiên trong hàng đợi
    for (const order of queue.slice(0, 5)) {
      if (!order.token) continue;
      const res = await checkDiscordTokenAlive(order.token);
      if (!res.alive) {
        console.log(`[HEALTH CHECK] Phát hiện token đơn ${order.id} đã chết! Bắt đầu xử lý tạm dừng...`);
        await this.handleDeadToken(client, order.id);
      }
    }
  }

  /**
   * Lấy đơn hàng đầu tiên đang chờ xử lý
   */
  getNextOrder() {
    const queue = db.getActiveQueue();
    return queue.length > 0 ? queue[0] : null;
  }

  /**
   * Xử lý khi đơn hàng nhận/săn được 1 gói Nitro
   */
  processClaim({ orderId, nitroType, speedMs, giftCode }) {
    const config = getConfig();
    let order = orderId ? db.getOrder(orderId) : this.getNextOrder();

    if (!order) {
      return { success: false, message: 'Không tìm thấy đơn hàng trong hàng đợi để trao quà!' };
    }

    const isBasic = nitroType.toLowerCase().includes('basic');
    const isPriority = order.isPriority;
    const maxShield = config.queueSettings?.maxShield || 10;

    // Quy tắc ưu tiên:
    // Chế độ Ưu tiên tiêu 3 credit cho mỗi lượt. Đổi lại, đơn KHÔNG BỊ TRỪ LƯỢT khi ra Nitro Basic.
    let deductedTurn = true;
    if (isPriority && isBasic && config.queueSettings?.priorityNoDeductOnBasic) {
      deductedTurn = false;
    }

    if (deductedTurn) {
      order.remainingTurns = Math.max(0, order.remainingTurns - 1);
      order.completedTurns = (order.completedTurns || 0) + 1;
    }

    // Tăng khiên bảo vệ (khiên x/10)
    let newShield = (order.shield || 0) + 1;
    if (newShield > maxShield) newShield = maxShield;
    order.shield = newShield;

    // Nếu hết lượt thì hoàn thành đơn, còn lượt thì quay lại vị trí cuối hàng (Round-robin)
    if (order.remainingTurns <= 0) {
      order.status = 'COMPLETED';
    } else {
      order.status = 'WAITING';
      order.enteredAt = new Date().toISOString();
    }

    db.updateOrder(order.id, {
      remainingTurns: order.remainingTurns,
      completedTurns: order.completedTurns,
      shield: order.shield,
      status: order.status,
      enteredAt: order.enteredAt
    });

    // Ghi nhận claim vào DB
    const claim = db.recordClaim({
      orderId: order.id,
      userId: order.userId,
      username: order.username,
      nitroType,
      speedMs: speedMs || 3500,
      giftCode,
      deductedTurn,
      guildId: order.guildId
    });

    try {
      const updaterService = require('./updaterService');
      updaterService.notifyQueueChanged();
      updaterService.notifyStatsChanged();
    } catch (e) {}

    return {
      success: true,
      order,
      claim,
      deductedTurn,
      isCompleted: order.status === 'COMPLETED'
    };
  }
}

module.exports = new QueueService();
