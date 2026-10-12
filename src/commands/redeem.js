const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const db = require('../database');
const queueService = require('../services/queueService');
const { maskToken, extractUserIdFromToken } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redeem')
    .setDescription('Quy đổi mã key hoặc sử dụng credit để vào hàng đợi')
    .addSubcommand(sub =>
      sub
        .setName('key')
        .setDescription('Đổi mã thành credit')
        .addStringOption(opt =>
          opt
            .setName('code')
            .setDescription('Mã key muốn đổi (để trống nếu muốn mở bảng dán nhiều key)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('credits')
        .setDescription('Dùng credit để vào hàng đợi săn Nitro')
        .addIntegerOption(opt =>
          opt
            .setName('turns')
            .setDescription('Số lượt muốn mua')
            .setRequired(false)
            .setMinValue(1)
        )
        .addStringOption(opt =>
          opt
            .setName('token')
            .setDescription('Token tài khoản nhận hàng')
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName('priority')
            .setDescription('Chế độ Ưu tiên (tiêu gấp 3 credit, không trừ lượt khi ra Basic)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // 1. /redeem key
    if (subcommand === 'key') {
      const code = interaction.options.getString('code');
      // Nếu có truyền trực tiếp mã
      if (code) {
        const redeemed = db.redeemKey(code, interaction.user.id, interaction.guildId);
        if (!redeemed || !redeemed.success) {
          return interaction.reply({
            content: redeemed?.message || '❌ Mã key này không hợp lệ hoặc đã qua sử dụng!',
            ephemeral: true
          });
        }
        const user = db.getUser(interaction.user.id, interaction.guildId);
        return interaction.reply({
          content: `🎉 **Đổi key thành công!** Bạn nhận được **+${redeemed.credits} credit** tại máy chủ này.\n• Số dư hiện tại: **${user.balance} credit**.`,
          ephemeral: true
        });
      }

      // Nếu không truyền tham số -> Mở Modal nhập nhiều key (Ảnh 5)
      const modal = new ModalBuilder()
        .setCustomId('modal_redeem_key')
        .setTitle('Đổi key');

      const keysInput = new TextInputBuilder()
        .setCustomId('keys')
        .setLabel('Mã của bạn (tối đa 25 mã) *')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Dán được nhiều mã một lúc — mỗi dòng một mã, hoặc cách nhau bằng dấu cách.')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(keysInput));
      return interaction.showModal(modal);
    }

    // 2. /redeem credits
    if (subcommand === 'credits') {
      if (interaction.guildId) {
        const guildCfg = db.getGuildConfig(interaction.guildId) || {};
        if (!guildCfg.upstreamToken) {
          return interaction.reply({
            content:
              `⚠️ **MÁY CHỦ CHƯA SẴN SÀNG NHẬN ĐƠN HÀNG!**\n\n` +
              `Quản trị viên máy chủ chưa cài đặt tài khoản sỉ (Upstream Token) kết nối với shop gốc.\n` +
              `👉 Vui lòng liên hệ Admin/Chủ shop gõ lệnh:\n` +
              `\`/upstream token token:<token_acc_gốc>\` để kích hoạt nhận đơn!`,
            ephemeral: true
          });
        }
      }

      if (db.isShopPaused()) {
        return interaction.reply({
          content: '⏸️ **Hiện tại shop đang tạm nghỉ nhận đơn mới!** Vui lòng thử lại sau ít phút.',
          ephemeral: true
        });
      }

      const turns = interaction.options.getInteger('turns');
      const token = interaction.options.getString('token');
      const priority = interaction.options.getBoolean('priority');

      // Nếu đã điền đủ tham số ngay trên slash command
      if (turns && token) {
        const isPriority = Boolean(priority);
        const trimmedToken = token.trim();

        const { checkDiscordTokenAlive } = require('../utils/helpers');
        const tokenCheck = await checkDiscordTokenAlive(trimmedToken);

        if (!tokenCheck.alive) {
          return interaction.reply({
            content: '❌ **Token không hoạt động (Dead / Invalid Token)!** Vui lòng kiểm tra lại token Discord của bạn.',
            ephemeral: true
          });
        }

        if (!tokenCheck.hasPhone) {
          return interaction.reply({
            content:
              `❌ **Tài khoản Discord nhận quà bắt buộc phải liên kết Số Điện Thoại (SĐT)!**\n\n` +
              `Tài khoản **${tokenCheck.user?.username || 'của bạn'}** chưa có số điện thoại. Để đảm bảo token không bị khoá hay lỗi đơn khi giao quà, hệ thống yêu cầu tài khoản phải thêm SĐT.\n\n` +
              `📱 **Cách thêm SĐT vào Discord:**\n` +
              `1. Vào **Cài đặt người dùng (User Settings)** (biểu tượng bánh răng).\n` +
              `2. Chọn **Tài khoản của tôi (My Account)** -> Nhấn **Thêm số điện thoại (Add Phone Number)**.\n` +
              `3. Nhập SĐT và xác minh mã OTP gửi về máy.\n` +
              `4. Lấy lại token mới sau khi thêm SĐT và thử lại nhé!`,
            ephemeral: true
          });
        }

        const originGuildId = interaction.guildId || null;
        if (originGuildId) {
          db.updateUser(interaction.user.id, { lastGuildId: originGuildId, resellerGuildId: originGuildId }, originGuildId);
        }

        const tokenUserId = tokenCheck.user?.id || extractUserIdFromToken(trimmedToken) || null;
        const tokenUsername = tokenCheck.user?.username || tokenCheck.user?.global_name || null;

        const { getConfig } = require('../config');
        const config = getConfig();
        const priorityMultiplier = config.queueSettings?.priorityMultiplier || 3;
        const requiredCredits = isPriority ? turns * priorityMultiplier : turns;

        // 1. Kiểm tra số dư của khách trước tại máy chủ này (chưa trừ)
        const customerUser = db.getUser(interaction.user.id, originGuildId);
        if (customerUser.balance < requiredCredits) {
          return interaction.reply({
            content: `❌ **Số dư không đủ!** Bạn cần **${requiredCredits} credit** (${turns} lượt${isPriority ? ` x ${priorityMultiplier} [Ưu tiên]` : ''}), nhưng hiện chỉ có **${customerUser.balance} credit**.\n💡 Dùng lệnh \`/topup\` hoặc nạp thêm thẻ/key để tiếp tục!`,
            ephemeral: true
          });
        }

        // 2. Kiểm tra giới hạn: 1 token chỉ được xuất hiện tối đa maxEntriesPerToken trong queue
        const maxEntriesPerToken = config.queueSettings?.maxQueueEntriesPerToken || 3;
        const masked = maskToken(trimmedToken);
        const activeQueue = db.getActiveQueue(originGuildId);
        const existingOrdersForToken = activeQueue.filter(o => {
          if (tokenUserId && o.tokenUserId && o.tokenUserId === tokenUserId) return true;
          if (o.tokenMasked && o.tokenMasked === masked) return true;
          return false;
        });

        if (existingOrdersForToken.length >= maxEntriesPerToken) {
          return interaction.reply({
            content: `⚠️ **GIỚI HẠN HÀNG ĐỢI:** Token này đã xuất hiện **${existingOrdersForToken.length}/${maxEntriesPerToken} lượt** trong hàng đợi!\n` +
                     `Vui lòng chờ các lượt hiện tại hoàn thành trước khi thêm tiếp (Quy định: 1 token chỉ được xuất hiện tối đa ${maxEntriesPerToken} lượt trong queue để tránh rải hàng dài).`,
            ephemeral: true
          });
        }

        // 3. Kiểm tra cấu hình và hạn mức credit sỉ của máy chủ tại shop gốc
        if (originGuildId) {
          const guildCfg = db.getGuildConfig(originGuildId) || {};
          if (!guildCfg.upstreamToken) {
            return interaction.reply({
              content:
                `⚠️ **MÁY CHỦ CHƯA SẴN SÀNG NHẬN ĐƠN HÀNG!**\n\n` +
                `Quản trị viên máy chủ chưa cài đặt tài khoản sỉ (Upstream Token) kết nối với shop gốc.\n` +
                `👉 Vui lòng liên hệ Admin/Chủ shop gõ lệnh:\n` +
                `\`/upstream token token:<token_acc_gốc>\` để kích hoạt nhận đơn!`,
              ephemeral: true
            });
          }
          const currentUpCredits = db.getGuildUpstreamCredits(originGuildId);
          if (guildCfg.upstreamCredits !== undefined && currentUpCredits < requiredCredits) {
            return interaction.reply({
              content: `⚠️ **Hàng đợi tạm thời hết hạn mức sỉ!**\nTài khoản sỉ của máy chủ hiện không đủ credit bên shop gốc (${currentUpCredits}/${requiredCredits}). Vui lòng báo Admin nạp thêm!`,
              ephemeral: true
            });
          }
        }

        const resolvedGuild = interaction.guild || (originGuildId ? interaction.client.guilds.cache.get(originGuildId) : null);
        const guildCfg = originGuildId ? db.getGuildConfig(originGuildId) : {};
        const serverName = resolvedGuild?.name || guildCfg.name || config.shop.name || 'Shop';
        let serverIcon = resolvedGuild?.iconURL?.({ extension: 'png', size: 256 }) || null;
        if (!serverIcon) {
          serverIcon = interaction.client?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
        }

        // 4. BẮT ĐẦU CHỜ BÊN SHOP GỐC XÁC NHẬN THÀNH CÔNG (DEFER REPLY)
        await interaction.deferReply({ ephemeral: true });

        const upstreamBridge = require('../services/upstreamBridge');
        const forwardRes = await upstreamBridge.submitToUpstreamQueue({
          turns,
          token: trimmedToken,
          isPriority,
          guildId: originGuildId
        });

        // NẾU BÊN GỐC TỪ CHỐI HOẶC THẤT BẠI: KHÔNG TRỪ CREDIT KHÁCH & KHÔNG TẠO ĐƠN!
        if (!forwardRes.success) {
          try {
            const ownerLogService = require('../services/ownerLogService');
            ownerLogService.logUpstreamError({
              error: forwardRes.message || 'Lỗi kết nối hoặc tài khoản sỉ không đủ credit',
              context: 'Chuyển tiếp đơn /redeem credits',
              guildId: originGuildId
            });
          } catch (e) {}

          const failEmbed = new EmbedBuilder()
            .setTitle('Hàng đợi tạm thời chưa thể duyệt đơn')
            .setColor('#ED4245')
            .setDescription(
              `Hệ thống shop gốc từ chối hoặc chưa thể tiếp nhận đơn vào lúc này.\n` +
              `• Chi tiết phản hồi: \`${forwardRes.message || 'Shop gốc đang bận hoặc quá tải'}\`\n\n` +
              `🛡️ **Số dư của bạn được bảo toàn 100%:** **${customerUser.balance} credit** (Chưa bị trừ bất kỳ xu nào).\n` +
              `Vui lòng thử lại sau ít phút hoặc liên hệ Quản trị viên để được hỗ trợ!`
            );
          if (serverIcon) failEmbed.setThumbnail(serverIcon);
          failEmbed.setFooter({ text: serverName, iconURL: serverIcon || undefined });

          return interaction.editReply({ embeds: [failEmbed] });
        }

        // 5. BÊN GỐC ĐÃ THÀNH CÔNG -> LÚC NÀY MỚI DUYỆT BÊN NÀY (TRỪ CREDIT & TẠO ĐƠN NỘI BỘ)
        db.deductCredits(interaction.user.id, requiredCredits, originGuildId);
        const updatedCustomer = db.getUser(interaction.user.id, originGuildId);
        const remainingBalance = updatedCustomer.balance;

        const order = db.createOrder({
          userId: interaction.user.id,
          username: interaction.user.tag || interaction.user.username,
          token: trimmedToken,
          tokenUserId,
          tokenUsername,
          turns,
          isPriority,
          guildId: originGuildId,
          isDm: !interaction.guildId
        });

        db.updateOrder(order.id, {
          upstreamSynced: true,
          upstreamOrderId: forwardRes.upstreamOrderId || null
        });

        // Cập nhật lại hiển thị hàng đợi realtime
        const updaterService = require('../services/updaterService');
        updaterService.notifyQueueChanged(originGuildId);

        const activeList = db.getActiveQueue(originGuildId);
        const position = activeList.findIndex(o => o.id === order.id) + 1 || activeList.length;

        const successEmbed = new EmbedBuilder()
          .setTitle('Đã đổi credit thành công')
          .setDescription(
            `Đã dùng **${requiredCredits}** credit cho **${order.initialTurns}** lượt\n` +
            `Vị trí hàng đợi: **#${position}**\n` +
            `Mã đơn: \`${order.id}\`\n` +
            `Số dư còn lại: **${remainingBalance} credit**\n` +
            `Guaranteed Boost: **${isPriority ? 'Có' : 'Không'}**\n` +
            `Đã vào hàng đợi thành công.`
          )
          .setColor(65280);

        if (serverIcon) successEmbed.setThumbnail(serverIcon);
        successEmbed.setFooter({ text: serverName, iconURL: serverIcon || undefined });

        // WHITELABEL 100% bằng avatar và tên của SERVER này
        if (forwardRes.upstreamResponse?.embeds?.length) {
          const { sanitizeAndWhitelabelEmbed } = require('../utils/embeds');
          const whitelabeledEmbed = sanitizeAndWhitelabelEmbed(
            forwardRes.upstreamResponse.embeds[0],
            resolvedGuild,
            config,
            {
              customerUser: interaction.user,
              customerBalance: remainingBalance,
              client: interaction.client
            }
          );
          interaction.user.send({ embeds: [whitelabeledEmbed] }).catch(() => {});
          return interaction.editReply({ embeds: [whitelabeledEmbed] });
        }

        interaction.user.send({ embeds: [successEmbed] }).catch(() => {});
        return interaction.editReply({ embeds: [successEmbed] });
      }

      // Nếu không điền tham số -> Mở Modal "Vào hàng đợi" (Ảnh 4)
      const modal = new ModalBuilder()
        .setCustomId('modal_enter_queue')
        .setTitle('Vào hàng đợi');

      const turnsInput = new TextInputBuilder()
        .setCustomId('turns')
        .setLabel('Số lượt muốn mua *')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ví dụ: 5')
        .setRequired(true);

      const tokenInput = new TextInputBuilder()
        .setCustomId('token')
        .setLabel('Token Discord (Acc phải có SĐT) *')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Dán token Discord nhận hàng (bắt buộc có SĐT)')
        .setRequired(true);

      const priorityInput = new TextInputBuilder()
        .setCustomId('priority')
        .setLabel('Ưu tiên? (gõ CÓ, tiêu gấp 3)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('để trống nếu không')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(turnsInput),
        new ActionRowBuilder().addComponents(tokenInput),
        new ActionRowBuilder().addComponents(priorityInput)
      );

      return interaction.showModal(modal);
    }
  }
};
