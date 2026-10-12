const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const { formatDateTime } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activate')
    .setDescription('Kích hoạt bản quyền hệ thống cho server này bằng mã cấp từ Owner')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Mã bản quyền (ví dụ: LIC-MK-XXXX-YYYY)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Lệnh này chỉ thực hiện được trong Server!', ephemeral: true });
    }

    const key = interaction.options.getString('key').trim();
    const config = getConfig();

    const res = db.activateGuildWithKey(
      interaction.guild.id,
      interaction.guild.name,
      interaction.user.id,
      key
    );

    if (!res.success) {
      return interaction.reply({
        content: `❌ **Kích hoạt thất bại!**\n• ${res.message}`,
        ephemeral: true
      });
    }

    const { license, expiresAt } = res;
    const durationText = license.days === 0
      ? '♾️ **Vĩnh viễn (Lifetime)**'
      : `**${license.days} ngày** (Hết hạn lúc: ${formatDateTime(expiresAt)})`;

    // Tự động tạo kênh riêng cho Server Owner
    const ownerLogService = require('../services/ownerLogService');
    ownerLogService.ensureOwnerLogChannel(interaction.guild).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('🎉 KÍCH HOẠT BẢN QUYỀN MÁY CHỦ THÀNH CÔNG!')
      .setColor('#57F287')
      .setDescription(
        `Chúc mừng máy chủ **${interaction.guild.name}** đã kích hoạt bản quyền hệ thống Nitro Random thành công!\n\n` +
        `• 🔑 **Mã bản quyền:** \`${license.code}\`\n` +
        `• ⏱️ **Thời hạn:** ${durationText}\n` +
        `• 👤 **Người kích hoạt:** <@${interaction.user.id}>\n` +
        `• 📝 **Ghi chú:** *${license.note}*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👉 **CÁC BƯỚC TIẾP THEO ĐỂ HOÀN TẤT SETUP:**\n` +
        `1. **Cài token shop gốc:** \`/upstream token token:<token_acc_gốc>\` (để bot dùng nộp đơn & trừ xu ở shop gốc).\n` +
        `2. **Đổi tên shop & bảng giá:** \`/settings profile\` & \`/settings package-add\`.\n` +
        `3. **Tạo trọn bộ 10 kênh & Role:** \`/setup build\`.\n` +
        `4. **Vào kênh riêng quản trị:** Đến kênh \`🔒-.-owner-logs-.-▨\` và gõ \`/owner help\` để bắt đầu!`
      )
      .setFooter({ text: `Cấu hình lưu riêng tại file: data/guilds/${interaction.guild.id}.json` });

    return interaction.reply({ embeds: [embed] });
  }
};
