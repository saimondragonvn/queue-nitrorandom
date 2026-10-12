const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../database');
const { getConfig, getGuildEffectiveConfig } = require('../config');
const upstreamBridge = require('../services/upstreamBridge');

function checkIsAdmin(interaction, config) {
  const ownerId = process.env.OWNER_ID || config.ownerId;
  if (ownerId && interaction.user.id === ownerId) return true;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('[Chủ Server] Bảng điều khiển, cẩm nang quản trị và hướng dẫn vận hành bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('help')
        .setDescription('Xem cẩm nang hướng dẫn đầy đủ từ A-Z dành cho Chủ Server')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Kiểm tra trạng thái Key, Token shop gốc, số dư và kênh hoạt động')
    ),

  async execute(interaction) {
    const config = getConfig();
    if (!checkIsAdmin(interaction, config)) {
      return interaction.reply({
        content: '❌ Lệnh này chỉ dành riêng cho Chủ Server (Server Owner) và Quản trị viên!',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const guildCfg = db.getGuildConfig(guildId);
    const effCfg = getGuildEffectiveConfig(guildId);

    // 1. /owner help (Cẩm nang quản trị)
    if (subcommand === 'help') {
      const guideEmbed = new EmbedBuilder()
        .setTitle(`👑 CẨM NANG VẬN HÀNH DÀNH CHO CHỦ SERVER (${effCfg.shop.name})`)
        .setColor('#5865F2')
        .setDescription(
          `Chào mừng bạn đến với hệ thống Nitro Random Bot! Dưới đây là toàn bộ hướng dẫn giúp bạn làm chủ cửa hàng:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 **BƯỚC 1: CẤU HÌNH LIÊN KẾT SHOP GỐC (BẮT BUỘC)**\n` +
          `• Dùng lệnh \`/upstream token token:<token_của_bạn>\`\n` +
          `• **Mục đích:** Cung cấp token tài khoản Discord của bạn (acc đã có sẵn trong shop gốc và có credit).\n` +
          `• Khi khách trong server của bạn mua hàng, bot sẽ dùng acc này để nộp đơn tự động sang shop gốc.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎨 **BƯỚC 2: CÁ NHÂN HÓA THƯƠNG HIỆU & BẢNG GIÁ**\n` +
          `• \`/settings profile\` — Sửa tên shop, ảnh banner Nitro, logo shop, text vouch.\n` +
          `• \`/settings image\` — Cài ảnh banner queue realtime hoặc ảnh mã VietQR riêng.\n` +
          `• \`/settings payment\` — Đổi STK ngân hàng, tên chủ tài khoản nhận tiền.\n` +
          `• \`/settings package-add\` / \`/settings package-remove\` — Thêm/bớt gói nạp xu.\n` +
          `• \`/setup build\` — Tự động tạo lại toàn bộ 10 kênh nếu bạn lỡ xóa kênh nào.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 **BƯỚC 3: QUẢN LÝ TÀI CHÍNH & BÁN HÀNG**\n` +
          `• \`/key create credits:<số_xu> count:<số_lượng>\` — Tạo key nạp credit bán cho khách.\n` +
          `• \`/bank add user:<@khách> amount:<số_xu>\` — Cộng xu trực tiếp vào ví của khách.\n` +
          `• \`/bank confirm code:<mã_nap>\` — Duyệt đơn nạp tiền VietQR khi khách đã chuyển khoản.\n` +
          `• \`/bank check user:<@khách>\` — Tra cứu số dư và các đơn đang chạy của khách.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔒 **BẢO MẬT & THÔNG BÁO TỰ ĐỘNG:**\n` +
          `• Mọi token của khách đều được **mã hóa chuẩn quân sự AES-256** và ẩn dạng \`••••1234\`.\n` +
          `• Toàn bộ biến động (đơn mới, token chết hoàn tiền, trúng Nitro, lỗi shop gốc) đều được báo trực tiếp về kênh <#${effCfg.channels.ownerLogChannelId || 'owner-logs'}>.`
        )
        .setFooter({ text: `${effCfg.shop.name} • Cẩm nang vận hành dành riêng cho Owner` })
        .setTimestamp();

      const btnUpstream = new ButtonBuilder()
        .setCustomId('btn_owner_cfg_upstream')
        .setLabel('🔗 Cài Token Shop Gốc')
        .setStyle(ButtonStyle.Primary);

      const btnProfile = new ButtonBuilder()
        .setCustomId('btn_owner_cfg_profile')
        .setLabel('🎨 Đổi Tên Shop & Banner')
        .setStyle(ButtonStyle.Secondary);

      const btnCreateKey = new ButtonBuilder()
        .setCustomId('btn_owner_create_key')
        .setLabel('🔑 Tạo Key Bán Khách')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(btnUpstream, btnProfile, btnCreateKey);

      return interaction.reply({ embeds: [guideEmbed], components: [row], ephemeral: true });
    }

    // 2. /owner status (Kiểm tra trạng thái)
    if (subcommand === 'status') {
      const act = db.getGuildLicenseInfo(guildId);
      const isAct = db.isGuildActivated(guildId);

      const statusEmbed = new EmbedBuilder()
        .setTitle(`📊 TRẠNG THÁI VẬN HÀNH MÁY CHỦ: ${interaction.guild.name}`)
        .setColor(isAct ? '#57F287' : '#ED4245')
        .addFields(
          {
            name: '🔑 Bản quyền Bot',
            value: isAct
              ? `✅ **Đang hoạt động** (Key: \`${act?.key || 'N/A'}\`${act?.expiresAt ? ` - Hạn: <t:${Math.floor(new Date(act.expiresAt).getTime() / 1000)}:R>` : ' - Vĩnh viễn'})`
              : '❌ **Chưa kích hoạt** (Dùng `/activate key:<key>`)',
            inline: false
          },
          {
            name: '🔗 Tài khoản Shop Gốc (Upstream)',
            value: guildCfg.upstreamToken
              ? `✅ **Đã kết nối:** \`${guildCfg.upstreamUserTag || 'Tài khoản Discord riêng'}\`\n• Token: \`••••••••••••${guildCfg.upstreamToken.slice(-4)}\``
              : (config.upstream?.userToken ? `ℹ️ Đang dùng tài khoản sỉ mặc định của hệ thống (\`${config.upstream.userToken.slice(-4)}\`)` : '⚠️ **Chưa cài đặt!** (Dùng `/upstream token`)'),
            inline: false
          },
          {
            name: '🏪 Thương hiệu hiển thị',
            value: `• Tên shop: **${effCfg.shop.name}**\n• Màu chủ đạo: \`${effCfg.shop.primaryColor}\`\n• Logo: ${effCfg.shop.avatarUrl ? `[Xem ảnh](${effCfg.shop.avatarUrl})` : 'Mặc định'}\n• Banner: ${effCfg.shop.bannerUrl ? `[Xem ảnh](${effCfg.shop.bannerUrl})` : 'Mặc định'}`,
            inline: true
          },
          {
            name: '💳 Ngân hàng VietQR',
            value: `• Ngân hàng: **${effCfg.bank.bankId}**\n• Số tài khoản: \`${effCfg.bank.accountNo}\`\n• Chủ tài khoản: **${effCfg.bank.accountName}**`,
            inline: true
          },
          {
            name: '📡 Kênh & Role hệ thống',
            value:
              `• Kênh Claims: <#${effCfg.channels.claimLogChannelId || 'Chưa cài'}>\n` +
              `• Role Ping Claim: <@&${effCfg.channels.claimPingRoleId || 'Chưa cài'}>\n` +
              `• Kênh Queue: <#${effCfg.channels.queueChannelId || 'Chưa cài'}>\n` +
              `• Kênh Bảng giá: <#${effCfg.channels.priceChannelId || 'Chưa cài'}>\n` +
              `• Kênh Owner Logs: <#${effCfg.channels.ownerLogChannelId || 'Chưa cài'}>`,
            inline: false
          }
        )
        .setFooter({ text: `File cấu hình riêng: data/guilds/${guildId}.json` })
        .setTimestamp();

      return interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    }
  }
};
