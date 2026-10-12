const { EmbedBuilder } = require('discord.js');
const queueService = require('../services/queueService');
const db = require('../database');
const { maskToken, isValidDiscordToken, checkDiscordTokenAlive, extractUserIdFromToken } = require('../utils/helpers');

async function handleModalInteraction(interaction) {
  const { customId, user } = interaction;

  // 1. Modal "Vào hàng đợi" (Ảnh 4)
  if (customId === 'modal_enter_queue') {
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

    const turnsRaw = interaction.fields.getTextInputValue('turns');
    const token = interaction.fields.getTextInputValue('token').trim();
    const priorityRaw = interaction.fields.getTextInputValue('priority') || '';

    // Kiểm tra số lượt
    const turns = parseInt(turnsRaw, 10);
    if (isNaN(turns) || turns <= 0) {
      return interaction.reply({
        content: '❌ Số lượt muốn mua phải là một số nguyên lớn hơn 0!',
        ephemeral: true
      });
    }

    // Kiểm tra định dạng token cơ bản
    if (!token || token.length < 20) {
      return interaction.reply({
        content: '❌ Token Discord nhận hàng không hợp lệ! Vui lòng kiểm tra lại.',
        ephemeral: true
      });
    }

    // Kiểm tra trực tiếp xem token có còn sống trên Discord không
    const tokenCheck = await checkDiscordTokenAlive(token);
    if (!tokenCheck.alive) {
      return interaction.reply({
        content:
          `❌ **Token Discord không hợp lệ hoặc đã chết!**\n` +
          `• Lý do: ${tokenCheck.message || 'Discord từ chối xác thực token này.'}\n\n` +
          `💡 **Lý do token hay bị chết & Cách phòng tránh:**\n` +
          `• **Nguyên nhân phổ biến nhất:** Sau khi lấy token, bạn bấm nút **Đăng xuất (Log out)** trên Discord -> Token bị hủy lập tức!\n` +
          `• **Cách lấy đúng:** Chỉ cần lấy token xong rồi **TẮT TAB TRÌNH DUYỆT**, tuyệt đối **KHÔNG BẤM NÚT ĐĂNG XUẤT**.\n` +
          `• Đổi mật khẩu tài khoản hoặc đổi IP đột ngột cũng làm reset token.`,
        ephemeral: true
      });
    }

    // 📱 YÊU CẦU BẮT BUỘC TÀI KHOẢN PHẢI LIÊN KẾT SỐ ĐIỆN THOẠI (SĐT)
    if (!tokenCheck.hasPhone) {
      return interaction.reply({
        content:
          `❌ **TÀI KHOẢN CHƯA LIÊN KẾT SỐ ĐIỆN THOẠI!**\n\n` +
          `⚠️ **Yêu cầu bắt buộc:** Để tham gia hàng đợi săn Nitro, tài khoản Discord nhận hàng **bắt buộc phải thêm Số Điện Thoại (SĐT)** vào tài khoản mới có thể sử dụng bot.\n\n` +
          `📱 **Cách thêm SĐT vào Discord:**\n` +
          `1. Mở Discord trên máy tính hoặc điện thoại -> Vào **Cài đặt người dùng (User Settings)** (biểu tượng bánh răng).\n` +
          `2. Chọn mục **Tài khoản của tôi (My Account)** -> Nhấn **Thêm số điện thoại (Add Phone Number)**.\n` +
          `3. Xác minh mã OTP gửi về số điện thoại của bạn.\n` +
          `4. Sau khi thêm SĐT thành công, hãy lấy lại token mới và dán vào bot nhé!`,
        ephemeral: true
      });
    }

    // Kiểm tra cờ ưu tiên
    const pTrim = priorityRaw.trim().toLowerCase();
    const isPriority = ['có', 'co', 'c', 'yes', 'y', 'true', '1'].includes(pTrim);

    // Xác định Guild nguồn (Server thông báo khi trúng quà)
    let originGuildId = interaction.guildId || null;
    if (originGuildId) {
      db.updateUser(user.id, { lastGuildId: originGuildId, resellerGuildId: originGuildId }, originGuildId);
    } else {
      const globalUser = db.getUser(user.id);
      originGuildId = globalUser.resellerGuildId || globalUser.lastGuildId || null;
    }

    const tokenUserId = tokenCheck.user?.id || extractUserIdFromToken(token) || null;
    const tokenUsername = tokenCheck.user?.username || tokenCheck.user?.global_name || null;

    const result = queueService.enterQueue({
      userId: user.id,
      username: user.tag || user.username,
      turns,
      token,
      tokenUserId,
      tokenUsername,
      isPriority,
      guildId: originGuildId,
      isDm: !interaction.guildId
    });

    if (!result.success) {
      return interaction.reply({
        content: `❌ ${result.message}`,
        ephemeral: true
      });
    }

    const { order, requiredCredits, remainingBalance } = result;
    const { getConfig } = require('../config');
    const config = getConfig();
    const upstreamBridge = require('../services/upstreamBridge');
    const { sanitizeAndWhitelabelEmbed } = require('../utils/embeds');

    const activeList = db.getActiveQueue(originGuildId);
    const position = activeList.findIndex(o => o.id === order.id) + 1 || activeList.length;

    const guildCfg = originGuildId ? db.getGuildConfig(originGuildId) : {};
    const serverName = guildCfg.name || interaction.guild?.name || config.shop.name || 'Shop';
    const serverIcon = (interaction.guild && typeof interaction.guild.iconURL === 'function')
      ? interaction.guild.iconURL({ extension: 'png', size: 256 })
      : (guildCfg.avatarUrl || config.shop.avatarUrl || null);

    // Embed chuẩn mang thương hiệu của SERVER hiện tại (Chống lộ nguồn)
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

    // Nếu cấu hình liên kết tự động sang shop gốc đang BẬT
    if (config.upstream?.enabled && config.upstream?.autoForward) {
      await interaction.deferReply({ ephemeral: true });

      const forwardRes = await upstreamBridge.submitToUpstreamQueue({
        turns,
        token,
        isPriority,
        guildId: originGuildId
      });

      if (!forwardRes.success) {
        // Hoàn lại credit cho khách và hủy đơn nếu bên shop gốc từ chối
        db.cancelOrder(order.id, user.id);
        const refundedUser = db.getUser(user.id, originGuildId);

        // Bắn cảnh báo bảo mật về kênh Owner
        try {
          const ownerLogService = require('../services/ownerLogService');
          ownerLogService.logUpstreamError({
            error: forwardRes.message || 'Lỗi kết nối hoặc tài khoản sỉ không đủ credit',
            order,
            context: 'Chuyển tiếp đơn hàng đợi',
            guildId: originGuildId
          });
        } catch (e) {}

        const failEmbed = new EmbedBuilder()
          .setTitle('Hàng đợi tạm thời bảo trì')
          .setColor('#ED4245')
          .setDescription(
            `Hệ thống xử lý đơn hiện đang bảo trì hoặc quá tải lượt.\n` +
            `Đơn hàng của bạn chưa thể thực hiện vào lúc này.\n\n` +
            `• Đã hoàn lại: **+${requiredCredits} credit** vào ví của bạn tại server này.\n` +
            `• Số dư hiện tại: **${refundedUser.balance} credit**.\n\n` +
            `Vui lòng thử lại sau ít phút hoặc liên hệ Quản trị viên để được hỗ trợ!`
          );
        if (serverIcon) failEmbed.setThumbnail(serverIcon);
        failEmbed.setFooter({ text: serverName, iconURL: serverIcon || undefined });

        return interaction.editReply({ embeds: [failEmbed] });
      }

      db.updateOrder(order.id, { upstreamSynced: true });

      const resolvedGuild = interaction.guild || (originGuildId ? interaction.client.guilds.cache.get(originGuildId) : null);

      // Nếu shop gốc trả về embed phản hồi -> WHITELABEL 100% bằng avatar và tên của SERVER này!
      if (forwardRes.upstreamResponse?.embeds?.length) {
        const whitelabeledEmbed = sanitizeAndWhitelabelEmbed(
          forwardRes.upstreamResponse.embeds[0],
          resolvedGuild,
          config,
          { customerUser: user, customerBalance: remainingBalance, client: interaction.client }
        );
        user.send({ embeds: [whitelabeledEmbed] }).catch(() => {});
        return interaction.editReply({ embeds: [whitelabeledEmbed] });
      }

      user.send({ embeds: [successEmbed] }).catch(() => {});
      return interaction.editReply({ embeds: [successEmbed] });
    }

    user.send({ embeds: [successEmbed] }).catch(() => {});
    return interaction.reply({
      embeds: [successEmbed],
      ephemeral: true
    });
  }

  // 2. Modal "Đổi key" (Ảnh 5)
  if (customId === 'modal_redeem_key') {
    const rawKeys = interaction.fields.getTextInputValue('keys');
    // Phân tách danh sách key bằng dòng mới, dấu phẩy hoặc khoảng trắng
    const keyList = rawKeys
      .split(/[\r\n,\s]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .slice(0, 25); // Tối đa 25 key

    if (!keyList.length) {
      return interaction.reply({
        content: '❌ Bạn chưa nhập mã key nào hợp lệ!',
        ephemeral: true
      });
    }

    const result = db.redeemBatchKeys(keyList, user.id, interaction.guildId);
    const updatedUser = db.getUser(user.id, interaction.guildId);

    if (result.successCount === 0) {
      let errText = `❌ Không có mã nào hợp lệ hoặc tất cả mã đã được sử dụng trước đó! (Kiểm tra lại ${result.failedCount} mã)`;
      if (result.differentGuildCount > 0) {
        errText += `\n⚠️ Có **${result.differentGuildCount} mã** thuộc về máy chủ khác! Mỗi key chỉ dùng được tại máy chủ đã phát hành nó.`;
      }
      return interaction.reply({
        content: errText,
        ephemeral: true
      });
    }

    let responseMessage =
      `🎉 **Đổi key thành công!**\n\n` +
      `• Đổi thành công: **${result.successCount} mã**\n` +
      `• Credit nhận được: **+${result.successCredits} credit**\n` +
      `• Số dư ví tại máy chủ này: **${updatedUser.balance} credit**`;

    if (result.differentGuildCount > 0) {
      responseMessage += `\n⚠️ Có **${result.differentGuildCount} mã** thuộc về máy chủ khác (không thể dùng tại đây).`;
    }
    if (result.failedCount > 0) {
      responseMessage += `\n⚠️ Có **${result.failedCount} mã** không hợp lệ hoặc đã qua sử dụng.`;
    }

    // Bắn log đổi key vào kênh bảo mật của Server Owner
    try {
      const ownerLogService = require('../services/ownerLogService');
      ownerLogService.logKeyRedeemed({
        user,
        key: keyList.join(', '),
        credits: result.successCredits,
        newBal: updatedUser.balance,
        guildId: interaction.guildId
      });
    } catch (e) {}

    return interaction.reply({
      content: responseMessage,
      ephemeral: true
    });
  }

  // 3. Modal "Cấu hình thương hiệu shop" (/settings profile)
  if (customId === 'modal_shop_profile') {
    const name = interaction.fields.getTextInputValue('shop_name')?.trim();
    const avatarUrl = interaction.fields.getTextInputValue('shop_avatar')?.trim();
    const bannerUrl = interaction.fields.getTextInputValue('shop_banner')?.trim();
    const description = interaction.fields.getTextInputValue('shop_desc')?.trim();
    const vouchText = interaction.fields.getTextInputValue('shop_vouch')?.trim();

    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ thực hiện được trong Server!', ephemeral: true });
    }

    db.setGuildConfig(guildId, {
      name: name || undefined,
      avatarUrl: avatarUrl || undefined,
      bannerUrl: bannerUrl || undefined,
      description: description || undefined,
      vouchText: vouchText || undefined
    });

    try {
      const updaterService = require('../services/updaterService');
      updaterService.notifyPricePanelChanged();
    } catch (e) {}

    return interaction.reply({
      content:
        `✅ **Đã cập nhật thông tin thương hiệu thành công cho Server này!**\n\n` +
        `• Tên shop: **${name}**\n` +
        (avatarUrl ? `• Logo / Avatar: ${avatarUrl}\n` : '') +
        (bannerUrl ? `• Banner Nitro: ${bannerUrl}\n` : '') +
        (description ? `• Lời giới thiệu: *${description}*\n` : '') +
        (vouchText ? `• Kênh vouch: *${vouchText}*\n` : '') +
        `\n💡 *Các bảng panel và giao diện sẽ tự động áp dụng thông tin thương hiệu riêng này!*`,
      ephemeral: true
    });
  }

  // 4. Modal "Cài đặt Upstream Token từ nút bấm của Owner"
  if (customId === 'modal_owner_cfg_upstream') {
    const rawToken = interaction.fields.getTextInputValue('upstream_token')?.trim();
    if (!rawToken) {
      return interaction.reply({ content: '❌ Token không được để trống!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const { checkDiscordTokenAlive } = require('../utils/helpers');
    const check = await checkDiscordTokenAlive(rawToken);
    if (!check.alive) {
      return interaction.editReply({
        content: `❌ Token Discord không hợp lệ hoặc đã chết (${check.message || 'Lỗi xác thực'}). Vui lòng lấy lại token mà KHÔNG bấm Đăng xuất!`
      });
    }

    const guildId = interaction.guildId;
    if (guildId) {
      db.setGuildConfig(guildId, {
        upstreamToken: rawToken,
        upstreamUserTag: check.user ? `${check.user.username}` : 'Tài khoản Discord riêng'
      });
    }

    const upstreamBridge = require('../services/upstreamBridge');
    await upstreamBridge.loginWithToken(interaction.client, rawToken).catch(() => {});

    return interaction.editReply({
      content:
        `✅ **CÀI ĐẶT TOKEN TÀI KHOẢN SHOP GỐC CHO SERVER NÀY THÀNH CÔNG!**\n\n` +
        `• Tài khoản đã kết nối: **${check.user?.username || 'Discord User'}** (\`${check.user?.id || 'ID'}\`)\n` +
        `• Trạng thái: **🟢 Sẵn sàng nhận đơn tự động**\n` +
        `• Lưu bảo mật tại: \`data/guilds/${guildId}.json\`\n\n` +
        `👉 *Khi khách mua hàng trên server này, bot sẽ tự động dùng acc này để nộp đơn và trừ credit ở shop gốc!*`
    });
  }

  // 5. Modal "Tạo Key Credit bán khách"
  if (customId === 'modal_owner_create_key') {
    const creditsStr = interaction.fields.getTextInputValue('key_credits')?.trim();
    const countStr = interaction.fields.getTextInputValue('key_count')?.trim() || '1';

    const credits = parseInt(creditsStr, 10);
    const count = parseInt(countStr, 10) || 1;

    if (!credits || credits <= 0) {
      return interaction.reply({ content: '❌ Số credit cho mỗi key phải lớn hơn 0!', ephemeral: true });
    }

    const keys = [];
    for (let i = 0; i < count; i++) {
      const created = db.createKey({
        credits,
        guildId: interaction.guildId,
        createdBy: interaction.user.id
      });
      keys.push(created.code);
    }

    return interaction.reply({
      content:
        `🎉 **ĐÃ TẠO THÀNH CÔNG ${count} MÃ KEY (+${credits} CREDIT/KEY):**\n\n` +
        `\`\`\`\n${keys.join('\n')}\n\`\`\`\n` +
        `💡 *Khách có thể đổi key bằng lệnh \`/redeem key\` hoặc nút **[Đổi key]** trên bảng điều khiển!*`,
      ephemeral: true
    });
  }

  // 6. Modal "Cài đặt Giá & Giảm giá" cho Owner
  if (customId === 'modal_owner_cfg_pricing') {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ content: '❌ Lệnh này chỉ thực hiện được trong Server!', ephemeral: true });
    }

    const price1 = parseInt(interaction.fields.getTextInputValue('price_pack_1')?.replace(/\D/g, ''), 10) || 25000;
    const price5 = parseInt(interaction.fields.getTextInputValue('price_pack_5')?.replace(/\D/g, ''), 10) || 120000;
    const price10 = parseInt(interaction.fields.getTextInputValue('price_pack_10')?.replace(/\D/g, ''), 10) || 230000;
    const salePercent = parseInt(interaction.fields.getTextInputValue('sale_percent')?.trim(), 10) || 0;
    const saleDuration = parseInt(interaction.fields.getTextInputValue('sale_duration')?.trim(), 10) || 60;

    const { formatVND } = require('../utils/helpers');
    const newPackages = [
      {
        id: 'pack_1',
        credits: 1,
        price: price1,
        label: `Gói 1 xu - 1 xu, giá ${formatVND(price1)}`,
        description: `1 xu nạp nhanh vào tài khoản`
      },
      {
        id: 'pack_5',
        credits: 5,
        price: price5,
        label: `Gói 5 xu - 5 xu, giá ${formatVND(price5)}`,
        description: `5 xu nạp vào tài khoản`
      },
      {
        id: 'pack_10',
        credits: 10,
        price: price10,
        label: `Gói 10 xu - 10 xu, giá ${formatVND(price10)}`,
        description: `10 xu nạp vào tài khoản`
      }
    ];

    db.setGuildConfig(guildId, { packages: newPackages });

    let saleMsg = '';
    if (salePercent > 0) {
      db.startGuildSale(guildId, salePercent, saleDuration);
      saleMsg = `\n🔥 **Đã kích hoạt SALE giảm ${salePercent}%** trong vòng **${saleDuration} phút**!`;
    } else {
      db.stopGuildSale(guildId);
      saleMsg = `\nℹ️ Đã tắt chương trình sale (áp dụng giá gốc niêm yết).`;
    }

    // Tự động cập nhật Bảng giá trực tiếp trong kênh #price
    try {
      const updaterService = require('../services/updaterService');
      updaterService.notifyPricePanelChanged();
    } catch (e) {}

    return interaction.reply({
      content:
        `✅ **ĐÃ CẬP NHẬT BẢNG GIÁ & GIẢM GIÁ THÀNH CÔNG!**\n\n` +
        `• **Gói 1 xu:** ${formatVND(price1)}\n` +
        `• **Gói 5 xu:** ${formatVND(price5)}\n` +
        `• **Gói 10 xu:** ${formatVND(price10)}\n` +
        `${saleMsg}\n\n` +
        `👉 *Bảng giá trong kênh nạp xu đã được tự động chỉnh sửa trực tiếp theo giá mới!*`,
      ephemeral: true
    });
  }
}

module.exports = { handleModalInteraction };
