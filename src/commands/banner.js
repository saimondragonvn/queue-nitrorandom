const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getConfig, saveConfig } = require('../config');

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
    .setName('banner')
    .setDescription('[Người điều hành] Cài đặt ảnh banner queue, shop, mã QR bằng link')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // 1. set
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Cài đặt hoặc cập nhật link ảnh cho banner hoặc mã QR')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Loại hình ảnh cần cập nhật')
            .setRequired(true)
            .addChoices(
              { name: 'Banner bảng hàng đợi (Queue Panel)', value: 'queue_banner' },
              { name: 'Banner danh sách hàng đợi realtime (Queue Status)', value: 'queue_status_banner' },
              { name: 'Banner bảng nạp xu (Shop Panel)', value: 'shop_banner' },
              { name: 'Ảnh mã QR ngân hàng riêng (Custom QR)', value: 'custom_qr' },
              { name: 'Ảnh Avatar / Logo của shop', value: 'avatar' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('url')
            .setDescription('Link ảnh (bắt đầu bằng https:// hoặc http://)')
            .setRequired(true)
        )
    )
    // 2. remove
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Gỡ ảnh đã cài về mặc định')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Loại hình ảnh cần gỡ')
            .setRequired(true)
            .addChoices(
              { name: 'Banner bảng hàng đợi (Queue Panel)', value: 'queue_banner' },
              { name: 'Banner danh sách hàng đợi realtime (Queue Status)', value: 'queue_status_banner' },
              { name: 'Banner bảng nạp xu (Shop Panel)', value: 'shop_banner' },
              { name: 'Ảnh mã QR ngân hàng riêng (Custom QR)', value: 'custom_qr' },
              { name: 'Ảnh Avatar / Logo của shop', value: 'avatar' }
            )
        )
    )
    // 3. view
    .addSubcommand(sub =>
      sub
        .setName('view')
        .setDescription('Xem toàn bộ danh sách link ảnh và banner hiện tại')
    ),

  async execute(interaction) {
    const config = getConfig();
    if (!checkIsAdmin(interaction, config)) {
      return interaction.reply({
        content: '❌ Bạn không có quyền sử dụng lệnh này! Chỉ người điều hành mới có quyền dùng.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    // 1. /banner set type: url:
    if (subcommand === 'set') {
      const type = interaction.options.getString('type');
      let url = interaction.options.getString('url').trim();

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return interaction.reply({
          content: '❌ Link ảnh không hợp lệ! Vui lòng nhập đường link bắt đầu bằng `https://` hoặc `http://`.',
          ephemeral: true
        });
      }

      if (!config.shop) config.shop = {};
      if (!config.bank) config.bank = {};

      let typeName = '';
      if (type === 'queue_banner') {
        config.shop.queueBannerUrl = url;
        typeName = 'Banner bảng điều khiển hàng đợi (Queue Panel)';
      } else if (type === 'queue_status_banner') {
        config.shop.queueStatusBannerUrl = url;
        typeName = 'Banner danh sách hàng đợi realtime (Queue Status)';
      } else if (type === 'shop_banner') {
        config.shop.bannerUrl = url;
        typeName = 'Banner bảng nạp xu (Shop Panel)';
      } else if (type === 'custom_qr') {
        config.bank.customQrUrl = url;
        typeName = 'Ảnh mã QR ngân hàng riêng';
      } else if (type === 'avatar') {
        config.shop.avatarUrl = url;
        typeName = 'Ảnh Avatar / Logo shop';
      }

      saveConfig(config);

      const embed = new EmbedBuilder()
        .setTitle('✅ ĐÃ CẬP NHẬT HÌNH ẢNH THÀNH CÔNG!')
        .setColor('#57F287')
        .setDescription(
          `• **Mục cài đặt:** ${typeName}\n` +
          `• **Link ảnh mới:** [Nhấn để xem](${url})\n\n` +
          `*Ảnh xem trước:*`
        )
        .setImage(url)
        .setFooter({ text: `${config.shop.name} • Cập nhật bởi ${interaction.user.tag}` });

      return interaction.reply({ embeds: [embed] });
    }

    // 2. /banner remove type:
    if (subcommand === 'remove') {
      const type = interaction.options.getString('type');
      let typeName = '';

      if (type === 'queue_banner') {
        delete config.shop.queueBannerUrl;
        typeName = 'Banner bảng hàng đợi (Queue Panel)';
      } else if (type === 'queue_status_banner') {
        delete config.shop.queueStatusBannerUrl;
        typeName = 'Banner danh sách hàng đợi realtime (Queue Status)';
      } else if (type === 'shop_banner') {
        delete config.shop.bannerUrl;
        typeName = 'Banner bảng nạp xu (Shop Panel)';
      } else if (type === 'custom_qr') {
        delete config.bank.customQrUrl;
        typeName = 'Ảnh mã QR ngân hàng riêng';
      } else if (type === 'avatar') {
        delete config.shop.avatarUrl;
        typeName = 'Ảnh Avatar / Logo shop';
      }

      saveConfig(config);

      return interaction.reply({
        content: `🗑️ **Đã gỡ bỏ link ảnh của [${typeName}] thành công!** Hệ thống sẽ quay về giao diện mặc định.`,
        ephemeral: true
      });
    }

    // 3. /banner view
    if (subcommand === 'view') {
      const embed = new EmbedBuilder()
        .setTitle('🖼️ DANH SÁCH HÌNH ẢNH & BANNER HIỆN TẠI')
        .setColor(config.shop.primaryColor || '#5865F2')
        .addFields(
          {
            name: '🏷️ Banner Bảng Nạp Xu (Shop)',
            value: config.shop.bannerUrl ? `[Xem ảnh](${config.shop.bannerUrl})` : '*Chưa đặt (Dùng mặc định)*',
            inline: false
          },
          {
            name: '📦 Banner Bảng Hàng Đợi (Queue Panel)',
            value: config.shop.queueBannerUrl ? `[Xem ảnh](${config.shop.queueBannerUrl})` : (config.shop.bannerUrl ? `*Dùng chung banner shop:* [Xem ảnh](${config.shop.bannerUrl})` : '*Chưa đặt*'),
            inline: false
          },
          {
            name: '📊 Banner Realtime Queue Status',
            value: config.shop.queueStatusBannerUrl ? `[Xem ảnh](${config.shop.queueStatusBannerUrl})` : '*Chưa đặt*',
            inline: false
          },
          {
            name: '💳 Mã QR Ngân Hàng',
            value: config.bank.customQrUrl ? `*QR Riêng:* [Xem ảnh](${config.bank.customQrUrl})` : '*Sử dụng VietQR tự động theo MBBank*',
            inline: false
          },
          {
            name: '👤 Logo / Avatar Shop',
            value: config.shop.avatarUrl ? `[Xem ảnh](${config.shop.avatarUrl})` : '*Chưa đặt*',
            inline: false
          }
        )
        .setFooter({ text: `${config.shop.name} • Dùng /banner set để thay đổi link ảnh` });

      if (config.shop.queueBannerUrl || config.shop.bannerUrl) {
        embed.setImage(config.shop.queueBannerUrl || config.shop.bannerUrl);
      }

      return interaction.reply({ embeds: [embed] });
    }
  }
};
