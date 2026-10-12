const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder
} = require('discord.js');
const db = require('../database');
const { getConfig } = require('../config');
const { formatDateTime } = require('../utils/helpers');

const OWNER_ID = process.env.OWNER_ID || '';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('license')
    .setDescription('[Chủ Bot] Quản lý tạo và phát mã kích hoạt bản quyền máy chủ')
    // 1. license create
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Tạo 1 mã kích hoạt bản quyền cho server mới')
        .addIntegerOption(opt =>
          opt
            .setName('days')
            .setDescription('Thời hạn bản quyền theo ngày (0 = Vĩnh viễn)')
            .setRequired(false)
            .setMinValue(0)
        )
        .addStringOption(opt =>
          opt
            .setName('note')
            .setDescription('Ghi chú (Ví dụ: Cấp cho shop Reseller Minh)')
            .setRequired(false)
        )
    )
    // 2. license bulk
    .addSubcommand(sub =>
      sub
        .setName('bulk')
        .setDescription('Tạo hàng loạt mã bản quyền và xuất file .txt')
        .addIntegerOption(opt =>
          opt
            .setName('count')
            .setDescription('Số lượng mã cần tạo')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(50)
        )
        .addIntegerOption(opt =>
          opt
            .setName('days')
            .setDescription('Thời hạn bản quyền theo ngày (0 = Vĩnh viễn)')
            .setRequired(false)
            .setMinValue(0)
        )
        .addStringOption(opt =>
          opt
            .setName('note')
            .setDescription('Ghi chú chung')
            .setRequired(false)
        )
    )
    // 3. license list
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Xem danh sách các mã kích hoạt đã tạo')
        .addStringOption(opt =>
          opt
            .setName('status')
            .setDescription('Trạng thái mã cần xem')
            .setRequired(false)
            .addChoices(
              { name: 'Chưa dùng (Mặc định)', value: 'unused' },
              { name: 'Tất cả mã', value: 'all' }
            )
        )
    )
    // 4. license revoke
    .addSubcommand(sub =>
      sub
        .setName('revoke')
        .setDescription('Thu hồi bản quyền của 1 mã hoặc 1 Server ID')
        .addStringOption(opt =>
          opt
            .setName('target')
            .setDescription('Mã key (LIC-MK-...) hoặc Server ID cần thu hồi')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const config = getConfig();
    const configuredOwner = process.env.OWNER_ID || config.ownerId || OWNER_ID;

    // BẢO MẬT: Chỉ DUY NHẤT Bot Owner mới có quyền tạo license!
    if (interaction.user.id !== configuredOwner) {
      return interaction.reply({
        content: `❌ **Quyền truy cập bị từ chối!**\nLệnh này CHỈ DÀNH RIÊNG cho Chủ sở hữu Bot (<@${configuredOwner}>) để kiểm soát việc kích hoạt bot trên các server.`,
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    // 1. Tạo 1 key
    if (subcommand === 'create') {
      const days = interaction.options.getInteger('days') ?? 0;
      const note = interaction.options.getString('note') || 'Cấp bởi Owner';

      const license = db.createLicenseKey({
        days,
        note,
        createdBy: interaction.user.id
      });

      const durationStr = days === 0 ? '♾️ Vĩnh viễn (Lifetime)' : `${days} ngày`;

      return interaction.reply({
        content:
          `🎉 **ĐÃ TẠO MÃ BẢN QUYỀN SERVER THÀNH CÔNG!**\n\n` +
          `• Mã key: \`${license.code}\`\n` +
          `• Thời hạn: **${durationStr}**\n` +
          `• Ghi chú: *${license.note}*\n\n` +
          `👉 Gửi mã này cho chủ server và bảo họ gõ: \`/activate key: ${license.code}\``,
        ephemeral: true
      });
    }

    // 2. Tạo hàng loạt key
    if (subcommand === 'bulk') {
      const count = interaction.options.getInteger('count');
      const days = interaction.options.getInteger('days') ?? 0;
      const note = interaction.options.getString('note') || 'Cấp hàng loạt bởi Owner';

      const list = db.generateBatchLicenseKeys({
        count,
        days,
        note,
        createdBy: interaction.user.id
      });

      const textContent = list.map(l => `${l.code} | Hạn: ${l.days === 0 ? 'Vĩnh viễn' : `${l.days} ngày`} | Note: ${l.note}`).join('\r\n');
      const buffer = Buffer.from(textContent, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, {
        name: `licenses_${count}x_${Date.now()}.txt`
      });

      return interaction.reply({
        content: `🎉 Đã tạo thành công **${count} mã bản quyền**! Danh sách chi tiết trong tệp đính kèm bên dưới:`,
        files: [attachment],
        ephemeral: true
      });
    }

    // 3. Xem danh sách key
    if (subcommand === 'list') {
      const status = interaction.options.getString('status') || 'unused';
      const licenses = db.listLicenses(status === 'unused');

      if (!licenses.length) {
        return interaction.reply({
          content: `ℹ️ Hiện tại không có mã bản quyền nào (${status === 'unused' ? 'chưa dùng' : 'trong hệ thống'}).`,
          ephemeral: true
        });
      }

      const lines = licenses.slice(0, 15).map((l, i) => {
        const usedInfo = l.isUsed
          ? ` (Đã dùng tại **${l.usedByGuildName || l.usedByGuild}**)`
          : ' (✅ Sẵn sàng)';
        const daysInfo = l.days === 0 ? 'Vĩnh viễn' : `${l.days} ngày`;
        return `\`#${i + 1}\` \`${l.code}\` — [${daysInfo}]${usedInfo} — *${l.note}*`;
      });

      return interaction.reply({
        content:
          `📋 **Danh sách mã bản quyền (${licenses.length} mã):**\n\n` +
          `${lines.join('\n')}` +
          (licenses.length > 15 ? `\n*...và ${licenses.length - 15} mã khác.*` : ''),
        ephemeral: true
      });
    }

    // 4. Thu hồi key / hủy kích hoạt server
    if (subcommand === 'revoke') {
      const target = interaction.options.getString('target').trim();
      const success = db.revokeLicense(target);

      if (!success) {
        return interaction.reply({
          content: `❌ Không tìm thấy mã hoặc Server ID \`${target}\` để thu hồi!`,
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `🛑 **Đã thu hồi bản quyền của \`${target}\` thành công!** Server này sẽ không thể tiếp tục sử dụng bot cho đến khi được kích hoạt lại.`,
        ephemeral: true
      });
    }
  }
};
