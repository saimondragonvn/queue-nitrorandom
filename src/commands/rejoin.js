const { SlashCommandBuilder } = require('discord.js');
const queueService = require('../services/queueService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rejoin')
    .setDescription('Tiếp tục đơn hàng bị lỗi token (trừ lại credit đã hoàn và giữ nguyên vị trí cũ)')
    .addStringOption(opt =>
      opt
        .setName('token')
        .setDescription('Token tài khoản Discord mới')
        .setRequired(true)
    ),

  async execute(interaction) {
    const newToken = interaction.options.getString('token').trim();

    if (!newToken || newToken.length < 20) {
      return interaction.reply({
        content: '❌ Token Discord mới không hợp lệ! Vui lòng thử lại.',
        ephemeral: true
      });
    }

    const { checkDiscordTokenAlive } = require('../utils/helpers');
    const tokenCheck = await checkDiscordTokenAlive(newToken);

    if (!tokenCheck.alive) {
      return interaction.reply({
        content: '❌ **Token mới không hoạt động (Dead/Invalid Token)!** Vui lòng kiểm tra lại.',
        ephemeral: true
      });
    }

    if (!tokenCheck.hasPhone) {
      return interaction.reply({
        content:
          `❌ **Tài khoản Discord mới bắt buộc phải liên kết Số Điện Thoại (SĐT)!**\n\n` +
          `Tài khoản **${tokenCheck.user?.username || 'mới'}** chưa có số điện thoại. Vui lòng thêm SĐT vào tài khoản trước khi nhập lại token nhé!`,
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await queueService.updateDeadToken(interaction.client, interaction.user.id, newToken);
    if (!result.success) {
      return interaction.editReply({
        content: `❌ ${result.message}`
      });
    }

    const { getConfig } = require('../config');
    const config = getConfig();
    const upstreamBridge = require('../services/upstreamBridge');

    if (config.upstream?.enabled && upstreamBridge.isReady) {
      const upRes = await upstreamBridge.rejoinUpstreamQueue(newToken);
      if (upRes?.upstreamResponse?.embeds?.length) {
        const { sanitizeAndWhitelabelEmbed } = require('../utils/embeds');
        const db = require('../database');
        const user = db.getUser(interaction.user.id, interaction.guildId);
        const resolvedGuild = interaction.guild || (interaction.guildId ? interaction.client.guilds.cache.get(interaction.guildId) : null);
        const whitelabeled = sanitizeAndWhitelabelEmbed(
          upRes.upstreamResponse.embeds[0],
          resolvedGuild,
          config,
          { customerUser: interaction.user, customerBalance: user?.balance, client: interaction.client }
        );
        return interaction.editReply({ embeds: [whitelabeled] });
      }
    }

    return interaction.editReply({
      content: `✅ ${result.message}`
    });
  }
};
