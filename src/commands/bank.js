const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const { buildGuideEmbed } = require('../utils/embeds');
const { formatVND, formatDateTime, timeAgo } = require('../utils/helpers');

function checkIsAdmin(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Hệ thống ngân hàng, ví credit cho khách và chủ shop')
    // === CHO KHÁCH ===
    .addSubcommand(sub =>
      sub
        .setName('balance')
        .setDescription('Xem số dư của bạn và hướng dẫn nạp')
    )
    .addSubcommand(sub =>
      sub
        .setName('gift')
        .setDescription('Tặng credit cho người khác')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Thành viên bạn muốn tặng credit')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('Số credit muốn chuyển')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    // === CHO CHỦ SHOP ===
    .addSubcommand(sub =>
      sub
        .setName('confirm')
        .setDescription('[Chủ shop] Cộng credit cho một đơn nạp khi thấy tiền về (nhận cả mã quá hạn)')
        .addStringOption(opt =>
          opt
            .setName('code')
            .setDescription('Mã đơn nạp (Ví dụ: NAPGY9NTC)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('pending')
        .setDescription('[Chủ shop] Đơn đang chờ khách chuyển, và tiền đã vào mà chưa thành credit')
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('[Chủ shop] Cộng credit cho một khách (khách được nhắn riêng)')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Khách hàng cần cộng credit')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('Số credit muốn cộng')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('[Chủ shop] Trừ credit của một khách (khách được nhắn riêng)')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Khách hàng cần trừ credit')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('Số credit muốn trừ')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('[Chủ shop] Đặt số dư credit của một khách (khách được nhắn riêng)')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Khách hàng cần đặt credit')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('Số credit mới')
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('check')
        .setDescription('[Chủ shop] Số dư, hạng và đơn đang chạy của một khách')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Khách hàng cần kiểm tra')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('transfer')
        .setDescription('[Chủ shop] Chuyển credit từ khách này sang khách khác')
        .addUserOption(opt =>
          opt
            .setName('from')
            .setDescription('Khách bị trừ credit')
            .setRequired(true)
        )
        .addUserOption(opt =>
          opt
            .setName('to')
            .setDescription('Khách nhận credit')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('Số credit cần chuyển')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('supply')
        .setDescription('[Chủ shop] Xem ví sỉ còn bao nhiêu (chỉ xem, không nạp)')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const config = getConfig();

    // 1. /bank balance (Khách)
    if (subcommand === 'balance') {
      const user = db.getUser(interaction.user.id, interaction.guildId);
      const { EmbedBuilder } = require('discord.js');
      const upstreamBridge = require('../services/upstreamBridge');

      // Nếu là Owner và có kết nối shop gốc, tra cứu trực tiếp số dư tài khoản sỉ từ shop gốc!
      if (interaction.user.id === config.ownerId && config.upstream?.enabled && upstreamBridge.isReady) {
        await interaction.deferReply({ ephemeral: true });
        const upRes = await upstreamBridge.checkUpstreamBankBalance();
        if (upRes && (upRes.content || upRes.embeds?.length)) {
          const payload = {};
          if (upRes.content) payload.content = upRes.content;
          if (upRes.embeds?.length) payload.embeds = upRes.embeds;
          return interaction.editReply(payload);
        }
      }

      const guildCfg = interaction.guildId ? db.getGuildConfig(interaction.guildId) : {};
      const shopName = guildCfg.name || interaction.guild?.name || config.shop.name || 'HQ SHOP';

      // Khớp chuẩn 100% định dạng embed /bank balance của bot shop gốc
      const embed = new EmbedBuilder()
        .setTitle('Số dư của bạn')
        .setDescription(
          `**Số dư:** ${user.balance || 0} credit\n\n` +
          `Gõ \`/redeem credits\` để dùng credit vào hàng đợi nhé!`
        )
        .setColor(65280);

      const avatar = guildCfg.avatarUrl || config.shop.avatarUrl;
      if (avatar) {
        embed.setThumbnail(avatar);
      }
      embed.setFooter({ text: `${shopName}` });

      if (interaction.deferred) return interaction.editReply({ embeds: [embed] });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 2. /bank gift (Khách)
    if (subcommand === 'gift') {
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: '❌ Bạn không thể tự tặng credit cho chính mình!',
          ephemeral: true
        });
      }
      if (targetUser.bot) {
        return interaction.reply({
          content: '❌ Bạn không thể tặng credit cho bot!',
          ephemeral: true
        });
      }

      const sender = db.getUser(interaction.user.id, interaction.guildId);
      if (sender.balance < amount) {
        return interaction.reply({
          content: `❌ Bạn không đủ credit! Số dư hiện tại tại máy chủ này là **${sender.balance} credit**.`,
          ephemeral: true
        });
      }

      db.deductCredits(interaction.user.id, amount, interaction.guildId);
      db.addCredits(targetUser.id, amount, interaction.guildId);

      const senderAfter = db.getUser(interaction.user.id, interaction.guildId);
      const receiverAfter = db.getUser(targetUser.id, interaction.guildId);

      // Gửi DM cho người nhận chuẩn định dạng như shop gốc (HQ Shop)
      const giftDmEmbed = new EmbedBuilder()
        .setDescription(`**${interaction.user.username}** vừa tặng bạn **${amount}** credit!\nSố dư hiện tại: **${receiverAfter.balance}**`)
        .setColor(65280);
      targetUser.send({ embeds: [giftDmEmbed] }).catch(() => {});

      const giftReplyEmbed = new EmbedBuilder()
        .setDescription(`Bạn đã tặng **${amount}** credit cho <@${targetUser.id}>!\nSố dư hiện tại: **${senderAfter.balance}**`)
        .setColor(65280);

      // Bắn log tặng credit vào kênh bảo mật của Server Owner
      try {
        const ownerLogService = require('../services/ownerLogService');
        ownerLogService.logCreditGift({
          fromUser: interaction.user,
          toUser: targetUser,
          amount,
          fromBal: senderAfter.balance,
          toBal: receiverAfter.balance,
          guildId: interaction.guildId
        });
      } catch (e) {}

      return interaction.reply({
        embeds: [giftReplyEmbed],
        ephemeral: false
      });
    }

    // === CÁC LỆNH CHO CHỦ SHOP (Yêu cầu quyền Admin) ===
    if (!checkIsAdmin(interaction, config)) {
      return interaction.reply({
        content: '❌ Bạn không có quyền sử dụng lệnh của chủ shop!',
        ephemeral: true
      });
    }

    // 3. /bank confirm code:<mã NAP>
    if (subcommand === 'confirm') {
      const code = interaction.options.getString('code');
      const bankService = require('../services/bankService');
      await interaction.deferReply({ ephemeral: true });

      const res = await bankService.approveDepositWithStockCheck(
        code,
        interaction.user.tag || interaction.user.id,
        interaction.client
      );

      if (!res.success) {
        if (res.insufficientStock) {
          return interaction.editReply({
            content:
              `⚠️ **CẢNH BÁO KHO SỈ KHÔNG ĐỦ CREDIT!**\n` +
              `• Đơn \`${res.deposit.code}\` cần: **${res.requiredCredits} credit**\n` +
              `• Token trên shop gốc hiện chỉ còn: **${res.rootStock} credit** (Thiếu **${res.requiredCredits - res.rootStock} credit**).\n\n` +
              `👉 Vui lòng nạp thêm credit cho tài khoản token trên shop gốc trước khi duyệt đơn này!`
          });
        }
        return interaction.editReply({
          content: `❌ ${res.message || 'Không thể duyệt đơn này!'}`
        });
      }

      const { deposit, user, rootStock } = res;
      const rootNotice = rootStock !== null ? `\n• Số dư token shop gốc còn lại: **${rootStock} credit**.` : '';

      // Bắn log nạp credit vào kênh bảo mật của Server Owner
      try {
        const ownerLogService = require('../services/ownerLogService');
        ownerLogService.logDepositSuccess({
          user: interaction.client.users.cache.get(deposit.userId) || { id: deposit.userId },
          deposit,
          admin: interaction.user.tag || interaction.user.username,
          guildId: interaction.guildId
        });
      } catch (e) {}

      return interaction.editReply({
        content:
          `✅ Đã duyệt đơn \`${deposit.code}\`! Đã cộng **+${deposit.credits} credit** cho khách <@${deposit.userId}>.\n` +
          `• Số dư mới của khách: **${user.balance} credit**.\n` +
          rootNotice
      });
    }

    // 4. /bank pending
    if (subcommand === 'pending') {
      const pendings = db.getPendingDeposits();
      if (!pendings.length) {
        return interaction.reply({
          content: 'ℹ️ Hiện tại không có đơn nạp nào đang chờ xử lý.',
          ephemeral: true
        });
      }

      const lines = pendings.slice(0, 15).map((d, i) => {
        const expired = new Date(d.expiresAt) <= new Date() ? ' (Đã quá hạn)' : '';
        return `\`#${i + 1}\` Mã: \`${d.code}\` | Khách: <@${d.userId}> | Tiền: **${formatVND(d.amount)}** (+${d.credits} xu) | Tạo: ${timeAgo(d.createdAt)}${expired}`;
      });

      return interaction.reply({
        content: `📋 **Danh sách đơn nạp đang chờ (${pendings.length} đơn):**\n\n${lines.join('\n')}\n\n*Dùng \`/bank confirm code:<mã>\` để duyệt cộng credit.*`,
        ephemeral: true
      });
    }

    // 5. /bank add
    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      db.addCredits(targetUser.id, amount, interaction.guildId);
      const after = db.getUser(targetUser.id, interaction.guildId);

      // Bắn log vào kênh bảo mật của Server Owner
      try {
        const ownerLogService = require('../services/ownerLogService');
        ownerLogService.logCreditChange({
          adminUser: interaction.user,
          targetUser,
          amount: `+${amount} credit`,
          action: 'Cộng credit',
          newBal: after.balance,
          guildId: interaction.guildId
        });
      } catch (e) {}

      // Nhắn tin riêng cho khách
      targetUser.send({
        content: `🎉 Bạn vừa được chủ shop **${config.shop.name}** cộng **+${amount} credit** vào ví tại **${interaction.guild?.name || 'máy chủ'}**!\n• Số dư hiện tại: **${after.balance} credit**.`
      }).catch(() => {});

      return interaction.reply({
        content: `✅ Đã cộng **+${amount} credit** cho <@${targetUser.id}> tại server này.\n• Số dư hiện tại của khách: **${after.balance} credit** (Đã gửi tin nhắn riêng).`,
        ephemeral: true
      });
    }

    // 6. /bank remove
    if (subcommand === 'remove') {
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const success = db.deductCredits(targetUser.id, amount, interaction.guildId);
      const after = db.getUser(targetUser.id, interaction.guildId);

      // Bắn log vào kênh bảo mật của Server Owner
      if (success) {
        try {
          const ownerLogService = require('../services/ownerLogService');
          ownerLogService.logCreditChange({
            adminUser: interaction.user,
            targetUser,
            amount: `-${amount} credit`,
            action: 'Trừ credit',
            newBal: after.balance,
            guildId: interaction.guildId
          });
        } catch (e) {}
      }

      // Nhắn riêng cho khách
      targetUser.send({
        content: `⚠️ Tài khoản của bạn tại **${interaction.guild?.name || config.shop.name}** vừa bị trừ **-${amount} credit**.\n• Số dư còn lại: **${after.balance} credit**.`
      }).catch(() => {});

      return interaction.reply({
        content: success
          ? `✅ Đã trừ **-${amount} credit** của <@${targetUser.id}> tại server này.\n• Số dư còn lại: **${after.balance} credit** (Đã gửi tin nhắn riêng).`
          : `⚠️ Khách chỉ có **${after.balance} credit** tại server này, không đủ để trừ ${amount} credit!`,
        ephemeral: true
      });
    }

    // 7. /bank set
    if (subcommand === 'set') {
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      db.setBalance(targetUser.id, amount, interaction.guildId);

      // Bắn log vào kênh bảo mật của Server Owner
      try {
        const ownerLogService = require('../services/ownerLogService');
        ownerLogService.logCreditChange({
          adminUser: interaction.user,
          targetUser,
          amount: `Đặt thành ${amount} credit`,
          action: 'Đặt lại số dư',
          newBal: amount,
          guildId: interaction.guildId
        });
      } catch (e) {}

      // Nhắn riêng cho khách
      targetUser.send({
        content: `ℹ️ Số dư tài khoản của bạn tại **${interaction.guild?.name || config.shop.name}** đã được điều chỉnh thành **${amount} credit**.`
      }).catch(() => {});

      return interaction.reply({
        content: `✅ Đã đặt số dư của <@${targetUser.id}> tại server này thành **${amount} credit** (Đã gửi tin nhắn riêng).`,
        ephemeral: true
      });
    }

    // 8. /bank check user:
    if (subcommand === 'check') {
      const targetUser = interaction.options.getUser('user');
      const userData = db.getUser(targetUser.id, interaction.guildId);
      const rank = db.getUserRank(targetUser.id, interaction.guildId);
      const activeOrders = db.getUserActiveOrders(targetUser.id).filter(
        o => !interaction.guildId || !o.guildId || o.guildId === interaction.guildId
      );

      const orderLines = activeOrders.length
        ? activeOrders.map(o => `• Đơn \`${o.id}\`: Còn ${o.remainingTurns}/${o.initialTurns} lượt ${o.isPriority ? '[Ưu tiên]' : ''} (Khiên ${o.shield || 0}/${o.maxShield || 10})`).join('\n')
        : '• Không có đơn nào đang chạy.';

      return interaction.reply({
        content:
          `👤 **Thông tin khách hàng <@${targetUser.id}> tại ${interaction.guild?.name || 'server'}:**\n` +
          `• Số dư credit: **${userData.balance} credit**\n` +
          `• Thứ hạng credit: **#${rank}**\n` +
          `• Tổng credit đã chi tiêu: **${userData.totalSpent || 0} credit**\n\n` +
          `📌 **Đơn đang chạy trong hàng đợi (${activeOrders.length}):**\n${orderLines}`,
        ephemeral: true
      });
    }

    // 9. /bank transfer from: to: amount:
    if (subcommand === 'transfer') {
      const fromUser = interaction.options.getUser('from');
      const toUser = interaction.options.getUser('to');
      const amount = interaction.options.getInteger('amount');

      const sender = db.getUser(fromUser.id, interaction.guildId);
      if (sender.balance < amount) {
        return interaction.reply({
          content: `❌ Khách <@${fromUser.id}> chỉ có **${sender.balance} credit** tại server này, không đủ chuyển ${amount} credit!`,
          ephemeral: true
        });
      }

      db.deductCredits(fromUser.id, amount, interaction.guildId);
      db.addCredits(toUser.id, amount, interaction.guildId);

      // Nhắn tin riêng cho cả 2
      fromUser.send({
        content: `ℹ️ Chủ shop vừa chuyển **${amount} credit** từ tài khoản của bạn tại **${interaction.guild?.name || 'server'}** sang cho <@${toUser.id}>. Số dư còn lại: **${db.getUser(fromUser.id, interaction.guildId).balance} credit**.`
      }).catch(() => {});

      toUser.send({
        content: `🎉 Bạn vừa nhận được **+${amount} credit** (chuyển từ <@${fromUser.id}> bởi chủ shop tại **${interaction.guild?.name || 'server'}**). Số dư hiện tại: **${db.getUser(toUser.id, interaction.guildId).balance} credit**.`
      }).catch(() => {});

      return interaction.reply({
        content: `✅ Đã chuyển thành công **${amount} credit** từ <@${fromUser.id}> sang <@${toUser.id}>!`,
        ephemeral: true
      });
    }

    // 10. /bank supply
    if (subcommand === 'supply') {
      const upstreamBridge = require('../services/upstreamBridge');
      if (config.upstream?.enabled && upstreamBridge.isReady) {
        await interaction.deferReply({ ephemeral: true });
        const upRes = await upstreamBridge.checkUpstreamBankBalance();
        if (upRes && (upRes.content || upRes.embeds?.length)) {
          const payload = {};
          if (upRes.content) payload.content = upRes.content;
          if (upRes.embeds?.length) payload.embeds = upRes.embeds;
          return interaction.editReply(payload);
        }
      }

      const wholesale = db.getWholesaleBalance();
      const replyContent = `💼 **Ví sỉ của shop hiện tại:** **${wholesale} credit** (Chỉ xem, không nạp trực tiếp qua cổng thanh toán).`;
      if (interaction.deferred) return interaction.editReply({ content: replyContent });
      return interaction.reply({
        content: replyContent,
        ephemeral: true
      });
    }
  }
};
