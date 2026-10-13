const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const db = require('../database');
const { getConfig, updateConfig, saveConfig } = require('../config');
const { formatVND, formatDateTime } = require('../utils/helpers');

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
    .setName('settings')
    .setDescription('[Chủ shop] Cài đặt hệ thống, tạm dừng, sale, ngân hàng, thương hiệu, gói nạp')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // 0. image (Cài ảnh banner queue, shop, QR link)
    .addSubcommand(sub =>
      sub
        .setName('image')
        .setDescription('Cài đặt hoặc gỡ link ảnh cho banner queue, shop, hoặc mã QR')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Loại hình ảnh')
            .setRequired(true)
            .addChoices(
              { name: 'Banner bảng hàng đợi (Queue Panel)', value: 'queue_banner' },
              { name: 'Banner danh sách hàng đợi realtime (Queue Status)', value: 'queue_status_banner' },
              { name: 'Banner bảng nạp xu (Shop Panel)', value: 'shop_banner' },
              { name: 'Ảnh mã QR ngân hàng riêng (Custom QR)', value: 'custom_qr' },
              { name: 'Ảnh Avatar / Logo shop', value: 'avatar' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('url')
            .setDescription('Link ảnh (hoặc gõ REMOVE để xóa về mặc định)')
            .setRequired(true)
        )
    )
    // 0. profile (Biểu mẫu tùy chỉnh thương hiệu riêng từng server)
    .addSubcommand(sub =>
      sub
        .setName('profile')
        .setDescription('Mở biểu mẫu sửa tên shop, avatar, banner, giới thiệu riêng cho server này')
    )
    // 0.2. emoji (Tùy chỉnh emoji cho hàng đợi & kênh claim)
    .addSubcommand(sub =>
      sub
        .setName('emoji')
        .setDescription('Tùy chỉnh emoji cho hàng đợi (Queue) và kênh thông báo săn được (Claim)')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Vị trí emoji cần tùy chỉnh')
            .setRequired(true)
            .addChoices(
              { name: 'Hàng đợi: Lượt hiện tại (Current Turn)', value: 'current_turn' },
              { name: 'Hàng đợi: Lượt đang chờ (Waiting Turn)', value: 'waiting_turn' },
              { name: 'Hàng đợi: Chế độ Ưu tiên (Priority / Boost)', value: 'priority' },
              { name: 'Hàng đợi: Khiên bảo vệ (Shield)', value: 'shield' },
              { name: 'Hàng đợi: Icon Discord (Discord Icon)', value: 'discord' },
              { name: 'Kênh Claim & Shop: Nitro Basic', value: 'nitro_basic' },
              { name: 'Kênh Claim & Shop: Nitro Boost', value: 'nitro_boost' },
              { name: 'Kênh Claim: Icon ăn mừng trúng quà (Celebrate)', value: 'celebrate' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('emoji')
            .setDescription('Emoji muốn dùng (Ví dụ: <a:fire:123>, 🔥, ✔) hoặc gõ DEFAULT để đặt lại mặc định')
            .setRequired(true)
        )
    )
    // 1. pause & resume
    .addSubcommand(sub =>
      sub
        .setName('pause')
        .setDescription('Tạm nghỉ nhận đơn mới')
    )
    .addSubcommand(sub =>
      sub
        .setName('resume')
        .setDescription('Mở bán lại bình thường')
    )
    // 2. sale group
    .addSubcommand(sub =>
      sub
        .setName('sale-start')
        .setDescription('Bắt đầu chạy sự kiện sale giảm giá')
        .addIntegerOption(opt =>
          opt
            .setName('discount_percent')
            .setDescription('Phần trăm giảm giá (%)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(99)
        )
        .addIntegerOption(opt =>
          opt
            .setName('duration_minutes')
            .setDescription('Thời gian chạy sale (phút)')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('sale-extend')
        .setDescription('Gia hạn thêm thời gian cho đợt sale hiện tại')
        .addIntegerOption(opt =>
          opt
            .setName('minutes')
            .setDescription('Số phút muốn gia hạn thêm')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('sale-next')
        .setDescription('Hẹn giờ chạy đợt sale nối tiếp')
        .addStringOption(opt =>
          opt
            .setName('start_time')
            .setDescription('Thời gian bắt đầu (Ví dụ: 2026-10-15 20:00 hoặc 1 giờ tới)')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('discount_percent')
            .setDescription('Phần trăm giảm giá (%)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(99)
        )
        .addIntegerOption(opt =>
          opt
            .setName('duration_minutes')
            .setDescription('Thời gian kéo dài (phút)')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('sale-stop')
        .setDescription('Dừng đợt sale đang diễn ra')
    )
    .addSubcommand(sub =>
      sub
        .setName('sale-status')
        .setDescription('Xem tình trạng đợt sale hiện tại')
    )
    // 3. channel
    .addSubcommand(sub =>
      sub
        .setName('channel')
        .setDescription('Chuyển một bảng sang kênh khác')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Loại bảng/kênh cần cài đặt')
            .setRequired(true)
            .addChoices(
              { name: 'Kênh hàng đợi (Queue)', value: 'queueChannelId' },
              { name: 'Kênh bảng giá (Price)', value: 'priceChannelId' },
              { name: 'Kênh thông báo săn được (Claim Log)', value: 'claimLogChannelId' },
              { name: 'Kênh vouch uy tín (Vouch)', value: 'vouchChannelId' }
            )
        )
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Kênh đích')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    // 4. payment
    .addSubcommand(sub =>
      sub
        .setName('payment')
        .setDescription('Sửa tài khoản nhận tiền chuyển khoản ngay trong Discord')
        .addStringOption(opt =>
          opt
            .setName('bank')
            .setDescription('Mã ngân hàng (TCB, MB, VCB, ICB, VPB, TPB...)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('account_no')
            .setDescription('Số tài khoản ngân hàng')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('account_name')
            .setDescription('Tên chủ tài khoản (in hoa không dấu)')
            .setRequired(true)
        )
    )
    // 5. brand
    .addSubcommand(sub =>
      sub
        .setName('brand')
        .setDescription('Sửa tên shop, ảnh banner ngay trong Discord')
        .addStringOption(opt =>
          opt
            .setName('name')
            .setDescription('Tên shop hiển thị')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('banner_url')
            .setDescription('Link ảnh banner Discord Nitro')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('logo_url')
            .setDescription('Link ảnh avatar / logo shop')
            .setRequired(false)
        )
    )
    // 6. package-add & package-remove
    .addSubcommand(sub =>
      sub
        .setName('package-add')
        .setDescription('Thêm một gói nạp credit mới')
        .addStringOption(opt =>
          opt
            .setName('id')
            .setDescription('Mã gói (ví dụ: pack_20)')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('credits')
            .setDescription('Số xu nhận được')
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption(opt =>
          opt
            .setName('price')
            .setDescription('Giá tiền VNĐ (ví dụ: 450000)')
            .setRequired(true)
            .setMinValue(1000)
        )
        .addStringOption(opt =>
          opt
            .setName('label')
            .setDescription('Tên hiển thị (Ví dụ: Gói 20 xu - 20 xu, giá 450.000đ)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('package-remove')
        .setDescription('Xóa một gói nạp theo mã ID')
        .addStringOption(opt =>
          opt
            .setName('id')
            .setDescription('Mã gói cần xóa (ví dụ: pack_1)')
            .setRequired(true)
        )
    )
    // 13. vouch (Gán kênh Vouch uy tín)
    .addSubcommand(sub =>
      sub
        .setName('vouch')
        .setDescription('Gán kênh Vouch uy tín hiển thị trên Bảng giá')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Kênh Vouch uy tín của máy chủ')
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption(opt =>
          opt
            .setName('text')
            .setDescription('Nội dung tùy chỉnh khác nếu không muốn theo mẫu')
            .setRequired(false)
        )
    )
    // 13.1 price-set
    .addSubcommand(sub =>
      sub
        .setName('price-set')
        .setDescription('Cài đặt hoặc sửa giá tiền trực tiếp cho gói nạp xu')
        .addStringOption(opt =>
          opt
            .setName('package')
            .setDescription('Chọn gói nạp cần đổi giá')
            .setRequired(true)
            .addChoices(
              { name: 'Gói 1 xu (pack_1)', value: 'pack_1' },
              { name: 'Gói 5 xu (pack_5)', value: 'pack_5' },
              { name: 'Gói 10 xu (pack_10)', value: 'pack_10' }
            )
        )
        .addIntegerOption(opt =>
          opt
            .setName('price')
            .setDescription('Giá tiền mới VNĐ (ví dụ: 20000)')
            .setRequired(true)
            .setMinValue(1000)
        )
        .addIntegerOption(opt =>
          opt
            .setName('credits')
            .setDescription('Số xu nhận được (tùy chọn, mặc định giữ nguyên)')
            .setRequired(false)
            .setMinValue(1)
        )
    )
    // 13.2 price-panel
    .addSubcommand(sub =>
      sub
        .setName('price-panel')
        .setDescription('Cập nhật / Đồng bộ ngay lập tức tin nhắn Bảng giá trong kênh nạp xu')
    )
    // 13.3 pricing-modal
    .addSubcommand(sub =>
      sub
        .setName('pricing-modal')
        .setDescription('Mở biểu mẫu trực quan chỉnh trọn bộ Giá 3 gói & Giảm giá Sale')
    )
    // 14. stats-reset
    .addSubcommand(sub =>
      sub
        .setName('stats-reset')
        .setDescription('Đặt lại toàn bộ thống kê săn Nitro về 0 để đếm các lượt thật')
    )
    // 15. stats-set
    .addSubcommand(sub =>
      sub
        .setName('stats-set')
        .setDescription('Tùy chỉnh số lượng thống kê theo ý muốn')
        .addIntegerOption(opt =>
          opt
            .setName('total_claims')
            .setDescription('Tổng số mã đã săn')
            .setRequired(true)
            .setMinValue(0)
        )
        .addIntegerOption(opt =>
          opt
            .setName('basic_count')
            .setDescription('Số mã Nitro Basic')
            .setRequired(true)
            .setMinValue(0)
        )
        .addIntegerOption(opt =>
          opt
            .setName('boost_count')
            .setDescription('Số mã Nitro Boost')
            .setRequired(true)
            .setMinValue(0)
        )
        .addIntegerOption(opt =>
          opt
            .setName('claims_today')
            .setDescription('Số mã săn trong ngày hôm nay')
            .setRequired(false)
            .setMinValue(0)
        )
    )
    // 16. content (Tùy chỉnh nội dung chữ của từng kênh)
    .addSubcommand(sub =>
      sub
        .setName('content')
        .setDescription('Tùy chỉnh nội dung văn bản chữ hiển thị ở từng kênh')
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Loại nội dung cần sửa')
            .setRequired(true)
            .addChoices(
              { name: 'Mô tả bảng hàng đợi (Queue Description)', value: 'queue_desc' },
              { name: 'Nội dung hướng dẫn lấy Token (Token Guide)', value: 'token_guide' },
              { name: 'Tiêu đề hướng dẫn (Guide Title)', value: 'guide_title' },
              { name: 'Nội dung hướng dẫn Ưu tiên (Priority Guide)', value: 'priority_guide' },
              { name: 'Nội dung kênh Vouch uy tín (Vouch Text)', value: 'vouch_text' }
            )
        )
        .addStringOption(opt =>
          opt
            .setName('text')
            .setDescription('Nội dung mới cần thay đổi')
            .setRequired(true)
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

    // 0. image (Cài ảnh banner queue, shop, QR link)
    if (subcommand === 'image') {
      const type = interaction.options.getString('type');
      let url = interaction.options.getString('url').trim();

      if (!config.shop) config.shop = {};
      if (!config.bank) config.bank = {};

      if (url.toUpperCase() === 'REMOVE' || url.toUpperCase() === 'DELETE' || url.toUpperCase() === 'NONE') {
        let typeName = '';
        if (type === 'queue_banner') { delete config.shop.queueBannerUrl; typeName = 'Banner bảng hàng đợi (Queue Panel)'; }
        else if (type === 'queue_status_banner') { delete config.shop.queueStatusBannerUrl; typeName = 'Banner hàng đợi realtime (Queue Status)'; }
        else if (type === 'shop_banner') { delete config.shop.bannerUrl; typeName = 'Banner bảng nạp xu (Shop Panel)'; }
        else if (type === 'custom_qr') { delete config.bank.customQrUrl; typeName = 'Ảnh mã QR ngân hàng riêng'; }
        else if (type === 'avatar') { delete config.shop.avatarUrl; typeName = 'Ảnh Avatar / Logo shop'; }

        saveConfig(config);
        return interaction.reply({
          content: `🗑️ **Đã gỡ bỏ link ảnh của [${typeName}] thành công!** Hệ thống sẽ quay về mặc định.`,
          ephemeral: true
        });
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return interaction.reply({
          content: '❌ Link ảnh không hợp lệ! Vui lòng nhập link bắt đầu bằng `https://` hoặc `http://` (hoặc gõ `REMOVE` để xóa).',
          ephemeral: true
        });
      }

      let typeName = '';
      if (type === 'queue_banner') { config.shop.queueBannerUrl = url; typeName = 'Banner bảng hàng đợi (Queue Panel)'; }
      else if (type === 'queue_status_banner') { config.shop.queueStatusBannerUrl = url; typeName = 'Banner hàng đợi realtime (Queue Status)'; }
      else if (type === 'shop_banner') { config.shop.bannerUrl = url; typeName = 'Banner bảng nạp xu (Shop Panel)'; }
      else if (type === 'custom_qr') { config.bank.customQrUrl = url; typeName = 'Ảnh mã QR ngân hàng riêng'; }
      else if (type === 'avatar') { config.shop.avatarUrl = url; typeName = 'Ảnh Avatar / Logo shop'; }

      saveConfig(config);

      if (interaction.guildId) {
        const update = {};
        if (type === 'queue_banner') update.queueBannerUrl = url;
        else if (type === 'queue_status_banner') update.queueStatusBannerUrl = url;
        else if (type === 'shop_banner') update.bannerUrl = url;
        else if (type === 'custom_qr') update.customQrUrl = url;
        else if (type === 'avatar') update.avatarUrl = url;
        db.setGuildConfig(interaction.guildId, update);
      }

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('✅ ĐÃ CẬP NHẬT HÌNH ẢNH THÀNH CÔNG!')
        .setColor('#57F287')
        .setDescription(
          `• **Mục:** ${typeName}\n` +
          `• **Link:** [Nhấn để xem](${url})\n\n` +
          `*Xem trước ảnh bên dưới:*`
        )
        .setImage(url)
        .setFooter({ text: `${config.shop.name} • Cập nhật bởi ${interaction.user.tag}` });

      return interaction.reply({ embeds: [embed] });
    }

    // 0.2. emoji
    if (subcommand === 'emoji') {
      const type = interaction.options.getString('type');
      let emojiInput = interaction.options.getString('emoji').trim();
      const isReset = ['DEFAULT', 'RESET', 'REMOVE', 'DELETE', 'NONE'].includes(emojiInput.toUpperCase());

      const defaults = {
        current_turn: '<a:hello_turn:1559210656228442122>',
        waiting_turn: '<a:loading_queue:1559210658669527091>',
        priority: '<a:boost_priority:1559210664642224241>',
        shield: '✔',
        discord: '<:discord_icon:1559210667712577578>',
        nitro_basic: '<a:nitrobasic1123:1559191128509522020>',
        nitro_boost: '<a:kendallzstore:1559191135254224956>',
        celebrate: '🎉'
      };

      const typeNames = {
        current_turn: 'Lượt hiện tại trong hàng đợi (Current Turn)',
        waiting_turn: 'Lượt đang chờ trong hàng đợi (Waiting Turn)',
        priority: 'Chế độ Ưu tiên (Priority)',
        shield: 'Khiên bảo vệ (Shield)',
        discord: 'Icon Discord tài khoản nhận quà',
        nitro_basic: 'Icon Nitro Basic (Kênh claim & Shop)',
        nitro_boost: 'Icon Nitro Boost (Kênh claim & Shop)',
        celebrate: 'Icon ăn mừng trúng quà (Kênh claim)'
      };

      let resolvedEmoji = emojiInput;
      let noteExternal = '';
      if (!isReset) {
        // Tự động phân giải nếu người dùng gõ emoji dạng name (:fire:, fire) hoặc ID (123456789)
        const nameMatch = emojiInput.match(/^:?([a-zA-Z0-9_~]+):?$/);
        const idMatch = emojiInput.match(/^(\d{17,20})$/);
        if (nameMatch || idMatch) {
          const searchKey = (nameMatch ? nameMatch[1] : idMatch[1]).toLowerCase();
          const found =
            interaction.guild?.emojis?.cache?.find(e => e.name.toLowerCase() === searchKey || e.id === searchKey) ||
            interaction.client?.emojis?.cache?.find(e => e.name.toLowerCase() === searchKey || e.id === searchKey);
          if (found) {
            resolvedEmoji = found.toString();
          }
        }

        // Kiểm tra nếu là custom emoji (<:name:id> hoặc <a:name:id>), kiểm tra xem bot có thể dùng được không
        const customEmojiMatch = resolvedEmoji.match(/<a?:[a-zA-Z0-9_]+:(\d+)>/);
        if (customEmojiMatch) {
          const emojiId = customEmojiMatch[1];
          const hasInClient = interaction.client?.emojis?.cache?.has(emojiId);
          if (!hasInClient) {
            noteExternal = `\n⚠️ *Lưu ý: Custom emoji này thuộc máy chủ mà Bot chưa tham gia. Nếu Bot chưa được mời vào server chứa emoji đó, Discord có thể không hiển thị được.*`;
          }
        }
      }

      const finalEmoji = isReset ? defaults[type] : resolvedEmoji;
      const typeName = typeNames[type] || type;

      // Lưu cho server hiện tại nếu chạy trong Guild
      if (interaction.guildId) {
        const guildCfg = db.getGuildConfig(interaction.guildId) || {};
        const qSettings = guildCfg.queueSettings || {};

        if (type === 'current_turn') {
          if (isReset) {
            delete qSettings.currentTurnEmoji;
            delete guildCfg.currentTurnEmoji;
          } else {
            qSettings.currentTurnEmoji = finalEmoji;
            guildCfg.currentTurnEmoji = finalEmoji;
          }
        } else if (type === 'waiting_turn') {
          if (isReset) {
            delete qSettings.waitingTurnEmoji;
            delete guildCfg.waitingTurnEmoji;
          } else {
            qSettings.waitingTurnEmoji = finalEmoji;
            guildCfg.waitingTurnEmoji = finalEmoji;
          }
        } else if (type === 'priority') {
          if (isReset) {
            delete qSettings.priorityEmoji;
            delete guildCfg.priorityEmoji;
          } else {
            qSettings.priorityEmoji = finalEmoji;
            guildCfg.priorityEmoji = finalEmoji;
          }
        } else if (type === 'shield') {
          if (isReset) {
            delete qSettings.shieldEmoji;
            delete guildCfg.shieldEmoji;
          } else {
            qSettings.shieldEmoji = finalEmoji;
            guildCfg.shieldEmoji = finalEmoji;
          }
        } else if (type === 'discord') {
          if (isReset) {
            delete qSettings.discordEmoji;
            delete guildCfg.discordEmoji;
          } else {
            qSettings.discordEmoji = finalEmoji;
            guildCfg.discordEmoji = finalEmoji;
          }
        } else if (type === 'nitro_basic') {
          if (isReset) delete guildCfg.nitroBasicEmoji;
          else guildCfg.nitroBasicEmoji = finalEmoji;
        } else if (type === 'nitro_boost') {
          if (isReset) delete guildCfg.nitroBoostEmoji;
          else guildCfg.nitroBoostEmoji = finalEmoji;
        } else if (type === 'celebrate') {
          if (isReset) delete guildCfg.celebrateEmoji;
          else guildCfg.celebrateEmoji = finalEmoji;
        }

        guildCfg.queueSettings = qSettings;
        db.setGuildConfig(interaction.guildId, guildCfg);
      } else {
        // Lưu global nếu là bot owner trong DM
        if (!config.queueSettings) config.queueSettings = {};
        if (!config.shop) config.shop = {};

        if (type === 'current_turn') config.queueSettings.currentTurnEmoji = isReset ? defaults.current_turn : finalEmoji;
        else if (type === 'waiting_turn') config.queueSettings.waitingTurnEmoji = isReset ? defaults.waiting_turn : finalEmoji;
        else if (type === 'priority') config.queueSettings.priorityEmoji = isReset ? defaults.priority : finalEmoji;
        else if (type === 'shield') config.queueSettings.shieldEmoji = isReset ? defaults.shield : finalEmoji;
        else if (type === 'discord') config.queueSettings.discordEmoji = isReset ? defaults.discord : finalEmoji;
        else if (type === 'nitro_basic') config.shop.nitroBasicEmoji = isReset ? defaults.nitro_basic : finalEmoji;
        else if (type === 'nitro_boost') config.shop.nitroBoostEmoji = isReset ? defaults.nitro_boost : finalEmoji;
        else if (type === 'celebrate') config.shop.celebrateEmoji = isReset ? defaults.celebrate : finalEmoji;

        saveConfig(config);
      }

      // Kích hoạt cập nhật bảng hàng đợi realtime ngay lập tức
      try {
        const updaterService = require('../services/updaterService');
        if (interaction.guild) {
          updaterService.updateGuildQueue(interaction.guild).catch(() => {});
        }
        updaterService.notifyQueueChanged(interaction.guildId);
      } catch (e) {}

      return interaction.reply({
        content:
          `✅ **ĐÃ CẬP NHẬT EMOJI THÀNH CÔNG!**\n\n` +
          `• Vị trí: **${typeName}**\n` +
          `• Emoji hiển thị: ${finalEmoji} (\`${finalEmoji}\`)\n` +
          (isReset ? `*(Đã đặt lại về emoji mặc định của hệ thống)*\n\n` : `\n`) +
          noteExternal +
          `📡 *Bảng hàng đợi realtime và kênh claim đã được đồng bộ với emoji mới ngay lập tức!*`,
        ephemeral: true
      });
    }

    // 0. profile (Biểu mẫu tùy chỉnh thương hiệu riêng từng server)
    if (subcommand === 'profile') {
      const guildId = interaction.guildId;
      const currentGuildCfg = db.getGuildConfig(guildId);

      const modal = new ModalBuilder()
        .setCustomId('modal_shop_profile')
        .setTitle('Cấu hình thương hiệu Server');

      const nameInput = new TextInputBuilder()
        .setCustomId('shop_name')
        .setLabel('Tên Shop hiển thị *')
        .setStyle(TextInputStyle.Short)
        .setValue(currentGuildCfg.name || config.shop?.name || '')
        .setPlaceholder('Ví dụ: MK SHOP / Super Kawaii')
        .setRequired(true);

      const avatarInput = new TextInputBuilder()
        .setCustomId('shop_avatar')
        .setLabel('Link Avatar / Logo Shop')
        .setStyle(TextInputStyle.Short)
        .setValue(currentGuildCfg.avatarUrl || config.shop?.avatarUrl || '')
        .setPlaceholder('https://...')
        .setRequired(false);

      const bannerInput = new TextInputBuilder()
        .setCustomId('shop_banner')
        .setLabel('Link Banner Shop')
        .setStyle(TextInputStyle.Short)
        .setValue(currentGuildCfg.bannerUrl || config.shop?.bannerUrl || '')
        .setPlaceholder('https://...')
        .setRequired(false);

      const descInput = new TextInputBuilder()
        .setCustomId('shop_desc')
        .setLabel('Mô tả / Giới thiệu bảng Nitro Random')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(currentGuildCfg.description || config.content?.queuePanelDescription || '')
        .setPlaceholder('Nhập nội dung giới thiệu...')
        .setRequired(false);

      const vouchInput = new TextInputBuilder()
        .setCustomId('shop_vouch')
        .setLabel('Kênh Vouch hoặc lời nhắn uy tín')
        .setStyle(TextInputStyle.Short)
        .setValue(currentGuildCfg.vouchText || config.content?.vouchText || '')
        .setPlaceholder('Vouch uy tín tại kênh...')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(avatarInput),
        new ActionRowBuilder().addComponents(bannerInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(vouchInput)
      );

      return interaction.showModal(modal);
    }

    // 1. pause
    if (subcommand === 'pause') {
      db.setShopPaused(true);
      return interaction.reply({
        content: '⏸️ **Đã tạm nghỉ nhận đơn mới!** Khách hàng sẽ không thể vào hàng đợi lúc này.',
        ephemeral: true
      });
    }

    // 2. resume
    if (subcommand === 'resume') {
      db.setShopPaused(false);
      return interaction.reply({
        content: '▶️ **Đã mở bán lại bình thường!** Khách hàng có thể tiếp tục vào hàng đợi.',
        ephemeral: true
      });
    }

    // 3. sale-start
    if (subcommand === 'sale-start') {
      const discount = interaction.options.getInteger('discount_percent');
      const duration = interaction.options.getInteger('duration_minutes');
      const sale = db.startGuildSale(interaction.guildId, discount, duration);

      try {
        const updaterService = require('../services/updaterService');
        updaterService.notifyPricePanelChanged();
      } catch (e) {}

      return interaction.reply({
        content: `🎉 **Đã kích hoạt chương trình SALE giảm giá ${discount}% trong vòng ${duration} phút!** (Hết hạn lúc: ${formatDateTime(sale.expiresAt)}).\n👉 *Bảng giá trong kênh nạp xu đã được tự động cập nhật mức giá ưu đãi!*`,
        ephemeral: true
      });
    }

    // 4. sale-extend
    if (subcommand === 'sale-extend') {
      const minutes = interaction.options.getInteger('minutes');
      const sale = db.extendGuildSale(interaction.guildId, minutes);
      if (!sale) {
        return interaction.reply({ content: '❌ Hiện tại không có đợt sale nào đang chạy để gia hạn!', ephemeral: true });
      }

      try {
        const updaterService = require('../services/updaterService');
        updaterService.notifyPricePanelChanged();
      } catch (e) {}

      return interaction.reply({
        content: `⏱️ Đã gia hạn thêm **+${minutes} phút** cho đợt sale hiện tại! Hết hạn mới: ${formatDateTime(sale.expiresAt)}.`,
        ephemeral: true
      });
    }

    // 5. sale-next
    if (subcommand === 'sale-next') {
      const startTime = interaction.options.getString('start_time');
      const discount = interaction.options.getInteger('discount_percent');
      const duration = interaction.options.getInteger('duration_minutes');

      db.scheduleNextSale(startTime, discount, duration);
      return interaction.reply({
        content: `📅 Đã lên lịch hẹn đợt sale nối tiếp: **${startTime}** (Giảm **${discount}%** trong **${duration} phút**).`,
        ephemeral: true
      });
    }

    // 6. sale-stop
    if (subcommand === 'sale-stop') {
      db.stopGuildSale(interaction.guildId);
      try {
        const updaterService = require('../services/updaterService');
        updaterService.notifyPricePanelChanged();
      } catch (e) {}

      return interaction.reply({
        content: '🛑 **Đã dừng đợt sale thành công!**\n👉 *Bảng giá trong kênh nạp xu đã quay trở về giá gốc.*',
        ephemeral: true
      });
    }

    // 7. sale-status
    if (subcommand === 'sale-status') {
      const sale = db.getGuildSaleStatus(interaction.guildId);
      if (!sale.active) {
        return interaction.reply({
          content: 'ℹ️ Hiện tại **không có đợt sale nào** đang diễn ra.' + (sale.nextSale ? `\n• Đợt sale kế tiếp được hẹn vào: **${sale.nextSale.scheduledAt}** (Giảm ${sale.nextSale.discountPercent}% trong ${sale.nextSale.durationMinutes} phút).` : ''),
          ephemeral: true
        });
      }

      const minutesLeft = Math.max(0, Math.round((new Date(sale.expiresAt) - new Date()) / 60000));
      return interaction.reply({
        content:
          `🔥 **Đợt SALE đang diễn ra:**\n` +
          `• Mức giảm: **${sale.discountPercent}%**\n` +
          `• Thời gian còn lại: **${minutesLeft} phút**\n` +
          `• Hết hạn lúc: ${formatDateTime(sale.expiresAt)}`,
        ephemeral: true
      });
    }

    // 8. channel
    if (subcommand === 'channel') {
      const type = interaction.options.getString('type');
      const targetChannel = interaction.options.getChannel('channel');

      if (interaction.guildId) {
        db.setGuildConfig(interaction.guildId, { [type]: targetChannel.id });
      }
      config.channels[type] = targetChannel.id;
      saveConfig(config);

      if (type === 'priceChannelId' || type === 'vouchChannelId') {
        try {
          const updaterService = require('../services/updaterService');
          updaterService.notifyPricePanelChanged();
        } catch (e) {}
      }

      return interaction.reply({
        content: `✅ Đã thiết lập kênh cho \`${type}\` sang <#${targetChannel.id}> thành công cho Server này!`,
        ephemeral: true
      });
    }

    // 9. payment
    if (subcommand === 'payment') {
      const bank = interaction.options.getString('bank').toUpperCase();
      const accountNo = interaction.options.getString('account_no').trim();
      const accountName = interaction.options.getString('account_name').toUpperCase().trim();

      config.bank.bankId = bank;
      config.bank.accountNo = accountNo;
      config.bank.accountName = accountName;
      saveConfig(config);

      if (interaction.guildId) {
        db.setGuildConfig(interaction.guildId, {
          bank: { bankId: bank, accountNo, accountName }
        });
      }

      return interaction.reply({
        content:
          `✅ **Đã cập nhật thông tin nhận tiền thành công!**\n` +
          `• Ngân hàng: **${bank}**\n` +
          `• Số tài khoản: **${accountNo}**\n` +
          `• Chủ tài khoản: **${accountName}**\n` +
          `• Lưu riêng cho server tại file: \`data/guilds/${interaction.guildId}.json\``,
        ephemeral: true
      });
    }

    // 10. brand
    if (subcommand === 'brand') {
      const name = interaction.options.getString('name');
      const bannerUrl = interaction.options.getString('banner_url');
      const logoUrl = interaction.options.getString('logo_url');

      config.shop.name = name;
      if (bannerUrl) config.shop.bannerUrl = bannerUrl;
      if (logoUrl) config.shop.avatarUrl = logoUrl;
      saveConfig(config);

      if (interaction.guildId) {
        db.setGuildConfig(interaction.guildId, {
          name,
          bannerUrl: bannerUrl || undefined,
          avatarUrl: logoUrl || undefined
        });
      }

      return interaction.reply({
        content: `✅ Đã cập nhật thương hiệu: Tên shop **${name}** cho server này!`,
        ephemeral: true
      });
    }

    // 11. package-add
    if (subcommand === 'package-add') {
      const id = interaction.options.getString('id').trim();
      const credits = interaction.options.getInteger('credits');
      const price = interaction.options.getInteger('price');
      const label = interaction.options.getString('label');

      // Kiểm tra id đã tồn tại chưa
      const existing = config.pricing.packages.find(p => p.id === id);
      if (existing) {
        existing.credits = credits;
        existing.price = price;
        existing.label = label;
      } else {
        config.pricing.packages.push({
          id,
          credits,
          price,
          label,
          description: `${credits} xu, giá ${formatVND(price)}`
        });
      }
      saveConfig(config);

      if (interaction.guildId) {
        const guildCfg = db.getGuildConfig(interaction.guildId) || {};
        let gPackages = Array.isArray(guildCfg.packages) ? [...guildCfg.packages] : (Array.isArray(guildCfg.pricing?.packages) ? [...guildCfg.pricing.packages] : [...config.pricing.packages]);
        const gExisting = gPackages.find(p => p.id === id);
        if (gExisting) {
          gExisting.credits = credits;
          gExisting.price = price;
          gExisting.label = label;
          gExisting.description = `${credits} xu, giá ${formatVND(price)}`;
        } else {
          gPackages.push({
            id,
            credits,
            price,
            label,
            description: `${credits} xu, giá ${formatVND(price)}`
          });
        }
        db.setGuildConfig(interaction.guildId, { packages: gPackages });
      }

      try {
        const updaterService = require('../services/updaterService');
        updaterService.notifyPricePanelChanged();
      } catch (e) {}

      return interaction.reply({
        content: `✅ Đã thêm/cập nhật gói nạp \`${id}\`: **${credits} xu** - **${formatVND(price)}** riêng cho server này!\n👉 *Bảng giá tại kênh nạp xu đã được tự động chỉnh sửa theo gói mới!*`,
        ephemeral: true
      });
    }

    // 12. package-remove
    if (subcommand === 'package-remove') {
      const id = interaction.options.getString('id').trim();
      const index = config.pricing.packages.findIndex(p => p.id === id);

      if (index === -1) {
        return interaction.reply({ content: `❌ Không tìm thấy gói nạp có mã \`${id}\`!`, ephemeral: true });
      }

      config.pricing.packages.splice(index, 1);
      saveConfig(config);

      if (interaction.guildId) {
        const guildCfg = db.getGuildConfig(interaction.guildId) || {};
        let gPackages = Array.isArray(guildCfg.packages) ? [...guildCfg.packages] : (Array.isArray(guildCfg.pricing?.packages) ? [...guildCfg.pricing.packages] : [...config.pricing.packages]);
        gPackages = gPackages.filter(p => p.id !== id);
        db.setGuildConfig(interaction.guildId, { packages: gPackages });
      }

      try {
        const updaterService = require('../services/updaterService');
        updaterService.notifyPricePanelChanged();
      } catch (e) {}

      return interaction.reply({
        content: `✅ Đã xóa gói nạp \`${id}\` thành công khỏi server này!\n👉 *Bảng giá tại kênh nạp xu đã được cập nhật trực tiếp!*`,
        ephemeral: true
      });
    }

    // 13. vouch (Gán kênh Vouch uy tín)
    if (subcommand === 'vouch') {
      const channel = interaction.options.getChannel('channel');
      const customText = interaction.options.getString('text')?.trim();

      if (!channel && !customText) {
        return interaction.reply({
          content: '❌ Vui lòng chọn Kênh Vouch (`channel`) hoặc nhập nội dung tùy chỉnh (`text`)!',
          ephemeral: true
        });
      }

      const updates = {};
      let displayText = '';

      if (channel) {
        updates.vouchChannelId = channel.id;
        config.channels.vouchChannelId = channel.id;
      }

      const effectiveChannelId = channel ? channel.id : (interaction.guildId ? db.getGuildConfig(interaction.guildId).vouchChannelId : config.channels.vouchChannelId);

      if (customText) {
        displayText = customText;
      } else if (effectiveChannelId && effectiveChannelId !== '123456789012345678' && !effectiveChannelId.startsWith('123456')) {
        displayText = `Vouch: <#${effectiveChannelId}> · 『✅』`;
      } else {
        displayText = `Vouch: # ⊹˖ · 『✅』`;
      }

      updates.vouchText = displayText;
      if (!config.content) config.content = {};
      config.content.vouchText = displayText;
      saveConfig(config);

      if (interaction.guildId) {
        db.setGuildConfig(interaction.guildId, updates);
      }

      try {
        const updaterService = require('../services/updaterService');
        updaterService.notifyPricePanelChanged();
      } catch (e) {}

      return interaction.reply({
        content:
          `✅ **ĐÃ GÁN KÊNH VOUCH UY TÍN THÀNH CÔNG!**\n\n` +
          (channel ? `• Kênh vouch: <#${channel.id}>\n` : '') +
          `• Hiển thị trên Bảng giá: ${displayText}\n\n` +
          `👉 *Bảng giá trong kênh nạp xu đã được tự động chỉnh sửa trực tiếp!*`,
        ephemeral: true
      });
    }

    // 13.1 price-set
    if (subcommand === 'price-set') {
      const packId = interaction.options.getString('package');
      const newPrice = interaction.options.getInteger('price');
      const newCredits = interaction.options.getInteger('credits');

      const guildId = interaction.guildId;
      const guildCfg = guildId ? db.getGuildConfig(guildId) : {};
      let gPackages = Array.isArray(guildCfg.packages) ? [...guildCfg.packages] : [...config.pricing.packages];

      let targetPack = gPackages.find(p => p.id === packId);
      if (!targetPack) {
        const defPack = config.pricing.packages.find(p => p.id === packId);
        targetPack = {
          id: packId,
          credits: defPack?.credits || (packId === 'pack_1' ? 1 : (packId === 'pack_5' ? 5 : 10)),
          price: newPrice,
          label: defPack?.label || `Gói ${packId}`
        };
        gPackages.push(targetPack);
      }

      targetPack.price = newPrice;
      if (newCredits) targetPack.credits = newCredits;
      targetPack.label = `Gói ${targetPack.credits} xu - ${targetPack.credits} xu, giá ${formatVND(newPrice)}`;
      targetPack.description = `${targetPack.credits} xu, giá ${formatVND(newPrice)}`;

      if (guildId) {
        db.setGuildConfig(guildId, { packages: gPackages });
      }

      const basePack = config.pricing.packages.find(p => p.id === packId);
      if (basePack && !guildId) {
        basePack.price = newPrice;
        if (newCredits) basePack.credits = newCredits;
        basePack.label = targetPack.label;
        saveConfig(config);
      }

      try {
        const updaterService = require('../services/updaterService');
        updaterService.notifyPricePanelChanged();
      } catch (e) {}

      return interaction.reply({
        content: `✅ **ĐÃ ĐỔI GIÁ THÀNH CÔNG!**\n• Gói: **${targetPack.label}**\n• Giá mới: **${formatVND(newPrice)}**\n\n👉 *Bảng giá tại kênh nạp xu đã được cập nhật trực tiếp!*`,
        ephemeral: true
      });
    }

    // 13.2 price-panel
    if (subcommand === 'price-panel') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const updaterService = require('../services/updaterService');
        if (interaction.guild) {
          await updaterService.updateGuildPricePanel(interaction.guild, config);
        }
        return interaction.editReply({
          content: '✅ **Đã đồng bộ & cập nhật lại Bảng giá trong kênh nạp xu thành công!**'
        });
      } catch (err) {
        return interaction.editReply({
          content: `❌ Lỗi khi cập nhật bảng giá: ${err.message}`
        });
      }
    }

    // 13.3 pricing-modal
    if (subcommand === 'pricing-modal') {
      const effCfg = interaction.guildId ? require('../config').getGuildEffectiveConfig(interaction.guildId) : config;
      const packages = effCfg.pricing?.packages || [];
      const p1 = packages.find(p => p.id === 'pack_1') || { price: 25000 };
      const p5 = packages.find(p => p.id === 'pack_5') || { price: 120000 };
      const p10 = packages.find(p => p.id === 'pack_10') || { price: 230000 };
      const sale = db.getGuildSaleStatus(interaction.guildId);

      const modal = new ModalBuilder()
        .setCustomId('modal_owner_cfg_pricing')
        .setTitle('Cài đặt Giá & Giảm giá Shop');

      const p1Input = new TextInputBuilder()
        .setCustomId('price_pack_1')
        .setLabel('Giá Gói 1 xu (VNĐ)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(p1.price || 25000))
        .setRequired(true);

      const p5Input = new TextInputBuilder()
        .setCustomId('price_pack_5')
        .setLabel('Giá Gói 5 xu (VNĐ)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(p5.price || 120000))
        .setRequired(true);

      const p10Input = new TextInputBuilder()
        .setCustomId('price_pack_10')
        .setLabel('Giá Gói 10 xu (VNĐ)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(p10.price || 230000))
        .setRequired(true);

      const saleInput = new TextInputBuilder()
        .setCustomId('sale_percent')
        .setLabel('Giảm giá Sale (%) - Điền 0 nếu tắt sale')
        .setStyle(TextInputStyle.Short)
        .setValue(String(sale && sale.active ? sale.discountPercent : 0))
        .setRequired(false);

      const durationInput = new TextInputBuilder()
        .setCustomId('sale_duration')
        .setLabel('Thời gian Sale (phút)')
        .setStyle(TextInputStyle.Short)
        .setValue(String(sale?.durationMinutes || 60))
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(p1Input),
        new ActionRowBuilder().addComponents(p5Input),
        new ActionRowBuilder().addComponents(p10Input),
        new ActionRowBuilder().addComponents(saleInput),
        new ActionRowBuilder().addComponents(durationInput)
      );
      return interaction.showModal(modal);
    }

    // 14. stats-reset (Đặt lại toàn bộ thống kê về 0 cho server này)
    if (subcommand === 'stats-reset') {
      db.resetGuildStats(interaction.guildId);
      const updaterService = require('../services/updaterService');
      updaterService.notifyStatsChanged();

      return interaction.reply({
        content: '✅ **Đã đặt lại toàn bộ thống kê săn Nitro của server này về 0!** Hệ thống sẽ chỉ đếm các lượt săn thật tiếp theo.',
        ephemeral: true
      });
    }

    // 15. stats-set (Tự chỉnh con số thống kê theo ý muốn cho server này)
    if (subcommand === 'stats-set') {
      const totalClaims = interaction.options.getInteger('total_claims');
      const basicCount = interaction.options.getInteger('basic_count');
      const boostCount = interaction.options.getInteger('boost_count');
      const claimsToday = interaction.options.getInteger('claims_today') || 0;

      const newStats = db.setCustomGuildStats(interaction.guildId, {
        totalClaims,
        basicCount,
        boostCount,
        claimsToday
      });

      const updaterService = require('../services/updaterService');
      updaterService.notifyStatsChanged();

      return interaction.reply({
        content:
          `✅ **Đã tùy chỉnh bảng thống kê riêng của server này thành công!**\n` +
          `• Tổng số mã: **${newStats.totalClaims} mã**\n` +
          `• Nitro Basic: **${newStats.basicCount} mã**\n` +
          `• Nitro Boost: **${newStats.boostCount} mã**\n` +
          `• Hôm nay: **${newStats.claimsToday} mã**\n` +
          `• Giá trị quy đổi: **${newStats.totalValueUsd}$ - ${formatVND(newStats.totalValueVnd)}**\n` +
          `*Kênh #stats của server đã tự động cập nhật ngay tức thì.*`,
        ephemeral: true
      });
    }

    // 16. content (Tùy chỉnh nội dung chữ của từng kênh)
    if (subcommand === 'content') {
      const type = interaction.options.getString('type');
      const text = interaction.options.getString('text').trim();

      const fieldMap = {
        queue_desc: { prop: 'queuePanelDescription', label: 'Mô tả bảng hàng đợi' },
        token_guide: { prop: 'tokenGuide', label: 'Nội dung hướng dẫn lấy Token' },
        guide_title: { prop: 'guideTitle', label: 'Tiêu đề hướng dẫn' },
        priority_guide: { prop: 'priorityGuide', label: 'Nội dung hướng dẫn Ưu tiên' },
        vouch_text: { prop: 'vouchText', label: 'Nội dung kênh Vouch uy tín' }
      };

      const target = fieldMap[type];
      if (!target) return interaction.reply({ content: '❌ Loại nội dung không hợp lệ!', ephemeral: true });

      if (interaction.guildId) {
        db.setGuildConfig(interaction.guildId, { [target.prop]: text });
      }

      if (!config.content) config.content = {};
      config.content[target.prop] = text;
      saveConfig(config);

      return interaction.reply({
        content:
          `✅ **Đã cập nhật [${target.label}] thành công cho Server này!**\n` +
          `• Nội dung mới: *${text.slice(0, 120)}${text.length > 120 ? '...' : ''}*\n` +
          `• Lưu riêng tại file: \`data/guilds/${interaction.guildId}.json\``,
        ephemeral: true
      });
    }
  }
};
