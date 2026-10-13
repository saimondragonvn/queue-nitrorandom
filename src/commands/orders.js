const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const { maskToken, formatDateTime } = require('../utils/helpers');

function checkIsAdmin(interaction, config) {
  const ownerId = process.env.OWNER_ID || config.ownerId;
  if (ownerId && interaction.user.id === ownerId) return true;
  if (interaction.guild && interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  const guildCfg = interaction.guildId ? db.getGuildConfig(interaction.guildId) : null;
  if (guildCfg?.adminRoleIds && guildCfg.adminRoleIds.some(r => interaction.member?.roles?.cache?.has(r))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orders')
    .setDescription('[Chủ shop] Quản lý, tra cứu số lượng đơn hàng và tính toán hoàn credit cho khách')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // 1. /orders summary
    .addSubcommand(sub =>
      sub
        .setName('summary')
        .setDescription('[Chủ shop] Thống kê tổng số đơn đã tạo trong server & số credit cần hoàn cho khách')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Lọc thống kê riêng cho một khách hàng (tùy chọn)')
            .setRequired(false)
        )
    )
    // 2. /orders list
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('[Chủ shop] Tra sổ đơn đã lưu trong server')
        .addStringOption(opt =>
          opt
            .setName('status')
            .setDescription('Lọc theo trạng thái đơn')
            .setRequired(false)
            .addChoices(
              { name: 'Tất cả (Cả đơn đã xong)', value: 'ALL' },
              { name: 'Đang chờ (WAITING)', value: 'WAITING' },
              { name: 'Đang săn (HUNTING)', value: 'HUNTING' },
              { name: 'Token chết (PAUSED_TOKEN_DEAD)', value: 'PAUSED_TOKEN_DEAD' },
              { name: 'Đã hoàn thành (COMPLETED)', value: 'COMPLETED' },
              { name: 'Đã hủy (CANCELLED)', value: 'CANCELLED' }
            )
        )
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Lọc riêng theo một khách hàng (tùy chọn)')
            .setRequired(false)
        )
    )
    // 3. /orders find
    .addSubcommand(sub =>
      sub
        .setName('find')
        .setDescription('Tra cứu chi tiết một đơn theo mã')
        .addStringOption(opt =>
          opt
            .setName('id')
            .setDescription('Mã đơn hàng (Ví dụ: ORD-123456-789)')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const config = getConfig();
    if (!checkIsAdmin(interaction, config)) {
      return interaction.reply({
        content: '❌ Bạn không có quyền sử dụng lệnh này!',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const isBotOwner = Boolean(config.ownerId && interaction.user.id === config.ownerId);
    const targetGuildId = interaction.guildId || null;

    // 1. /orders summary: Thống kê số lượng đơn và số credit cần hoàn
    if (subcommand === 'summary') {
      const filterUser = interaction.options.getUser('user');
      const filterUserId = filterUser?.id || null;

      const summary = db.getGuildOrdersSummary(targetGuildId, filterUserId);
      const serverName = interaction.guild?.name || config.shop.name || 'Server';

      const embed = new EmbedBuilder()
        .setTitle(`📊 Thống Kê Đơn Hàng — ${serverName}`)
        .setColor('#5865F2')
        .setTimestamp();

      if (filterUser) {
        embed.setDescription(`🔍 **Đang lọc theo khách hàng:** <@${filterUser.id}> (\`${filterUser.id}\`)`);
      } else {
        embed.setDescription(`📦 **Tổng số đơn đã tạo trong server:** **${summary.totalOrders} đơn**`);
      }

      embed.addFields(
        {
          name: '📌 Trạng thái đơn',
          value:
            `• ⏳ Đang chờ (Waiting): **${summary.waitingCount} đơn**\n` +
            `• 🎯 Đang săn (Hunting): **${summary.huntingCount} đơn**\n` +
            `• ⚠️ Token chết (Paused): **${summary.deadCount} đơn**\n` +
            `• ✅ Đã hoàn thành: **${summary.completedCount} đơn**\n` +
            `• ❌ Đã hủy: **${summary.cancelledCount} đơn**`,
          inline: true
        },
        {
          name: '🔄 Số lượt & Credit cần hoàn',
          value:
            `• Tổng lượt đã tạo: **${summary.totalTurnsInitial} lượt**\n` +
            `• Đã săn trúng nhận quà: **${summary.totalTurnsCompleted} lượt**\n` +
            `• Còn lại chưa nhận: **${summary.totalRemainingTurns} lượt**\n` +
            `• 🛡️ **Cần hoàn nếu hủy:** **${summary.totalRefundableCredits} credit**`,
          inline: true
        }
      );

      // Danh sách các khách hàng đang có đơn dang dở cần hoàn
      if (summary.userList && summary.userList.length > 0) {
        const pendingUsers = summary.userList.filter(u => u.remainingTurns > 0 || u.deadOrders > 0);
        if (pendingUsers.length > 0) {
          const userLines = pendingUsers.slice(0, 10).map((u, i) =>
            `\`#${i + 1}\` <@${u.userId}> — ${u.activeOrders} đơn đang chạy, còn **${u.remainingTurns} lượt** ➔ **Cần hoàn: ${u.refundableCredits} credit**`
          );
          embed.addFields({
            name: `👥 Khách hàng cần hoàn/theo dõi (${pendingUsers.length} người)`,
            value: userLines.join('\n') + (pendingUsers.length > 10 ? `\n*...và ${pendingUsers.length - 10} khách khác.*` : ''),
            inline: false
          });
        }
      }

      embed.addFields({
        name: '💡 Hướng dẫn hoàn credit cho khách',
        value:
          `• Dùng lệnh \`/bank add user:<@khách> amount:<số_xu>\` để cộng credit hoàn cho khách.\n` +
          `• Dùng lệnh \`/bank deduct user:<@khách> amount:<số_xu>\` nếu muốn trừ lại credit đã cấp.`,
        inline: false
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 2. /orders list [status:] [user:]
    if (subcommand === 'list') {
      const status = interaction.options.getString('status') || 'ALL';
      const filterUser = interaction.options.getUser('user');
      const filterUserId = filterUser?.id || null;

      const orders = db.getAllOrders(status, targetGuildId, filterUserId);

      if (!orders.length) {
        return interaction.reply({
          content: `ℹ️ Không có đơn hàng nào trong server khớp với điều kiện lọc (${status}${filterUser ? ` - <@${filterUser.id}>` : ''}).`,
          ephemeral: true
        });
      }

      const priorityMult = config.queueSettings?.priorityMultiplier || 3;
      const statusIcons = {
        WAITING: '⏳',
        HUNTING: '🎯',
        COMPLETED: '✅',
        CANCELLED: '❌',
        PAUSED_TOKEN_DEAD: '⚠️',
        EXPIRED: '⏱️'
      };

      const lines = orders.slice(0, 15).map((o, i) => {
        const icon = statusIcons[o.status] || '📦';
        const mult = o.isPriority ? priorityMult : 1;
        const refundable = (o.remainingTurns || 0) * mult;
        const pri = o.isPriority ? ' [⚡Ưu tiên]' : '';
        const refundNote = (o.status === 'WAITING' || o.status === 'HUNTING' || o.status === 'PAUSED_TOKEN_DEAD')
          ? ` (Hoàn: ${refundable} xu)`
          : '';

        return `\`#${i + 1}\` ${icon} \`${o.id}\` | <@${o.userId}> | **${o.completedTurns || 0}/${o.initialTurns} lượt**${pri} | Trạng thái: \`${o.status}\`${refundNote}`;
      });

      const totalRemainingTurns = orders
        .filter(o => o.status === 'WAITING' || o.status === 'HUNTING' || o.status === 'PAUSED_TOKEN_DEAD')
        .reduce((sum, o) => sum + (o.remainingTurns || 0), 0);

      const totalRefundCredits = orders
        .filter(o => o.status === 'WAITING' || o.status === 'HUNTING' || o.status === 'PAUSED_TOKEN_DEAD')
        .reduce((sum, o) => sum + ((o.remainingTurns || 0) * (o.isPriority ? priorityMult : 1)), 0);

      const embed = new EmbedBuilder()
        .setTitle(`📚 Sổ Đơn Hàng (${orders.length} đơn đã tạo trong server)`)
        .setColor('#5865F2')
        .setDescription(
          (filterUser ? `🔍 Lọc theo khách: <@${filterUser.id}>\n` : '') +
          `• Còn lại chưa nhận: **${totalRemainingTurns} lượt**\n` +
          `• 🛡️ Tổng credit cần hoàn nếu hủy các đơn dang dở: **${totalRefundCredits} credit**\n\n` +
          `${lines.join('\n')}\n\n` +
          `*(Hiển thị 15 đơn mới nhất. Dùng \`/orders find id:<mã>\` để xem chi tiết từng đơn hoặc \`/orders summary\` để xem thống kê).*`
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 3. /orders find id:
    if (subcommand === 'find') {
      const id = interaction.options.getString('id').trim();
      const order = db.getOrder(id);

      if (!order) {
        return interaction.reply({
          content: `❌ Không tìm thấy đơn nào có mã \`${id}\` trong sổ lưu!`,
          ephemeral: true
        });
      }

      const priorityMult = config.queueSettings?.priorityMultiplier || 3;
      const mult = order.isPriority ? priorityMult : 1;
      const initialCost = order.initialTurns * mult;
      const remainingRefund = (order.remainingTurns || 0) * mult;

      return interaction.reply({
        content:
          `📋 **Chi tiết đơn hàng \`${order.id}\`:**\n\n` +
          `• Khách hàng: <@${order.userId}> (\`${order.username || order.userId}\`)\n` +
          `• Số lượt: **${order.completedTurns || 0}/${order.initialTurns} đã nhận** (Còn lại: **${order.remainingTurns} lượt**)\n` +
          `• Chế độ: ${order.isPriority ? '⭐ **Ưu tiên (3x)**' : 'Bình thường'}\n` +
          `• Credit ban đầu: **${initialCost} credit**\n` +
          `• 🛡️ **Credit cần hoàn nếu hủy:** **${remainingRefund} credit**\n` +
          `• Khiên bảo vệ: \`${order.shield || 0}/${order.maxShield || 10}\`\n` +
          `• Token tài khoản: \`${maskToken(order.token)}\`\n` +
          (order.upstreamOrderId ? `• Mã đơn shop gốc: \`${order.upstreamOrderId}\`\n` : '') +
          `• Trạng thái: \`${order.status}\`${order.deletedWithoutRefund ? ' *(Đã xóa không hoàn)*' : ''}\n` +
          `• Thời gian vào hàng: ${formatDateTime(order.enteredAt)}\n` +
          `• Cập nhật lần cuối: ${formatDateTime(order.updatedAt)}\n\n` +
          `*💡 Để hoàn credit cho khách này: \`/bank add user:<@${order.userId}> amount:${remainingRefund}\`*`,
        ephemeral: true
      });
    }
  }
};
