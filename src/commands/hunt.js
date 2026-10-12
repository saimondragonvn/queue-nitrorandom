const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../config');
const sniperService = require('../services/sniperService');

function checkIsAdmin(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hunt')
    .setDescription('[Chủ shop] Săn Nitro hoặc giả lập claim Nitro để kiểm tra hệ thống (Ảnh 10, 11)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('simulate')
        .setDescription('Kích hoạt giả lập một lượt săn trúng Nitro cho đơn đầu hàng đợi')
        .addStringOption(opt =>
          opt
            .setName('nitro_type')
            .setDescription('Loại Nitro săn được')
            .setRequired(false)
            .addChoices(
              { name: 'Nitro Basic – Tháng', value: 'Nitro Basic – Tháng' },
              { name: 'Nitro – Tháng (Boost)', value: 'Nitro – Tháng' }
            )
        )
        .addIntegerOption(opt =>
          opt
            .setName('speed_ms')
            .setDescription('Tốc độ claim tính bằng mili-giây (ví dụ: 3930 hoặc 4366)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('order_id')
            .setDescription('Mã đơn muốn trao quà (để trống để lấy đơn đầu hàng đợi)')
            .setRequired(false)
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

    const nitroType = interaction.options.getString('nitro_type') || 'Nitro Basic – Tháng';
    const speedMs = interaction.options.getInteger('speed_ms') || Math.floor(3500 + Math.random() * 1500);
    const orderId = interaction.options.getString('order_id');

    // Chạy xử lý claim qua sniperService
    const result = await sniperService.handleClaim(interaction.client, {
      orderId,
      nitroType,
      speedMs,
      giftCode: `https://discord.gift/${Math.random().toString(36).substring(2, 18)}`
    });

    if (!result.success) {
      // Nếu hàng đợi trống, tự động chuyển sang chế độ Test Claim
      const testRes = await sniperService.handleTestClaim(interaction.client, {
        guildId: interaction.guildId,
        user: interaction.user,
        nitroType,
        speedMs
      });

      if (!testRes.success) {
        return interaction.reply({
          content: `❌ ${testRes.channelError || result.message}`,
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `🎯 **Hàng đợi đang trống — Đã tự động kích hoạt Test Claim vào kênh <#${testRes.targetChannelId}>!**\n• Loại: **${nitroType}** (${speedMs}ms)\n• Role Ping: ${testRes.targetPingRoleId ? `<@&${testRes.targetPingRoleId}>` : '*Chưa cài*'}\n• Đã gửi thông báo chúc mừng & cập nhật bảng theo dõi.`,
        embeds: [testRes.embed],
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `🎯 **Đã kích hoạt giả lập săn Nitro thành công!**\n• Loại: **${nitroType}** (${speedMs}ms)\n• Đã gửi thông báo chúc mừng & cập nhật bảng theo dõi (Ảnh 10 & 11).`,
      embeds: [result.embed],
      ephemeral: true
    });
  }
};
