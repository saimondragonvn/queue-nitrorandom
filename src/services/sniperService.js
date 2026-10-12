const db = require('../database');
const queueService = require('./queueService');
const { getConfig, getGuildEffectiveConfig } = require('../config');
const { buildLiveClaimTracker } = require('../utils/embeds');

class SniperService {
  /**
   * Kích hoạt xử lý 1 lượt claim Nitro
   * @param {import('discord.js').Client} client
   */
  async handleClaim(client, { orderId, nitroType = 'Nitro Basic – Tháng', speedMs = 3930, giftCode = 'discord.gift/mock' }) {
    const claimResult = queueService.processClaim({
      orderId,
      nitroType,
      speedMs,
      giftCode
    });

    if (!claimResult.success) {
      return claimResult;
    }

    const { order, claim, deductedTurn } = claimResult;
    const targetGuildId = order.guildId || null;
    const config = targetGuildId ? getGuildEffectiveConfig(targetGuildId) : getConfig();

    let targetChannelId = config.channels.claimLogChannelId || config.channels.queueChannelId;
    let targetPingRoleId = config.channels.claimPingRoleId || null;

    if (targetGuildId) {
      const guildCfg = db.getGuildConfig(targetGuildId);
      if (guildCfg.claimLogChannelId) {
        targetChannelId = guildCfg.claimLogChannelId;
      } else if (guildCfg.queueChannelId) {
        targetChannelId = guildCfg.queueChannelId;
      }
      if (guildCfg.claimPingRoleId) {
        targetPingRoleId = guildCfg.claimPingRoleId;
      }
    }

    const guildStats = targetGuildId ? db.getGuildStats(targetGuildId) : db.getStats();
    const guildQueue = db.getActiveQueue(targetGuildId);
    const nextOrder = guildQueue.find(o => o.id !== order.id) || null;

    // Kiểm tra xem tài khoản token có trong Guild này không để ping chuẩn xác (tránh hiện @Người dùng không xác định)
    let isTokenInGuild = false;
    if (client && targetGuildId && order.tokenUserId) {
      try {
        const targetGuild = client.guilds.cache.get(targetGuildId) || await client.guilds.fetch(targetGuildId).catch(() => null);
        if (targetGuild) {
          const mem = targetGuild.members.cache.get(order.tokenUserId) || await targetGuild.members.fetch(order.tokenUserId).catch(() => null);
          if (mem) isTokenInGuild = true;
        }
      } catch (e) {}
    }

    const userObj = { id: order.userId, username: order.username };
    const trackerData = {
      claim: {
        ...claim,
        currentTurn: order.completedTurns,
        completedTurns: order.completedTurns,
        totalTurns: order.initialTurns,
        initialTurns: order.initialTurns
      },
      user: userObj,
      nextOrder,
      queueList: guildQueue,
      stats: guildStats,
      pingRoleId: targetPingRoleId,
      tokenUser: {
        id: order.tokenUserId || null,
        username: order.tokenUsername || null,
        inGuild: isTokenInGuild
      }
    };

    const { chatMessage, embed } = buildLiveClaimTracker(config, trackerData);

    // Gửi thông báo vào kênh log claim của Server tương ứng kèm ping khách và ping role Claim Ping
    if (client && targetChannelId) {
      try {
        const channel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          // XÓA BẢNG (EMBED) Ở CÁC TIN NHẮN CLAIM TRƯỚC ĐÓ ĐỂ CHỈ HIỆN PHÍA SAU NGƯỜI VỪA TRÚNG
          await this.cleanPreviousClaimEmbeds(channel);

          await channel.send({
            content: chatMessage,
            embeds: [embed],
            allowedMentions: {
              parse: ['roles', 'users'],
              roles: targetPingRoleId ? [targetPingRoleId] : []
            }
          });
        }
      } catch (err) {
        console.error('[SNIPER SERVICE] Không thể gửi thông báo claim vào kênh:', err);
      }
    }

