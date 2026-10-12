const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getConfig, saveConfig } = require('../config');
const upstreamBridge = require('../services/upstreamBridge');

function checkIsAdmin(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upstream')
    .setDescription('[Chủ shop] Cấu hình và quản lý tài khoản liên kết queue shop gốc (HQ Shop Queue)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('token')
        .setDescription('[Owner] Nhập Token tài khoản Discord của bạn có ở server shop gốc')
        .addStringOption(opt =>
          opt
            .setName('token')
            .setDescription('Token tài khoản Discord cá nhân (tài khoản có credit bên shop gốc)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('join')
        .setDescription('Dùng tài khoản shop gốc để nhập token và số lượng join queue bên shop gốc')
        .addIntegerOption(opt =>
          opt
            .setName('turns')
            .setDescription('Số lượt muốn mua')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption(opt =>
          opt
            .setName('token')
            .setDescription('Token tài khoản nhận Nitro')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt
            .setName('priority')
            .setDescription('Bật chế độ chắc cú/ưu tiên? (tiêu 3x credit bên shop gốc)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Xem trạng thái kết nối tài khoản và số credit bên shop gốc')
    )
    .addSubcommand(sub =>
      sub
        .setName('toggle')
        .setDescription('Bật hoặc tắt tính năng tự động chuyển tiếp đơn sang shop gốc')
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription('Bật (True) hoặc Tắt (False)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('credits')
        .setDescription('Cập nhật số credit bạn đang sở hữu bên shop gốc')
        .addIntegerOption(opt =>
          opt
            .setName('amount')
            .setDescription('Số credit hiện có bên shop gốc')
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Cài đặt thông số kênh và tin nhắn chứa bảng queue của shop gốc')
        .addStringOption(opt =>
          opt
            .setName('guild_id')
            .setDescription('ID server Discord của shop gốc')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('channel_id')
            .setDescription('ID kênh chứa bảng queue của shop gốc')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('message_id')
            .setDescription('ID tin nhắn chứa nút bấm "Dùng credit" của shop gốc')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('claim_channel_id')
            .setDescription('ID kênh log claim săn được của shop gốc (để bot tự bắt thông báo)')
            .setRequired(false)
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

    // 0. /upstream token
    if (subcommand === 'token') {
      const isBotOwner = interaction.user.id === config.ownerId || interaction.user.id === process.env.OWNER_ID;
      const isServerOwner = interaction.guild?.ownerId === interaction.user.id;
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isBotOwner && !isServerOwner && !isAdmin) {
        return interaction.reply({
          content: '❌ Chỉ duy nhất Server Owner hoặc Quản trị viên mới có quyền cài đặt Token tài khoản shop gốc!',
          ephemeral: true
        });
      }

      const userToken = interaction.options.getString('token').trim();
      await interaction.deferReply({ ephemeral: true });

      const { checkDiscordTokenAlive } = require('../utils/helpers');
      const check = await checkDiscordTokenAlive(userToken);
      if (!check.alive) {
        return interaction.editReply({
          content: `❌ Token Discord không hợp lệ hoặc đã chết (${check.message || 'Lỗi xác thực'}). Vui lòng lấy lại token mà KHÔNG bấm Đăng xuất!`
        });
      }

      if (isBotOwner) {
        // Lưu vào config.json nếu là Bot Owner cấu hình chung
        if (!config.upstream) config.upstream = {};
        config.upstream.userToken = userToken;
        config.upstream.enabled = true;
        config.upstream.autoForward = true;
        saveConfig(config);

        // Cập nhật file .env
        try {
          const fs = require('fs');
          const path = require('path');
          const envPath = path.join(__dirname, '../../.env');
          let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
          if (envContent.includes('UPSTREAM_USER_TOKEN=')) {
            envContent = envContent.replace(/UPSTREAM_USER_TOKEN=.*(\r?\n|$)/, `UPSTREAM_USER_TOKEN=${userToken}\n`);
          } else {
            envContent += `\nUPSTREAM_USER_TOKEN=${userToken}\n`;
          }
          fs.writeFileSync(envPath, envContent, 'utf8');
        } catch (e) {
          console.error('[UPSTREAM] Lỗi ghi file .env:', e);
        }
      }

      try {
        const loggedUser = await upstreamBridge.loginWithToken(interaction.client, userToken, interaction.guildId);
        if (interaction.guildId) {
          db.setGuildConfig(interaction.guildId, {
            upstreamToken: userToken,
            upstreamUserTag: loggedUser.tag
          });
        }
        return interaction.editReply({
          content:
            `✅ **CÀI ĐẶT TOKEN TÀI KHOẢN SHOP GỐC CHO SERVER NÀY THÀNH CÔNG!**\n\n` +
            `• Tài khoản Discord đã đăng nhập: **${loggedUser.tag}** (\`${loggedUser.id}\`)\n` +
            `• Trạng thái kết nối: **🟢 Online & Sẵn sàng**\n` +
            `• Server shop gốc: \`${config.upstream?.guildId || '1289888622295781408'}\`\n` +
            `• Kênh lệnh shop gốc: \`${config.upstream?.commandsChannelId || '1555969644173598811'}\`\n` +
            `• Lưu riêng tại file: \`data/guilds/${interaction.guildId}.json\`\n` +
            `• Tự động chuyển tiếp đơn: **🟢 BẬT**\n\n` +
            `👉 *Tài khoản này sẽ tự động nộp đơn và trừ credit trực tiếp ở shop gốc khi khách trong server của bạn mua hàng!*`
        });
      } catch (err) {
        return interaction.editReply({
          content: `⚠️ Đã lưu token thành công, nhưng tạm thời chưa thể kết nối gateway: \`${err.message}\`. Vui lòng thử lại sau ít giây.`
        });
      }
    }

    // 0.1. /upstream join
    if (subcommand === 'join') {
      const turns = interaction.options.getInteger('turns');
      const token = interaction.options.getString('token').trim();
      const isPriority = Boolean(interaction.options.getBoolean('priority'));

      await interaction.deferReply({ ephemeral: true });

      const forwardRes = await upstreamBridge.submitToUpstreamQueue({
        turns,
        token,
        isPriority,
        guildId: interaction.guildId
      });

      if (!forwardRes.success) {
        return interaction.editReply({
          content:
            `❌ **Không thể join queue bên shop gốc!**\n` +
            `• Lý do: \`${forwardRes.message}\`\n` +
            `*Vui lòng dùng lệnh \`/upstream status\` để kiểm tra lại tài khoản gốc.*`
        });
      }

      // Tạo đơn lưu vào hệ thống nội bộ để bot quản lý và hiển thị trong #queue
      const db = require('../database');
      const order = db.createOrder({
        userId: interaction.user.id,
        username: interaction.user.tag || interaction.user.username,
        token,
        turns,
        isPriority,
        guildId: interaction.guildId
      });

      db.updateOrder(order.id, { upstreamSynced: true });

      const updaterService = require('../services/updaterService');
      updaterService.notifyQueueChanged();

      return interaction.editReply({
        content:
          `✅ **ĐÃ DÙNG TÀI KHOẢN SHOP GỐC JOIN QUEUE THÀNH CÔNG!**\n\n` +
          `• Mã đơn nội bộ: \`${order.id}\`\n` +
          `• Số lượt: **${turns} lượt** (${isPriority ? 'Chế độ chắc cú/Ưu tiên 3x' : 'Bình thường'})\n` +
          `• Biểu mẫu shop gốc: *"${forwardRes.upstreamModalTitle || 'Dùng credit vào hàng đợi'}"*\n` +
          `• Credit gốc bị trừ: **${forwardRes.cost || turns} credit**\n` +
          `• Credit gốc còn lại: **${config.upstream?.upstreamCredits ?? 0} credit**\n\n` +
          `📡 *Đơn đã chính thức xếp hàng trên server shop gốc và cũng đã cập nhật vào bảng queue bot này!*`
      });
    }

    // 1. /upstream status
    if (subcommand === 'status') {
      const up = config.upstream || {};
      const isOnline = upstreamBridge.isReady;
      const userTag = upstreamBridge.selfClient?.user?.tag || 'Chưa kết nối';

      return interaction.reply({
        content:
          `🔗 **Trạng thái liên kết Shop gốc (HQ Shop Queue):**\n` +
          `• Kích hoạt: **${up.enabled ? '🟢 Đang BẬT' : '🔴 Đang TẮT'}** (Tự động điền: **${up.autoForward ? 'BẬT' : 'TẮT'}**)\n` +
          `• Tài khoản gốc: **${userTag}** (${isOnline ? '🟢 Online' : '🔴 Offline'})\n` +
          `• Credit gốc hiện có: **${up.upstreamCredits ?? 0} credit**\n` +
          `• Server ID: \`${up.guildId || 'Chưa cài'}\`\n` +
          `• Kênh Queue ID: \`${up.channelId || 'Chưa cài'}\`\n` +
          `• Tin nhắn Button ID: \`${up.messageId || 'Chưa cài'}\`\n` +
          `• Kênh Log Claim ID: \`${up.claimChannelId || 'Chưa cài'}\`\n\n` +
          (upstreamBridge.lastError ? `⚠️ Lỗi gần nhất: \`${upstreamBridge.lastError}\`\n` : '') +
          `*Dùng \`/upstream set\` để cài đặt ID kênh hoặc \`/upstream credits\` để chỉnh số dư.*`,
        ephemeral: true
      });
    }

    // 2. /upstream toggle
    if (subcommand === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      if (!config.upstream) config.upstream = {};
      config.upstream.enabled = enabled;
      config.upstream.autoForward = enabled;
      saveConfig(config);

      // Thử khởi động lại bridge nếu vừa bật
      if (enabled && !upstreamBridge.isReady) {
        upstreamBridge.initialize(interaction.client);
      }

      return interaction.reply({
        content: `✅ Đã **${enabled ? 'BẬT' : 'TẮT'}** tính năng tự động chuyển tiếp đơn sang shop gốc!`,
        ephemeral: true
      });
    }

    // 3. /upstream credits
    if (subcommand === 'credits') {
      const amount = interaction.options.getInteger('amount');
      upstreamBridge.setUpstreamCredits(amount);

      return interaction.reply({
        content: `✅ Đã cập nhật số credit gốc của bạn thành: **${amount} credit**!`,
        ephemeral: true
      });
    }

    // 4. /upstream set
    if (subcommand === 'set') {
      const guildId = interaction.options.getString('guild_id').trim();
      const channelId = interaction.options.getString('channel_id').trim();
      const messageId = interaction.options.getString('message_id').trim();
      const claimChannelId = interaction.options.getString('claim_channel_id')?.trim();

      if (!config.upstream) config.upstream = {};
      config.upstream.guildId = guildId;
      config.upstream.channelId = channelId;
      config.upstream.messageId = messageId;
      if (claimChannelId) config.upstream.claimChannelId = claimChannelId;
      config.upstream.enabled = true;
      config.upstream.autoForward = true;
      saveConfig(config);

      return interaction.reply({
        content:
          `✅ **Đã lưu cài đặt thông số shop gốc:**\n` +
          `• Server ID: \`${guildId}\`\n` +
          `• Kênh Queue ID: \`${channelId}\`\n` +
          `• Tin nhắn Button ID: \`${messageId}\`\n` +
          `• Kênh Log Claim ID: \`${claimChannelId || 'Không đổi'}\`\n\n` +
          `*Hệ thống đã tự động BẬT tính năng chuyển tiếp.*`,
        ephemeral: true
      });
    }
  }
};
