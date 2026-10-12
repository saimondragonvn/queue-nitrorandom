const { SlashCommandBuilder } = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const { buildLeaderboardEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Xem bảng xếp hạng credit của các thành viên trong shop'),

  async execute(interaction) {
    const config = getConfig();
    const topUsers = db.getLeaderboard(interaction.guildId, 10);
    const totalCredits = db.getTotalCreditsInSystem(interaction.guildId);
    const embed = buildLeaderboardEmbed(config, topUsers, totalCredits);

    return interaction.reply({ embeds: [embed] });
  }
};
