const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const queueService = require('../services/queueService');
const { buildQueueViewEmbed, buildSyncedQueueEmbed } = require('../utils/embeds');
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
    .setName('queue')
    .setDescription('Hệ thống quản lý hàng đợi săn Nitro cho khách và chủ shop')
    // === CHO KHÁCH ===
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('Xem toàn bộ danh sách hàng đợi hiện tại')
        .addIntegerOption(opt =>
          opt
            .setName('page')
            .setDescription('Trang cần xem (mỗi trang 15 đơn)')
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('mine')
        .setDescription('Xem các đơn hàng đợi của chính bạn')
    )
    .addSubcommand(sub =>
      sub
        .setName('position')
        .setDescription('Xem vị trí của bạn trong hàng đợi')
    )
    .addSubcommand(sub =>
      sub
        .setName('check')
        .setDescription('Xem chi tiết đơn hàng (để trống = của chính bạn)')
        .addStringOption(opt =>
          opt
            .setName('order_id')
            .setDescription('Mã đơn hàng cần tra cứu (để trống để xem đơn của mình)')
            .setRequired(false)
        )
    )
    // === CHO CHỦ SHOP ===
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('[Chủ shop] Thêm khách vào hàng đợi không trừ credit khách (trừ ví sỉ của bạn)')
        .addUserOption(opt =>
          opt
            .setName('user')
            .setDescription('Khách hàng cần thêm')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('turns')
            .setDescription('Số lượt')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(opt =>
          opt
            .setName('token')
            .setDescription('Token tài khoản nhận hàng')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt
            .setName('priority')
            .setDescription('Chế độ Ưu tiên?')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('[Chủ shop] Gỡ đơn CÓ HOÀN lại credit cho khách')
        .addStringOption(opt =>
          opt
            .setName('order_id')
            .setDescription('Mã đơn cần gỡ')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('[Chủ shop] Gỡ đơn KHÔNG HOÀN credit (xóa thẳng)')
        .addStringOption(opt =>
          opt
            .setName('order_id')
            .setDescription('Mã đơn cần xóa')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('entry')
        .setDescription('[Chủ shop] Cộng hoặc trừ lượt đã nhận của một đơn')
        .addStringOption(opt =>
          opt
            .setName('order_id')
            .setDescription('Mã đơn cần điều chỉnh')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('action')
            .setDescription('Hành động')
            .setRequired(true)
            .addChoices(
              { name: 'Cộng lượt đã nhận (+)', value: 'add' },
              { name: 'Trừ lượt đã nhận (-)', value: 'remove' }
            )
        )
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('Số lượt điều chỉnh')
            .setRequired(true)
            .setMinValue(1)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const config = getConfig();

    // 1. /queue view
    if (subcommand === 'view') {
      const activeQueue = db.getActiveQueue(interaction.guildId || null);
      const deadOrders = db.getDeadOrders(interaction.guildId || null);
      const rentalOrders = db.getRentalQueue(interaction.guildId || null);
      const page = interaction.options.getInteger('page') || 1;
      const { embed, row } = buildQueueViewEmbed(config, activeQueue, deadOrders, page, { rentalOrders });
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    // 2. /queue mine
    if (subcommand === 'mine') {
      const myOrders = db.getUserOrders(interaction.user.id);
      if (!myOrders.length) {
        return interaction.reply({
          content: 'ℹ️ Bạn chưa từng tạo đơn hàng đợi săn Nitro nào.',
          ephemeral: true
        });
      }

      const lines = myOrders.slice(-5).reverse().map(o => {
        const priorityTag = o.isPriority ? ' [Ưu tiên]' : '';
        const statusMap = {
          WAITING: '⏳ Đang chờ',
          HUNTING: '🎯 Đang săn',
          COMPLETED: '✅ Đã hoàn thành',
          CANCELLED: '❌ Đã hủy',
          PAUSED_TOKEN_DEAD: '⚠️ Token lỗi',
          EXPIRED: '⏱️ Hết hạn'
        };
        return `• Đơn \`${o.id}\`: Còn **${o.remainingTurns}/${o.initialTurns} lượt**${priorityTag} | Trạng thái: ${statusMap[o.status] || o.status}`;
      });

      return interaction.reply({
        content: `📋 **Danh sách 5 đơn gần nhất của bạn:**\n\n${lines.join('\n')}`,
        ephemeral: true
      });
    }

    // 3. /queue position
    if (subcommand === 'position') {
      const activeQueue = db.getActiveQueue(interaction.guildId || null);
      const index = activeQueue.findIndex(o => o.userId === interaction.user.id);

      if (index === -1) {
        return interaction.reply({
          content: 'Bạn hiện không có đơn nào trong hàng đợi.',
          ephemeral: true
        });
      }

      const order = activeQueue[index];
      return interaction.reply({
        content:
          `📍 **Vị trí của bạn:** #${index + 1} trên tổng số ${activeQueue.length} đơn\n` +
          `• Mã đơn: \`${order.id}\`\n` +
          `• Số lượt còn lại: **${order.remainingTurns} lượt**\n` +
          `• Guaranteed Boost: **${order.isPriority ? 'Có' : 'Không'}**`,
        ephemeral: true
      });
    }

    // 5. /queue check
    if (subcommand === 'check') {
      const orderId = interaction.options.getString('order_id');
      let order = null;

      if (orderId) {
        order = db.getOrder(orderId.trim());
      } else {
        const myActive = db.getUserActiveOrders(interaction.user.id);
        order = myActive.length ? myActive[0] : null;
      }

      if (!order) {
        return interaction.reply({
          content: 'Bạn hiện không có đơn nào trong hàng đợi.',
          ephemeral: true
        });
      }

      const isAdmin = checkIsAdmin(interaction, config);
      if (order.userId !== interaction.user.id && !isAdmin) {
        return interaction.reply({
          content: '❌ Bạn không có quyền xem thông tin đơn hàng của người khác!',
          ephemeral: true
        });
      }

      const activeQueue = db.getActiveQueue();
      const orderIndex = activeQueue.findIndex(o => o.id === order.id);
      const positionText = orderIndex !== -1 ? `#${orderIndex + 1}` : 'Chờ xử lý';

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('Tình trạng hàng đợi của bạn')
        .setColor(3092790)
        .addFields(
          { name: 'Thứ tự', value: positionText, inline: true },
          { name: 'Lượt', value: `${order.completedTurns}/${order.initialTurns} đã nhận (còn ${order.remainingTurns})`, inline: true },
          { name: 'Chế độ', value: order.isPriority ? '⭐ Ưu tiên (3x)' : 'Thường', inline: true },
          { name: 'Guaranteed Boost', value: order.isPriority ? 'Có' : 'Không', inline: true },
          { name: 'Token', value: `\`${maskToken(order.token)}\``, inline: true },
          { name: 'Trạng thái', value: order.status === 'HUNTING' ? '🎯 Đang săn' : '⏳ Đang chờ', inline: true }
        )
        .setFooter({ text: `${config.shop.name || 'HQ SHOP'} • Hôm nay lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // === CÁC LỆNH DÀNH RIÊNG CHO CHỦ SHOP ===
    if (!checkIsAdmin(interaction, config)) {
      return interaction.reply({
        content: '❌ Bạn không có quyền sử dụng lệnh quản lý hàng đợi của chủ shop!',
        ephemeral: true
      });
    }

    // 6. /queue add
    if (subcommand === 'add') {
      const targetUser = interaction.options.getUser('user');
      const turns = interaction.options.getInteger('turns');
      const token = interaction.options.getString('token').trim();
      const isPriority = Boolean(interaction.options.getBoolean('priority'));

      const priorityMultiplier = config.queueSettings?.priorityMultiplier || 3;
      const wholesaleCost = isPriority ? turns * priorityMultiplier : turns;

      // Trừ ví sỉ của shop
      db.deductWholesaleBalance(wholesaleCost);

      const order = db.createOrder({
        userId: targetUser.id,
        username: targetUser.tag || targetUser.username,
        token,
        turns,
        isPriority
      });

      const currentWholesale = db.getWholesaleBalance();

      return interaction.reply({
        content:
          `✅ **Đã thêm khách <@${targetUser.id}> vào hàng đợi thành công!**\n` +
          `• Mã đơn: \`${order.id}\`\n` +
          `• Số lượt: **${turns} lượt** ${isPriority ? '[Ưu tiên]' : ''}\n` +
          `• Không trừ ví khách. Đã trừ **${wholesaleCost} credit** ví sỉ của bạn.\n` +
          `• Ví sỉ còn lại: **${currentWholesale} credit**.`,
        ephemeral: true
      });
    }

    // 7. /queue remove (Gỡ đơn CÓ hoàn credit)
    if (subcommand === 'remove') {
      const orderId = interaction.options.getString('order_id').trim();
      const order = db.getOrder(orderId);

      if (!order) {
        return interaction.reply({ content: `❌ Không tìm thấy đơn \`${orderId}\`!`, ephemeral: true });
      }

      const res = db.cancelOrder(orderId, order.userId);
      if (!res) {
        return interaction.reply({
          content: `⚠️ Đơn \`${orderId}\` không ở trạng thái có thể gỡ hoàn credit!`,
          ephemeral: true
        });
      }

      return interaction.reply({
        content:
          `✅ **Đã gỡ đơn \`${orderId}\` thành công (Có hoàn)!**\n` +
          `• Đã hoàn lại: **+${res.refundCredits} credit** cho khách <@${order.userId}>.\n` +
          `• Số dư hiện tại của khách: **${db.getUser(order.userId, order.guildId || interaction.guildId).balance} credit**.`,
        ephemeral: true
      });
    }

    // 8. /queue delete (Gỡ đơn KHÔNG hoàn credit)
    if (subcommand === 'delete') {
      const orderId = interaction.options.getString('order_id').trim();
      const order = db.deleteOrderWithoutRefund(orderId);

      if (!order) {
        return interaction.reply({ content: `❌ Không tìm thấy đơn \`${orderId}\`!`, ephemeral: true });
      }

      return interaction.reply({
        content: `🗑️ **Đã xóa đơn \`${orderId}\` của khách <@${order.userId}> thành công!** (KHÔNG hoàn lại credit).`,
        ephemeral: true
      });
    }

    // 9. /queue entry (Cộng/trừ lượt đã nhận)
    if (subcommand === 'entry') {
      const orderId = interaction.options.getString('order_id').trim();
      const action = interaction.options.getString('action');
      const amount = interaction.options.getInteger('amount');

      const updated = db.adjustOrderEntry(orderId, action, amount);
      if (!updated) {
        return interaction.reply({ content: `❌ Không tìm thấy đơn \`${orderId}\`!`, ephemeral: true });
      }

      return interaction.reply({
        content:
          `✅ **Đã điều chỉnh lượt đơn \`${orderId}\`:**\n` +
          `• Hành động: **${action === 'add' ? `Cộng +${amount} lượt đã nhận` : `Trừ -${amount} lượt đã nhận`}**\n` +
          `• Đã nhận: **${updated.completedTurns}/${updated.initialTurns} lượt**\n` +
          `• Còn lại: **${updated.remainingTurns} lượt**\n` +
          `• Trạng thái đơn: \`${updated.status}\``,
        ephemeral: true
      });
    }
  },

  async autocomplete(interaction) {
    return interaction.respond([]).catch(() => {});
  }
};
