const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const { buildStatsEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Xem thống kê Nitro shop đã săn được'),

  async execute(interaction) {
    const config = getConfig();
    const stats = db.getGuildStats(interaction.guildId);
    const embed = buildStatsEmbed(config, stats);

    return interaction.reply({ embeds: [embed] });
  }
};
