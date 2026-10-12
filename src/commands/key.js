const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');

function checkIsAdmin(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('key')
    .setDescription('[Chủ shop] Quản lý tạo, phát mã đổi credit')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Tạo một mã đổi credit')
        .addIntegerOption(opt =>
          opt
            .setName('credits')
            .setDescription('Số credit của mã')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(opt =>
          opt
            .setName('code')
            .setDescription('Tự đặt mã code (để trống để bot tự tạo ngẫu nhiên)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('bulk')
        .setDescription('Tạo hàng loạt mã đổi credit và xuất file .txt')
        .addIntegerOption(opt =>
          opt
            .setName('credits')
            .setDescription('Số credit cho mỗi mã')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption(opt =>
          opt
            .setName('count')
            .setDescription('Số lượng mã cần tạo')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Xem lại các mã chưa dùng')
        .addStringOption(opt =>
          opt
            .setName('status')
            .setDescription('Trạng thái mã cần lọc')
            .setRequired(false)
            .addChoices(
              { name: 'Chưa dùng (Mặc định)', value: 'unused' },
              { name: 'Tất cả mã', value: 'all' }
            )
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

    const subcommand = interaction.options.getSubcommand();

    // 1. /key create credits: [code:]
    if (subcommand === 'create') {
      const credits = interaction.options.getInteger('credits');
      let code = interaction.options.getString('code');

      if (!code) {
        code = `KEY-${credits}X-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      }

      const item = db.createKey({
        code,
        credits,
        guildId: interaction.guildId,
        createdBy: interaction.user.id
      });
      return interaction.reply({
        content: `✅ Đã tạo thành công mã: \`${item.code}\` (**${item.credits} credit**) cho máy chủ **${interaction.guild?.name || 'này'}**!`,
        ephemeral: true
      });
    }

    // 2. /key bulk credits: count: (Trả file .txt)
    if (subcommand === 'bulk') {
      const credits = interaction.options.getInteger('credits');
      const count = interaction.options.getInteger('count');

      const createdKeys = db.generateBatchKeys(count, credits, interaction.guildId, interaction.user.id);
      const textContent = createdKeys.map(k => k.code).join('\r\n');

      const buffer = Buffer.from(textContent, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, {
        name: `keys_${count}x_${credits}credit_${Date.now()}.txt`
      });

      return interaction.reply({
        content: `🎉 Đã tạo thành công **${count} mã** (mỗi mã **${credits} credit**) cho máy chủ **${interaction.guild?.name || 'này'}**! Tệp đính kèm danh sách mã bên dưới:`,
        files: [attachment],
        ephemeral: true
      });
    }

    // 3. /key list [status:]
    if (subcommand === 'list') {
      const status = interaction.options.getString('status') || 'unused';
      const keys = db.listKeys(interaction.guildId, status === 'unused');

      if (!keys.length) {
        return interaction.reply({
          content: `ℹ️ Hiện tại không có mã key nào (${status === 'unused' ? 'chưa dùng' : 'trong máy chủ này'}).`,
          ephemeral: true
        });
      }

      const totalCredits = keys.reduce((acc, k) => acc + (k.credits || 0), 0);
      const lines = keys.slice(0, 20).map((k, i) => {
        const usedTag = k.isUsed ? ` (Đã dùng bởi <@${k.usedBy}>)` : '';
        return `\`#${i + 1}\` \`${k.code}\` — **${k.credits} credit**${usedTag}`;
      });

      return interaction.reply({
        content:
          `🔑 **Danh sách mã tại ${interaction.guild?.name || 'máy chủ này'} (${keys.length} mã, tổng ${totalCredits} credit):**\n\n` +
          `${lines.join('\n')}` +
          (keys.length > 20 ? `\n*...và ${keys.length - 20} mã khác.*` : ''),
        ephemeral: true
      });
    }
  }
};