    // Gửi tin nhắn chúc mừng qua DM trực tiếp cho người dùng/reseller kèm tên @ của tài khoản token đó
    if (client && order.userId) {
      try {
        const recipient = await client.users.fetch(order.userId).catch(() => null);
        if (recipient) {
          const typeLower = (nitroType || '').toLowerCase();
          const isBasic = typeLower.includes('basic');
          const nitroEmoji = isBasic
            ? (config.shop?.nitroBasicEmoji || '<a:nitrobasic1123:1559191128509522020>')
            : (config.shop?.nitroBoostEmoji || '<a:kendallzstore:1559191135254224956>');

          const tokenAccountName = order.tokenUsername
            ? `@${order.tokenUsername}`
            : (order.tokenUserId ? `<@${order.tokenUserId}>` : 'Tài khoản của bạn');

          await recipient.send({
            content:
              `🎉 **CHÚC MỪNG BẠN VỪA SĂN ĐƯỢC NITRO THÀNH CÔNG!**\n\n` +
              `• Tài khoản nhận quà: **${tokenAccountName}**${order.tokenUserId ? ` (\`${order.tokenUserId}\`)` : ''}\n` +
              `• Phần thưởng: ${nitroEmoji} **${nitroType}**\n` +
              `• Tốc độ: **${speedMs}ms**\n` +
              `• Tiến độ đơn \`${order.id}\`: **${order.completedTurns}/${order.initialTurns} lượt** (Còn ${order.remainingTurns} lượt)\n` +
              (targetChannelId ? `• Thông báo chúc mừng trúng quà đã được đăng tại kênh: <#${targetChannelId}>\n\n` : '') +
              `*Cảm ơn bạn đã tin tưởng sử dụng dịch vụ!*`
          }).catch(() => {});
        }
      } catch (dmErr) {}
    }

    // Bắn log trúng thưởng vào kênh bảo mật của Server Owner
    try {
      const ownerLogService = require('./ownerLogService');
      ownerLogService.logOrderClaim(order, { nitroType, speedMs });
    } catch (e) {}

