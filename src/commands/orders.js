const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const { maskToken, formatDateTime } = require('../utils/helpers');

function checkIsAdmin(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orders')
    .setDescription('[Chủ shop] Tra cứu sổ đơn đã lưu, cả đơn đã hoàn thành')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Tra sổ đơn đã lưu trong hệ thống')
        .addStringOption(opt =>
          opt
            .setName('status')
            .setDescription('Lọc theo trạng thái đơn')
            .setRequired(false)
            .addChoices(
              { name: 'Tất cả (Cả đơn đã xong)', value: 'ALL' },
              { name: 'Đang chờ (WAITING)', value: 'WAITING' },
              { name: 'Đang săn (HUNTING)', value: 'HUNTING' },
              { name: 'Đã hoàn thành (COMPLETED)', value: 'COMPLETED' },
              { name: 'Đã hủy (CANCELLED)', value: 'CANCELLED' }
            )
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

    // 1. /orders find id:
    if (subcommand === 'find') {
      const id = interaction.options.getString('id').trim();
      const order = db.getOrder(id);

      if (!order) {
        return interaction.reply({
          content: `❌ Không tìm thấy đơn nào có mã \`${id}\` trong sổ lưu!`,
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          `📋 **Chi tiết đơn hàng \`${order.id}\`:**\n` +
          `• Khách hàng: <@${order.userId}> (${order.username || order.userId})\n` +
          `• Số lượt: **${order.completedTurns || 0}/${order.initialTurns} đã nhận** (Còn lại: **${order.remainingTurns}**)\n` +
          `• Chế độ: ${order.isPriority ? '⭐ **Ưu tiên**' : 'Thường'}\n` +
          `• Khiên bảo vệ: \`${order.shield || 0}/${order.maxShield || 10}\`\n` +
          `• Token tài khoản: \`${maskToken(order.token)}\`\n` +
          `• Trạng thái: \`${order.status}\`${order.deletedWithoutRefund ? ' *(Đã xóa không hoàn)*' : ''}\n` +
          `• Thời gian vào hàng: ${formatDateTime(order.enteredAt)}\n` +
          `• Cập nhật lần cuối: ${formatDateTime(order.updatedAt)}`,
        ephemeral: true
      });
    }

    // 2. /orders list [status:]
    if (subcommand === 'list') {
      const status = interaction.options.getString('status') || 'ALL';
      const orders = db.getAllOrders(status);

      if (!orders.length) {
        return interaction.reply({
          content: `ℹ️ Không có đơn hàng nào khớp với điều kiện lọc (${status}).`,
          ephemeral: true
        });
      }

      const statusIcons = {
        WAITING: '⏳',
        HUNTING: '🎯',
        COMPLETED: '✅',
        CANCELLED: '❌',
        PAUSED_TOKEN_DEAD: '⚠️'
      };

      const lines = orders.slice(0, 15).map((o, i) => {
        const icon = statusIcons[o.status] || '📦';
        const pri = o.isPriority ? ' [Ưu tiên]' : '';
        return `\`#${i + 1}\` ${icon} \`${o.id}\` | <@${o.userId}> | **${o.completedTurns}/${o.initialTurns} lượt**${pri} | Trạng thái: \`${o.status}\``;
      });

      return interaction.reply({
        content:
          `📚 **Sổ đơn hàng lưu trữ (Hiển thị 15/${orders.length} đơn):**\n\n` +
          `${lines.join('\n')}\n\n` +
          `*Dùng \`/orders find id:<mã>\` để xem chi tiết token và khiên của từng đơn.*`,
        ephemeral: true
      });
    }
  }
};
