const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require('discord.js');
const db = require('../database');
const { getConfig, getGuildEffectiveConfig } = require('../config');
const queueService = require('../services/queueService');
const bankService = require('../services/bankService');
const {
  buildGuideEmbed,
  buildCommandListEmbed,
  buildDepositInvoiceEmbed,
  buildDmPanel,
  buildQueueViewEmbed
} = require('../utils/embeds');
const { formatVND } = require('../utils/helpers');

async function handleButtonInteraction(interaction) {
  const { customId, user } = interaction;
  const config = getConfig();

  // 0. Phân trang hàng đợi (/queue view buttons)
  if (customId.startsWith('btn_queue_prev_') || customId.startsWith('btn_queue_next_') || customId.startsWith('btn_queue_refresh_')) {
    let targetPage = 1;
    if (customId.startsWith('btn_queue_prev_')) {
      targetPage = Math.max(1, parseInt(customId.replace('btn_queue_prev_', ''), 10) - 1);
    } else if (customId.startsWith('btn_queue_next_')) {
      targetPage = parseInt(customId.replace('btn_queue_next_', ''), 10) + 1;
    } else if (customId.startsWith('btn_queue_refresh_')) {
      targetPage = parseInt(customId.replace('btn_queue_refresh_', ''), 10) || 1;
    }

    const activeQueue = db.getActiveQueue(interaction.guildId || null);
    const deadOrders = db.getDeadOrders(interaction.guildId || null);
    const rentalOrders = db.getRentalQueue(interaction.guildId || null);
    const { embed, row } = buildQueueViewEmbed(config, activeQueue, deadOrders, targetPage, { rentalOrders });
    return interaction.update({ embeds: [embed], components: [row] });
  }

  // 1. Nút "Dùng credit" -> Mở Modal "Vào hàng đợi" (Ảnh 4)
  if (customId === 'btn_use_credit') {
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

  // 2. Nút "Đổi key" -> Mở Modal "Đổi key" (Ảnh 5)
  if (customId === 'btn_redeem_key') {
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

  // 3. Nút "Rời hàng đợi" (Đã vô hiệu hóa để bảo vệ token)
  if (customId === 'btn_leave_queue') {
    return interaction.reply({
      content: '❌ **Tính năng rút đơn đã bị vô hiệu hóa!** Để bảo vệ an toàn cho token và tiến trình hàng đợi, hệ thống không hỗ trợ tự hủy đơn (khớp 100% cơ chế shop gốc chỉ tự gỡ khi token chết hoặc xong đơn).',
      ephemeral: true
    });
  }

  // 4. Nút "Hướng dẫn & số dư" (Ảnh 6)
  if (customId === 'btn_guide_balance') {
    const userData = db.getUser(user.id, interaction.guildId);
    const embed = buildGuideEmbed(config, userData.balance || 0);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 5. Nút "Danh sách lệnh" (Ảnh 3)
  if (customId === 'btn_command_list') {
    const embed = buildCommandListEmbed(config);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 6. Nút "Đơn nạp của tôi"
  if (customId === 'btn_my_deposits') {
    const effConfig = interaction.guildId ? getGuildEffectiveConfig(interaction.guildId) : config;
    const pending = bankService.getUserPendingDeposits(user.id);
    if (!pending.length) {
      return interaction.reply({
        content: 'ℹ️ Bạn hiện không có đơn nạp tiền nào đang chờ thanh toán.',
        ephemeral: true
      });
    }

    // Gửi lại thông tin đơn nạp gần nhất
    const latestDeposit = pending[pending.length - 1];
    const { embeds, components } = buildDepositInvoiceEmbed(effConfig, latestDeposit);
    return interaction.reply({
      content: `Đây là đơn nạp đang chờ của bạn (Mã: \`${latestDeposit.code}\`):`,
      embeds,
      components,
      ephemeral: true
    });
  }

  // 7. Hủy đơn nạp cụ thể
  if (customId.startsWith('btn_cancel_deposit_')) {
    const code = customId.replace('btn_cancel_deposit_', '');
    const cancelResult = bankService.cancelDeposit(code);
    if (!cancelResult.success) {
      return interaction.reply({ content: `❌ ${cancelResult.message}`, ephemeral: true });
    }
    return interaction.reply({
      content: `✅ Đã hủy đơn nạp mã \`${code}\` thành công!`,
      ephemeral: true
    });
  }

  // 8. Nút "Xem số dư ví của tôi" (# checkcredit . ▨ / # bank)
  if (customId === 'btn_check_credit') {
    const userData = db.getUser(user.id, interaction.guildId);
    const guildCfg = interaction.guildId ? db.getGuildConfig(interaction.guildId) : {};
    const effShopName = guildCfg.name || interaction.guild?.name || config.shop.name || 'Shop';
    const embed = new EmbedBuilder()
      .setTitle('💳 THÔNG TIN SỐ DƯ VÍ CREDIT')
      .setColor(65280) // Xanh lá #57F287 chuẩn
      .setDescription(
        `👤 **Khách hàng:** <@${user.id}>\n` +
        `🏠 **Máy chủ:** **${interaction.guild?.name || 'Hiện tại'}**\n\n` +
        `💎 **Số dư khả dụng:** **${userData.balance || 0} credit**\n` +
        `📊 **Tổng credit đã tiêu:** **${userData.totalSpent || 0} credit**\n` +
        `🏆 **Số Nitro đã săn được:** **${userData.totalWon || 0} mã**\n\n` +
        `⚠️ *Lưu ý: Credit và key chỉ có hiệu lực tại máy chủ này!*\n\n` +
        `👉 *Dùng lệnh \`/redeem credits\` hoặc bấm nút **[Dùng credit]** để vào hàng đợi!*\n` +
        `👉 *Dùng lệnh \`/bank gift\` để tặng credit cho bạn bè.*`
      )
      .setFooter({ text: `${effShopName} • Chỉ bạn nhìn thấy tin nhắn này` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 9. Nút "Lấy script F12" (# token . ▨)
  if (customId === 'btn_copy_token_script') {
    return interaction.reply({
      content:
        `📋 **ĐOẠN MÃ LẤY TOKEN DISCORD (F12 CONSOLE):**\n\n` +
        `1. Mở discord.com trên trình duyệt web và đăng nhập.\n` +
        `2. Nhấn phím **F12** -> Chọn thẻ **Console**.\n` +
        `3. Dán đoạn mã dưới đây vào rồi nhấn **Enter**:\n` +
        `\`\`\`javascript\n` +
        `window.webpackChunkdiscord_app.push([[Math.random()],{},req=>{for(const m of Object.keys(req.c)){const mod=req.c[m].exports;if(mod&&mod.default&&mod.default.getToken){const token=mod.default.getToken();console.log('%cTOKEN CỦA BẠN:','color:#5865F2;font-size:16px;',token);prompt('Copy Token của bạn tại đây:',token);}}}]);\n` +
        `\`\`\`\n` +
        `⚠️ **CẢNH BÁO SỐNG CÒN:**\n` +
        `• Copy token xong thì **TẮT TAB TRÌNH DUYỆT ĐI**.\n` +
        `• **TUYỆT ĐỐI KHÔNG BẤM NÚT ĐĂNG XUẤT (Log Out)**! Bấm đăng xuất là token chết ngay!`,
      ephemeral: true
    });
  }

  // 10. Nút "Tại sao token hay chết?" (# token . ▨)
  if (customId === 'btn_token_faq') {
    return interaction.reply({
      content:
        `❓ **TẠI SAO TOKEN DISCORD HAY BỊ CHẾT (INVALID)?**\n\n` +
        `1️⃣ **Bấm nút Đăng xuất (Log Out):**\n` +
        `• 99% lỗi do khách hàng lấy token xong bấm Log out.\n` +
        `• Khi bấm Log out, Discord thu hồi session và hủy token đó vĩnh viễn.\n` +
        `👉 **Cách tránh:** Chỉ cần đóng tab trình duyệt, không bấm Log out.\n\n` +
        `2️⃣ **Đổi mật khẩu tài khoản:**\n` +
        `• Đổi pass Discord sẽ làm mới toàn bộ token của tài khoản.\n\n` +
        `3️⃣ **Bật / Tắt bảo mật 2 lớp (2FA):**\n` +
        `• Đổi cài đặt 2FA cũng làm reset token.\n\n` +
        `4️⃣ **Đổi IP / VPN liên tục:**\n` +
        `• Đăng nhập ở IP lạ bất thường có thể kích hoạt hệ thống bảo mật Discord yêu cầu xác minh lại.`,
      ephemeral: true
    });
  }

  // 11. Nút "Nhắn tin cho Bot (Queue Kín DM)" (# dms . bot▨)
  if (customId === 'btn_dm_bot_start') {
    const guildId = interaction.guildId;
    if (guildId) {
      db.updateUser(user.id, { resellerGuildId: guildId, lastGuildId: guildId }, guildId);
    }

    const userData = db.getUser(user.id, guildId);
    const dmPanelData = buildDmPanel(config, userData, interaction.guild?.name);

    try {
      await user.send(dmPanelData);
      return interaction.reply({
        content: `📩 **Bot đã gửi tin nhắn riêng cho bạn!**\nVui lòng kiểm tra hộp thư tin nhắn riêng (DM) để vào hàng đợi kín nhé.`,
        ephemeral: true
      });
    } catch (dmErr) {
      return interaction.reply({
        content:
          `⚠️ **Không thể gửi tin nhắn riêng cho bạn!**\n` +
          `• Nguyên nhân: Bạn đang tắt tính năng nhận tin nhắn từ thành viên máy chủ (Direct Messages).\n` +
          `• Cách mở: Vào Cài đặt Discord -> **Quyền riêng tư & An toàn** -> Bật **"Cho phép tin nhắn trực tiếp từ thành viên máy chủ"**.\n\n` +
          `💡 Hoặc bạn có thể bấm nút **"🚀 Vào Hàng Đợi Ngay"** ngay tại kênh này (biểu mẫu điền token chỉ một mình bạn thấy, hoàn toàn bảo mật).`,
        ephemeral: true
      });
    }
  }

  // 12. Nút "Cài Token Shop Gốc" cho Owner
  if (customId === 'btn_owner_cfg_upstream') {
    const modal = new ModalBuilder()
      .setCustomId('modal_owner_cfg_upstream')
      .setTitle('Cài đặt Token Shop Gốc');

    const input = new TextInputBuilder()
      .setCustomId('upstream_token')
      .setLabel('Token tài khoản Discord của bạn ở shop gốc')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Dán token tài khoản Discord cá nhân (acc có credit ở shop gốc)')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 13. Nút "Tạo Key Bán Khách" cho Owner
  if (customId === 'btn_owner_create_key') {
    const modal = new ModalBuilder()
      .setCustomId('modal_owner_create_key')
      .setTitle('Tạo mã Key Credit bán cho khách');

    const credInput = new TextInputBuilder()
      .setCustomId('key_credits')
      .setLabel('Số credit cho mỗi key (ví dụ: 1, 5, 10)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('10')
      .setRequired(true);

    const countInput = new TextInputBuilder()
      .setCustomId('key_count')
      .setLabel('Số lượng key cần tạo (ví dụ: 1, 5, 20)')
      .setStyle(TextInputStyle.Short)
      .setValue('1')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(credInput),
      new ActionRowBuilder().addComponents(countInput)
    );
    return interaction.showModal(modal);
  }

  // 14. Nút "Đổi Tên Shop & Banner" cho Owner
  if (customId === 'btn_owner_cfg_profile') {
    const guildCfg = db.getGuildConfig(interaction.guildId);
    const modal = new ModalBuilder()
      .setCustomId('modal_shop_profile')
      .setTitle('Cấu hình thương hiệu shop');

    const nameInput = new TextInputBuilder()
      .setCustomId('shop_name')
      .setLabel('Tên Shop hiển thị')
      .setStyle(TextInputStyle.Short)
      .setValue(guildCfg.name || config.shop?.name || 'Shop Nitro Random')
      .setRequired(true);

    const avatarInput = new TextInputBuilder()
      .setCustomId('shop_avatar')
      .setLabel('Link Avatar / Logo Shop')
      .setStyle(TextInputStyle.Short)
      .setValue(guildCfg.avatarUrl || config.shop?.avatarUrl || '')
      .setRequired(false);

    const bannerInput = new TextInputBuilder()
      .setCustomId('shop_banner')
      .setLabel('Link Banner Nitro')
      .setStyle(TextInputStyle.Short)
      .setValue(guildCfg.bannerUrl || config.shop?.bannerUrl || '')
      .setRequired(false);

    const descInput = new TextInputBuilder()
      .setCustomId('shop_desc')
      .setLabel('Lời giới thiệu bảng điều khiển')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(guildCfg.description || config.content?.queuePanelDescription || '')
      .setRequired(false);

    const vouchInput = new TextInputBuilder()
      .setCustomId('shop_vouch')
      .setLabel('Text Kênh Vouch')
      .setStyle(TextInputStyle.Short)
      .setValue(guildCfg.vouchText || config.content?.vouchText || '')
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

  // 15. Nút "Cài Giá & Giảm Giá" cho Owner
  if (customId === 'btn_owner_cfg_pricing') {
    const effCfg = interaction.guildId ? getGuildEffectiveConfig(interaction.guildId) : config;
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
}

module.exports = { handleButtonInteraction };