    return {
      success: true,
      claimResult,
      chatMessage,
      embed
    };
  }

  /**
   * Xóa bỏ bảng (embed) ở các tin nhắn claim trước đó trong kênh,
   * để bảng "Vừa săn được" chỉ xuất hiện ở tin nhắn của người vừa mới trúng!
   * @param {import('discord.js').TextBasedChannel} channel
   */
  async cleanPreviousClaimEmbeds(channel) {
    if (!channel || !channel.isTextBased()) return;
    try {
      const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
      if (messages && messages.size > 0) {
        const toClean = [];
        for (const msg of messages.values()) {
          if (msg.author?.id === channel.client?.user?.id && msg.embeds?.length > 0) {
            const isClaimEmbed = msg.embeds.some(e => {
              const t = e.title || e.data?.title || '';
              return t.includes('Vừa săn được');
            });
            if (isClaimEmbed) {
              toClean.push(msg.edit({ embeds: [] }).catch(() => {}));
            }
          }
        }
        if (toClean.length > 0) {
          await Promise.all(toClean);
        }
      }
    } catch (err) {
      console.warn('[SNIPER SERVICE] Không thể xóa bảng claim cũ:', err.message);
    }
  }

  /**
   * Kích hoạt test gửi thông báo Claim vào kênh #claims của Server (kể cả khi không có đơn trong hàng đợi)
   * @param {import('discord.js').Client} client
   */
  async handleTestClaim(client, {
    guildId,
    user,
    nitroType = 'Nitro Basic – Tháng',
    speedMs = 3850,
    currentTurn = 1,
    totalTurns = 1,
    customChannelId = null,
    customRoleId = null
  }) {
    const config = guildId ? getGuildEffectiveConfig(guildId) : getConfig();
    const guildCfg = guildId ? (db.getGuildConfig(guildId) || {}) : {};

    let targetChannelId = customChannelId || guildCfg.claimLogChannelId || config.channels.claimLogChannelId || config.channels.queueChannelId;
    let targetPingRoleId = customRoleId || guildCfg.claimPingRoleId || config.channels.claimPingRoleId || null;

    const testOrderId = `TEST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const testOrder = {
      id: testOrderId,
      userId: user.id,
      username: user.tag || user.username,
      initialTurns: totalTurns,
      completedTurns: currentTurn,
      remainingTurns: Math.max(0, totalTurns - currentTurn),
      isPriority: nitroType.includes('Boost') || nitroType.includes('Tháng (Boost)'),
      guildId
    };

    // 1. Ghi nhận claim vào database để cập nhật số liệu (Basic/Boost count & Doanh thu)
    const recordedClaim = db.recordClaim({
      orderId: testOrderId,
      userId: user.id,
      username: user.tag || user.username,
      nitroType,
      speedMs,
      giftCode: `https://discord.gift/test-${Math.random().toString(36).substring(2, 12)}`,
      deductedTurn: true,
      guildId
    });

    // 2. Kích hoạt cập nhật tin nhắn thống kê trong kênh #stats của server ngay lập tức
    try {
      const updaterService = require('./updaterService');
      updaterService.notifyStatsChanged();
    } catch (e) {}

    const guildStats = guildId ? db.getGuildStats(guildId) : db.getStats();
    const guildQueue = db.getActiveQueue(guildId);
    const nextOrder = guildQueue[0] || null;

    const trackerData = {
      claim: {
        ...recordedClaim,
        currentTurn,
        completedTurns: currentTurn,
        initialTurns: totalTurns,
        deductedTurn: true
      },
      user: { id: user.id, username: user.tag || user.username },
      nextOrder,
      queueList: guildQueue,
      stats: guildStats,
      pingRoleId: targetPingRoleId,
      tokenUser: {
        id: user.id,
        username: user.tag || user.username,
        inGuild: true
      }
    };

    const { chatMessage, embed } = buildLiveClaimTracker(config, trackerData);

    let sentChannel = null;
    let channelError = null;

    if (client && targetChannelId) {
      try {
        const channel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          // XÓA BẢNG (EMBED) Ở CÁC TIN NHẮN CLAIM TRƯỚC ĐÓ ĐỂ CHỈ HIỆN PHÍA SAU NGƯỜI VỪA TRÚNG
          await this.cleanPreviousClaimEmbeds(channel);

          sentChannel = await channel.send({
            content: chatMessage,
            embeds: [embed],
            allowedMentions: {
              parse: ['roles', 'users'],
              roles: targetPingRoleId ? [targetPingRoleId] : []
            }
          });
        } else {
          channelError = `Không tìm thấy kênh văn bản với ID ${targetChannelId}!`;
        }
      } catch (err) {
        channelError = err.message;
      }
    } else {
      channelError = 'Chưa cấu hình ID kênh thông báo săn được (claimLogChannelId)!';
    }

    // Gửi DM thử nghiệm cho người dùng
    let dmSent = false;
    if (client && user.id) {
      try {
        const recipient = await client.users.fetch(user.id).catch(() => null);
        if (recipient) {
          await recipient.send({
            content:
              `🎉 **[THỬ NGHIỆM] CHÚC MỪNG BẠN VỪA SĂN ĐƯỢC NITRO THÀNH CÔNG!**\n\n` +
              `• Phần thưởng: **${nitroType}**\n` +
              `• Tốc độ: **${speedMs}ms**\n` +
              `• Tiến độ đơn \`${testOrder.id}\`: **${currentTurn}/${totalTurns} lượt**\n` +
              (targetChannelId ? `• Thông báo chúc mừng trúng quà đã được đăng tại kênh: <#${targetChannelId}>\n\n` : '') +
              `*Đây là thông báo thử nghiệm tính năng test claim.*`
          }).catch(() => {});
          dmSent = true;
        }
      } catch (e) {}
    }

    // Gửi log vào kênh bảo mật của Server Owner
    try {
      const ownerLogService = require('./ownerLogService');
      ownerLogService.logOrderClaim(testOrder, { nitroType, speedMs });
    } catch (e) {}

    return {
      success: !channelError,
      channelError,
      targetChannelId,
      targetPingRoleId,
      chatMessage,
      embed,
      dmSent,
      testOrder
    };
  }
}

module.exports = new SniperService();
