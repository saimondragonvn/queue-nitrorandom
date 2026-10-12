const { SlashCommandBuilder } = require('discord.js');
const queueService = require('../services/queueService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('newtoken')
    .setDescription('Đổi token mới cho đơn bị token chết, giữ nguyên số lượt còn lại')
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

    await interaction.deferReply({ ephemeral: true });

    const result = await queueService.updateDeadToken(interaction.client, interaction.user.id, newToken);
    if (!result.success) {
      return interaction.editReply({
        content: `❌ ${result.message}`
      });
    }

    return interaction.editReply({
      content: `✅ ${result.message}`
    });
  }
};
