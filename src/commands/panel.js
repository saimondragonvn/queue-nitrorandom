const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../config');
const { buildShopPanel, buildQueuePanel, buildStatsEmbed } = require('../utils/embeds');
const db = require('../database');

function checkIsAdmin(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('[Chủ shop] Gửi các bảng giao diện (Bảng nạp xu, Bảng hàng đợi Nitro)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('shop')
        .setDescription('Gửi bảng nạp credit / bảng giá kèm menu chọn gói (Ảnh 1)')
    )
    .addSubcommand(sub =>
      sub
        .setName('queue')
        .setDescription('Gửi bảng điều khiển Nitro Random kèm các nút bấm (Ảnh 2)')
    )
    .addSubcommand(sub =>
      sub
        .setName('stats')
        .setDescription('Gửi bảng thống kê số lượng Nitro đã săn được (Ảnh 9)')
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

    // 1. /panel shop (Ảnh 1)
    if (subcommand === 'shop') {
      const { embeds, components } = buildShopPanel(config);
      await interaction.channel.send({ embeds, components });
      return interaction.reply({
        content: '✅ Đã gửi bảng nạp xu (Shop Panel) thành công vào kênh này!',
        ephemeral: true
      });
    }

    // 2. /panel queue (Ảnh 2)
    if (subcommand === 'queue') {
      const { embeds, components } = buildQueuePanel(config);
      await interaction.channel.send({ embeds, components });
      return interaction.reply({
        content: '✅ Đã gửi bảng điều khiển hàng đợi (Nitro Random Queue Panel) thành công vào kênh này!',
        ephemeral: true
      });
    }

    // 3. /panel stats (Ảnh 9)
    if (subcommand === 'stats') {
      const stats = db.getStats();
      const embed = buildStatsEmbed(config, stats);
      await interaction.channel.send({ embeds: [embed] });
      return interaction.reply({
        content: '✅ Đã gửi bảng thống kê vào kênh này!',
        ephemeral: true
      });
    }
  }
};
