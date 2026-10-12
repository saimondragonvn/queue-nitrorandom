const bankService = require('../services/bankService');
const { getConfig, getGuildEffectiveConfig } = require('../config');
const { buildDepositInvoiceEmbed } = require('../utils/embeds');

async function handleSelectMenuInteraction(interaction) {
  const { customId, values, user } = interaction;
  const config = interaction.guildId ? getGuildEffectiveConfig(interaction.guildId) : getConfig();

  // Chọn gói nạp (Ảnh 1 -> Ảnh 7)
  if (customId === 'select_pack_deposit') {
    const packId = values[0];
    const result = bankService.createDeposit(user.id, packId, interaction.guildId);

    if (!result.success) {
      return interaction.reply({
        content: `❌ ${result.message}`,
        ephemeral: true
      });
    }

    const { embeds, components } = buildDepositInvoiceEmbed(config, result.deposit);

    return interaction.reply({
      embeds,
      components,
      ephemeral: true
    });
  }
}

module.exports = { handleSelectMenuInteraction };
