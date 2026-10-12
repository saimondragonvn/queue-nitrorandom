const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getConfig, getGuildEffectiveConfig } = require('../config');
const sniperService = require('../services/sniperService');

function checkIsAdmin(interaction, config) {
  const ownerId = process.env.OWNER_ID || config.ownerId;
  if (ownerId && interaction.user.id === ownerId) return true;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testclaim')
    .setDescription('[Quản trị] Gửi thông báo test săn được Nitro vào kênh #claims và ping role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Người nhận quà giả lập (để trống để chọn chính bạn)')
        .setRequired(false)
    )
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
        .setDescription('Tốc độ phản hồi săn được (ms) (ví dụ: 3850)')
        .setRequired(false)
        .setMinValue(500)
        .setMaxValue(20000)
    )
    .addIntegerOption(opt =>
      opt
        .setName('current_turn')
        .setDescription('Lượt đã săn (ví dụ: 1)')
        .setRequired(false)
        .setMinValue(1)
    )
    .addIntegerOption(opt =>
      opt
        .setName('total_turns')
        .setDescription('Tổng số lượt của đơn (ví dụ: 5)')
        .setRequired(false)
        .setMinValue(1)
    )
    .addChannelOption(opt =>
      opt
        .setName('channel')
        .setDescription('Kênh gửi thông báo (để trống để gửi vào kênh #claims đã cài đặt)')
        .setRequired(false)
    )
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Role được ping kèm (để trống để lấy role @Claim Ping đã cài đặt)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const config = getConfig();
    if (!checkIsAdmin(interaction, config)) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dành riêng cho Chủ Server và Quản trị viên!',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const nitroType = interaction.options.getString('nitro_type') || 'Nitro Basic – Tháng';
    const speedMs = interaction.options.getInteger('speed_ms') || Math.floor(3200 + Math.random() * 1200);
    const currentTurn = interaction.options.getInteger('current_turn') || 1;
    const totalTurns = Math.max(currentTurn, interaction.options.getInteger('total_turns') || 1);
    const customChannel = interaction.options.getChannel('channel');
    const customRole = interaction.options.getRole('role');

    const result = await sniperService.handleTestClaim(interaction.client, {
      guildId: interaction.guildId,
      user: targetUser,
      nitroType,
      speedMs,
      currentTurn,
      totalTurns,
      customChannelId: customChannel?.id || null,
      customRoleId: customRole?.id || null
    });

    if (!result.success) {
      return interaction.editReply({
        content:
          `❌ **Gửi test claim thất bại!**\n` +
          `• Nguyên nhân: \`${result.channelError || 'Không rõ lỗi'}\`\n\n` +
          `👉 *Gợi ý: Dùng lệnh \`/setup build\` để tự động tạo kênh \`#claims\` và role \`@Claim Ping\`, hoặc gõ \`/settings channel type:claimLogChannelId\` để chọn kênh.*`
      });
    }

    const reportEmbed = new EmbedBuilder()
      .setTitle('🎉 GỬI THÔNG BÁO TEST CLAIM THÀNH CÔNG!')
      .setColor('#57F287')
      .setDescription(
        `Đã kích hoạt gửi thử nghiệm thông báo săn trúng Nitro trực tiếp vào hệ thống:\n\n` +
        `• 📢 **Kênh gửi:** <#${result.targetChannelId}>\n` +
        `• 🔔 **Role được ping:** ${result.targetPingRoleId ? `<@&${result.targetPingRoleId}>` : '*Chưa cài đặt*'}\n` +
        `• 👤 **Khách nhận quà:** <@${targetUser.id}>\n` +
        `• ✨ **Phần thưởng:** **${nitroType}** (\`${speedMs}ms\`)\n` +
        `• 🎯 **Tiến độ lượt:** \`${currentTurn}/${totalTurns} lượt\`\n` +
        `• 📩 **Tin nhắn DM:** ${result.dmSent ? '✅ Đã gửi tin nhắn riêng cho khách' : '⚠️ Khách tắt DM hoặc bot không gửi được'}\n` +
        `• 🔒 **Nhật ký Owner:** Đã đồng bộ sang kênh \`owner-logs\`\n\n` +
        `*Bạn có thể qua kênh <#${result.targetChannelId}> để xem giao diện hiển thị thực tế!*`
      )
      .setFooter({ text: `Server: ${interaction.guild?.name || 'Local'} • Nitro Random Bot System` })
      .setTimestamp();

    return interaction.editReply({
      embeds: [reportEmbed, result.embed]
    });
  }
};
