const {
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  OverwriteType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../database');
const { getConfig, saveConfig } = require('../config');
const { maskToken } = require('../utils/security');

class OwnerLogService {
  constructor() {
    this.client = null;
  }

  /**
   * Khởi tạo service với Discord Client
   * @param {import('discord.js').Client} client 
   */
  initialize(client) {
    this.client = client;
    console.log('[OWNER LOG SERVICE] 🛡️ Đã sẵn sàng hệ thống nhật ký & thông báo dành riêng cho Server Owner!');
  }

  /**
   * Đảm bảo kênh owner-logs riêng tư đã tồn tại trên guild
   * @param {import('discord.js').Guild} guild 
   */
  async ensureOwnerLogChannel(guild) {
    if (!guild) return null;

    const guildCfg = db.getGuildConfig(guild.id) || {};
    const config = getConfig();

    // 1. Kiểm tra kênh theo ID đã lưu
    if (guildCfg.ownerLogChannelId) {
      const existing = await guild.channels.fetch(guildCfg.ownerLogChannelId).catch(() => null);
      if (existing) return existing;
    }

    if (config.channels?.ownerLogChannelId) {
      const existing = await guild.channels.fetch(config.channels.ownerLogChannelId).catch(() => null);
      if (existing) {
        db.setGuildConfig(guild.id, { ownerLogChannelId: existing.id });
        return existing;
      }
    }

    // 2. Tìm kênh theo tên nếu đã tạo trước đó
    const foundByName = guild.channels.cache.find(c => 
      c.type === ChannelType.GuildText && 
      (c.name.includes('owner-logs') || c.name.includes('owner-log') || c.name.includes('quan-tri-logs'))
    );
    if (foundByName) {
      db.setGuildConfig(guild.id, { ownerLogChannelId: foundByName.id });
      return foundByName;
    }

    // 3. Nếu chưa có -> Tự động tạo kênh riêng tư (Private Channel)
    try {
      const parentCategory = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        (c.name.includes('Shop') || c.name.includes('Hướng Dẫn') || c.name.includes('Quản Trị'))
      );

      const channel = await guild.channels.create({
        name: '🔒-.-owner-logs-.-▨',
        type: ChannelType.GuildText,
        parent: parentCategory?.id || null,
        topic: 'Kênh nhật ký bảo mật dành riêng cho Server Owner: Đơn hàng, biến động credit, lỗi shop gốc',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionsBitField.Flags.ViewChannel] // Tuyệt đối ẩn với mọi thành viên
          },
          {
            id: guild.ownerId,
            type: OverwriteType.Member,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.SendMessages
            ] // Owner server được toàn quyền xem
          },
          {
            id: guild.members.me.id,
            type: OverwriteType.Member,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles
            ]
          }
        ]
      });

      // Lưu lại ID kênh
      db.setGuildConfig(guild.id, { ownerLogChannelId: channel.id });
      config.channels.ownerLogChannelId = channel.id;
      saveConfig(config);

      // Gửi tin nhắn khởi tạo hướng dẫn kênh
      const btnUpstream = new ButtonBuilder()
        .setCustomId('btn_owner_cfg_upstream')
        .setLabel('🔗 Cài Token Shop Gốc')
        .setStyle(ButtonStyle.Primary);

      const btnProfile = new ButtonBuilder()
        .setCustomId('btn_owner_cfg_profile')
        .setLabel('🎨 Đổi Tên Shop & Bảng Giá')
        .setStyle(ButtonStyle.Secondary);

      const btnCreateKey = new ButtonBuilder()
        .setCustomId('btn_owner_create_key')
        .setLabel('🔑 Tạo Key Bán Khách')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(btnUpstream, btnProfile, btnCreateKey);

      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🔒 KÊNH NHẬT KÝ QUẢN TRỊ DÀNH RIÊNG CHO SERVER OWNER')
        .setColor('#5865F2')
        .setDescription(
          `Chào mừng **Server Owner**! Đây là kênh riêng tư chỉ duy nhất bạn và bot có quyền truy cập.\n\n` +
          `**Kênh này tự động cập nhật trực tiếp theo thời gian thực:**\n` +
          `• 🛒 **Tình trạng đơn hàng:** Khi khách đặt đơn mới, rút đơn, hoàn thành đơn.\n` +
          `• ⚠️ **Sự cố token & hoàn tiền:** Khi token của khách bị chết, tự động hoàn credit vào ví.\n` +
          `• 🎁 **Nhật ký Credit:** Ai tặng credit cho ai (\`/bank gift\`), ai nạp key, nạp tiền VietQR.\n` +
          `• 🚨 **Cảnh báo Shop Gốc:** Lỗi kho sỉ hết credit, bot gốc từ chối hoặc được shop gốc tặng credit.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👑 **CẨM NANG & THAO TÁC QUẢN TRỊ DÀNH CHO OWNER:**\n` +
          `• Gõ lệnh \`/owner help\` để xem cẩm nang quản trị toàn diện từ A-Z bất cứ lúc nào.\n` +
          `• Gõ lệnh \`/owner status\` để kiểm tra hạn bản quyền, token shop gốc, kênh và số dư.\n` +
          `• Bấm nhanh các nút dưới đây để thiết lập ngay mà không cần nhớ cú pháp lệnh:`
        )
        .setFooter({ text: `File lưu trữ riêng biệt của server này: data/guilds/${guild.id}.json` })
        .setTimestamp();

      await channel.send({ embeds: [welcomeEmbed], components: [row] });
      return channel;
    } catch (err) {
      console.error('[OWNER LOG SERVICE] Lỗi khi tạo kênh owner-logs:', err);
      return null;
    }
  }

  /**
   * Lấy danh sách kênh nhận log (theo guildId hoặc tất cả guild active)
   * @param {string|null} guildId 
   */
  async getTargetChannels(guildId = null) {
    if (!this.client) return [];

    const channels = [];

    if (guildId) {
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        const ch = await this.ensureOwnerLogChannel(guild);
        if (ch) channels.push(ch);
      }
    } else {
      // Gửi tới tất cả các guild bot đang tham gia
      for (const [, guild] of this.client.guilds.cache) {
        const ch = await this.ensureOwnerLogChannel(guild);
        if (ch) channels.push(ch);
      }
    }

    return channels;
  }

  /**
   * Bắn log tới các kênh của Owner
   * @param {string|null} guildId 
   * @param {import('discord.js').EmbedBuilder} embed 
   */
  async sendLog(guildId, embed) {
    try {
      const channels = await this.getTargetChannels(guildId);
      for (const ch of channels) {
        await ch.send({ embeds: [embed] }).catch(err => {
          console.error(`[OWNER LOG SERVICE] Không thể gửi log tới kênh ${ch.id}:`, err.message);
        });
      }
    } catch (err) {
      console.error('[OWNER LOG SERVICE] Lỗi sendLog:', err);
    }
  }

  /**
   * 1. Log khi khách tạo đơn hàng mới
   */
  async logOrderCreated(order) {
    if (!order) return;
    const embed = new EmbedBuilder()
      .setTitle('🛒 [ĐƠN HÀNG MỚI] Khách vừa tham gia Hàng Đợi')
      .setColor('#5865F2')
      .addFields(
        { name: 'Khách hàng', value: `<@${order.userId}> (\`${order.username || order.userId}\`)`, inline: true },
        { name: 'Mã đơn', value: `\`${order.id}\``, inline: true },
        { name: 'Số lượt chạy', value: `**${order.initialTurns} lượt**`, inline: true },
        { name: 'Chế độ săn', value: order.isPriority ? '⚡ **Ưu tiên** (3 xu/lượt - Giữ lượt khi ra Basic)' : '🎯 **Thường** (1 xu/lượt)', inline: true },
        { name: 'Token (bảo mật)', value: `\`${order.tokenMasked || maskToken(order.token)}\``, inline: true },
        { name: 'Trạng thái', value: '⏳ **Đang xếp hàng chờ đến lượt**', inline: true }
      )
      .setFooter({ text: `Server: ${order.guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(order.guildId, embed);
  }

  /**
   * 2. Log khi đơn hàng trúng Nitro (Claim)
   */
  async logOrderClaim(order, claimData = {}) {
    if (!order) return;
    const isCompleted = (order.remainingTurns <= 0);
    const embed = new EmbedBuilder()
      .setTitle(isCompleted ? '🏆 [HOÀN TẤT ĐƠN] Khách đã nhận đủ quà!' : '🎉 [SĂN TRÚNG] Khách vừa claim trúng Nitro!')
      .setColor(isCompleted ? '#57F287' : '#00D166')
      .addFields(
        { name: 'Khách hàng', value: `<@${order.userId}> (\`${order.username || order.userId}\`)`, inline: true },
        { name: 'Mã đơn', value: `\`${order.id}\``, inline: true },
        { name: 'Gói trúng thưởng', value: `✨ **${claimData.nitroType || 'Nitro Basic'}**`, inline: true },
        { name: 'Tốc độ săn', value: `⚡ **${claimData.speedMs || 3500}ms**`, inline: true },
        { name: 'Tiến độ đơn', value: `**${order.completedTurns}/${order.initialTurns} lượt** (Còn ${order.remainingTurns} lượt)`, inline: true },
        { name: 'Trạng thái', value: isCompleted ? '✅ **Đã hoàn thành 100% đơn**' : '🔄 **Đang tiếp tục ở hàng đợi**', inline: true }
      )
      .setFooter({ text: `Server: ${order.guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(order.guildId, embed);
  }

  /**
   * 3. Log khi token bị chết / invalid giữa chừng
   */
  async logTokenDead(order, refundCredits) {
    if (!order) return;
    const embed = new EmbedBuilder()
      .setTitle('⚠️ [TOKEN CHẾT] Đơn tạm dừng & Đã hoàn Credit')
      .setColor('#FEE75C')
      .addFields(
        { name: 'Khách hàng', value: `<@${order.userId}> (\`${order.username || order.userId}\`)`, inline: true },
        { name: 'Mã đơn', value: `\`${order.id}\``, inline: true },
        { name: 'Số lượt chưa nhận', value: `**${order.remainingTurns} lượt**`, inline: true },
        { name: 'Credit đã hoàn trả', value: `💰 **+${refundCredits} credit** (Đã cộng vào ví khách)`, inline: true },
        { name: 'Lý do sự cố', value: '❌ Token Discord bị hết hạn hoặc khách bấm Đăng xuất (Log out)', inline: false },
        { name: 'Chính sách bảo lưu', value: '⏱️ Đơn bảo lưu thứ hạng trong 60 phút. Khách có thể dùng lệnh `/rejoin token:<mới>` để tiếp tục.', inline: false }
      )
      .setFooter({ text: `Server: ${order.guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(order.guildId, embed);
  }

  /**
   * 4. Log khi khách rút đơn
   */
  async logOrderCancelled(order, refundCredits) {
    if (!order) return;
    const embed = new EmbedBuilder()
      .setTitle('🗑️ [HỦY / RÚT ĐƠN] Khách hàng đã rút đơn')
      .setColor('#ED4245')
      .addFields(
        { name: 'Khách hàng', value: `<@${order.userId}>`, inline: true },
        { name: 'Mã đơn', value: `\`${order.id}\``, inline: true },
        { name: 'Số credit hoàn lại', value: `**+${refundCredits} credit**`, inline: true }
      )
      .setFooter({ text: `Server: ${order.guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(order.guildId, embed);
  }

  /**
   * 5. Log khi thành viên tặng credit cho nhau (/bank gift)
   */
  async logCreditGift({ fromUser, toUser, amount, fromBal, toBal, guildId }) {
    const embed = new EmbedBuilder()
      .setTitle('🎁 [GIFT CREDIT] Giao dịch tặng credit giữa thành viên')
      .setColor('#E67E22')
      .addFields(
        { name: 'Người tặng', value: `<@${fromUser.id}> (\`${fromUser.tag || fromUser.username}\`)\nSố dư còn: **${fromBal} credit**`, inline: true },
        { name: 'Người nhận', value: `<@${toUser.id}> (\`${toUser.tag || toUser.username}\`)\nSố dư mới: **${toBal} credit**`, inline: true },
        { name: 'Số lượng chuyển', value: `💸 **${amount} credit**`, inline: true }
      )
      .setFooter({ text: `Server: ${guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(guildId, embed);
  }

  /**
   * 6. Log khi admin điều chỉnh credit (/bank add, /bank remove, /bank set)
   */
  async logCreditChange({ adminUser, targetUser, amount, action = 'Cộng credit', newBal, guildId }) {
    const embed = new EmbedBuilder()
      .setTitle(`💳 [BIẾN ĐỘNG VÍ] Quản trị viên can thiệp: ${action}`)
      .setColor('#3498DB')
      .addFields(
        { name: 'Admin thực hiện', value: `<@${adminUser.id}>`, inline: true },
        { name: 'Khách hàng', value: `<@${targetUser.id}>`, inline: true },
        { name: 'Thay đổi', value: `**${amount}**`, inline: true },
        { name: 'Số dư mới của khách', value: `💰 **${newBal} credit**`, inline: true }
      )
      .setFooter({ text: `Server: ${guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(guildId, embed);
  }

  /**
   * 7. Log khi khách đổi Key lấy Credit (/redeem key)
   */
  async logKeyRedeemed({ user, key, credits, newBal, guildId }) {
    const embed = new EmbedBuilder()
      .setTitle('🔑 [ĐỔI KEY] Khách nạp Key thành công')
      .setColor('#2ECC71')
      .addFields(
        { name: 'Khách hàng', value: `<@${user.id}> (\`${user.tag || user.username}\`)`, inline: true },
        { name: 'Mã Key', value: `\`${key}\``, inline: true },
        { name: 'Credit quy đổi', value: `**+${credits} credit**`, inline: true },
        { name: 'Số dư ví hiện tại', value: `💰 **${newBal} credit**`, inline: true }
      )
      .setFooter({ text: `Server: ${guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(guildId, embed);
  }

  /**
   * 8. Log khi duyệt đơn nạp VietQR (/bank confirm)
   */
  async logDepositSuccess({ user, deposit, admin, guildId }) {
    const embed = new EmbedBuilder()
      .setTitle('💰 [NẠP TIỀN VIETQR] Đơn nạp đã được duyệt')
      .setColor('#57F287')
      .addFields(
        { name: 'Khách hàng', value: `<@${deposit.userId}>`, inline: true },
        { name: 'Số tiền thanh toán', value: `**${deposit.amount?.toLocaleString('vi-VN')} VNĐ**`, inline: true },
        { name: 'Credit cộng vào ví', value: `**+${deposit.credits} credit**`, inline: true },
        { name: 'Nội dung CK', value: `\`${deposit.code}\``, inline: true },
        { name: 'Người duyệt', value: `${admin}`, inline: true }
      )
      .setFooter({ text: `Server: ${guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(guildId, embed);
  }

  /**
   * 9. Log khi có Lỗi phát sinh từ Shop Gốc (Upstream Bridge)
   */
  async logUpstreamError({ error, order = null, context = 'Shop Gốc', guildId = null }) {
    const embed = new EmbedBuilder()
      .setTitle('🚨 [CẢNH BÁO SHOP GỐC] Phát hiện lỗi kết nối / từ chối!')
      .setColor('#ED4245')
      .addFields(
        { name: 'Nội dung bối cảnh', value: `⚠️ **${context}**`, inline: false },
        { name: 'Chi tiết thông báo từ shop gốc', value: `\`\`\`${(error || 'Không rõ nguyên nhân').slice(0, 1000)}\`\`\``, inline: false },
        { name: 'Mã đơn bị ảnh hưởng', value: order ? `\`${order.id}\` (Khách: <@${order.userId}>)` : 'Không có', inline: true },
        { name: 'Biện pháp xử lý đề xuất', value: '• Kiểm tra xem tài khoản sỉ tại shop gốc còn đủ credit không.\n• Kiểm tra xem token sỉ trong `config.json` có bị logout không.', inline: false }
      )
      .setFooter({ text: `Server: ${guildId || 'Mọi server'}` })
      .setTimestamp();

    await this.sendLog(guildId, embed);
  }

  /**
   * 10. Log khi tài khoản sỉ nhận được Credit từ Shop Gốc
   */
  async logUpstreamGift({ senderName, amount, newBal, guildId = null }) {
    const embed = new EmbedBuilder()
      .setTitle('📥 [KHO SỈ NHẬN CREDIT] Shop Gốc đã tặng/chuyển Credit!')
      .setColor('#9B59B6')
      .addFields(
        { name: 'Người gửi (Shop gốc)', value: `**${senderName}**`, inline: true },
        { name: 'Credit nhận được', value: `🎁 **+${amount} credit**`, inline: true },
        { name: 'Tổng tồn kho sỉ hiện tại', value: `💎 **${newBal} credit**`, inline: true },
        { name: 'Tự động đồng bộ', value: '✅ Đã cập nhật số dư kho sỉ để phục vụ khách mua hàng.', inline: false }
      )
      .setFooter({ text: 'Tài khoản sỉ trung gian' })
      .setTimestamp();

    await this.sendLog(guildId, embed);
  }

  /**
   * 11. Log khi đơn hàng đã được shop gốc tiếp nhận (Đổi credit thành công từ bot HQ)
   */
  async logUpstreamOrderSynced(order, { upstreamOrderId, upstreamPos }) {
    if (!order) return;
    const embed = new EmbedBuilder()
      .setTitle('🔗 [SHOP GỐC TIẾP NHẬN] Đơn hàng đã vào Queue Shop Gốc')
      .setColor('#5865F2')
      .addFields(
        { name: 'Khách hàng', value: `<@${order.userId}> (\`${order.username || order.userId}\`)`, inline: true },
        { name: 'Mã đơn nội bộ', value: `\`${order.id}\``, inline: true },
        { name: 'Mã đơn shop gốc', value: `\`${upstreamOrderId || 'N/A'}\``, inline: true },
        { name: 'Vị trí queue gốc', value: upstreamPos != null ? `**#${upstreamPos}**` : 'Đang xử lý', inline: true },
        { name: 'Số lượt', value: `**${order.initialTurns} lượt**`, inline: true },
        { name: 'Chế độ', value: order.isPriority ? '⚡ **Ưu tiên**' : '🎯 **Thường**', inline: true }
      )
      .setFooter({ text: `Server: ${order.guildId || 'Mặc định'}` })
      .setTimestamp();

    await this.sendLog(order.guildId, embed);
  }
}

module.exports = new OwnerLogService();
