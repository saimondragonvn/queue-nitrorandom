const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');
const { formatVND, formatUSD, getVietQRUrl, timeAgo, formatDateTime } = require('./helpers');

/**
 * 1. Bảng giá nạp thẻ / Shop Panel (Ảnh 1)
 */
function buildShopPanel(config, sale = null) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: config.shop?.name || 'Shop Nitro Random' })
    .setColor(config.shop?.primaryColor || '#5865F2');

  if (config.shop?.bannerUrl && typeof config.shop.bannerUrl === 'string' && config.shop.bannerUrl.startsWith('http')) {
    embed.setImage(config.shop.bannerUrl);
  }
  if (config.shop?.avatarUrl && typeof config.shop.avatarUrl === 'string' && config.shop.avatarUrl.startsWith('http')) {
    embed.setThumbnail(config.shop.avatarUrl);
  }

  const isSaleActive = Boolean(sale && sale.active && sale.discountPercent > 0);
  const packages = (config.pricing?.packages && config.pricing.packages.length > 0)
    ? config.pricing.packages
    : [
        { id: 'pack_1', credits: 1, price: 25000, label: 'Gói 1 xu - 1 xu, giá 25.000đ' },
        { id: 'pack_5', credits: 5, price: 120000, label: 'Gói 5 xu - 5 xu, giá 120.000đ' },
        { id: 'pack_10', credits: 10, price: 230000, label: 'Gói 10 xu - 10 xu, giá 230.000đ' }
      ];

  const packLines = packages.map(p => {
    const rawLabel = (p.label || `Gói ${p.credits} xu`).split('-')[0].trim();
    if (isSaleActive) {
      const discountedPrice = Math.max(1000, Math.round(p.price * (1 - sale.discountPercent / 100)));
      return `**${rawLabel}** - ${p.credits} xu, giá ~~${formatVND(p.price)}~~ ➔ **${formatVND(discountedPrice)}** 🔥 (-${sale.discountPercent}%)`;
    }
    return `**${rawLabel}** - ${p.credits} xu, giá ${formatVND(p.price)}`;
  });

  let saleHeader = '';
  if (isSaleActive) {
    let timeLeftText = '';
    if (sale.expiresAt) {
      const mins = Math.max(0, Math.round((new Date(sale.expiresAt) - new Date()) / 60000));
      timeLeftText = ` (Còn ${mins} phút)`;
    }
    saleHeader = `🔥 **SỰ KIỆN SALE GIẢM GIÁ ${sale.discountPercent}% ĐANG DIỄN RA!**${timeLeftText}\nNhanh tay nạp xu để nhận ưu đãi cực hot!\n\n`;
  }

  let vouchDisplay = 'Vouch: # ⊹˖ · 『✅』';
  const vouchChannelId = config.channels?.vouchChannelId;
  let isValidChannelId = Boolean(vouchChannelId && vouchChannelId !== '123456789012345678' && !vouchChannelId.startsWith('123456'));

  if (isValidChannelId) {
    try {
      const { client } = require('../index');
      if (client?.channels?.cache) {
        const ch = client.channels.cache.get(vouchChannelId);
        // Nếu kênh không tồn tại hoặc thuộc Guild khác -> KHÔNG hợp lệ để tránh lộ nguồn
        if (ch && config.guildId && ch.guildId !== config.guildId) {
          isValidChannelId = false;
        }
      }
    } catch (e) {}
  }

  if (isValidChannelId) {
    vouchDisplay = `Vouch: <#${vouchChannelId}> · 『✅』`;
  } else if (config.content?.vouchText && !config.content.vouchText.includes('123456789012345678')) {
    let vt = config.content.vouchText.replace(/\|\s*𝐋𝐞𝐠𝐢𝐭\s*·?\s*\d*/gi, '').replace(/\|\s*Legit\s*·?\s*\d*/gi, '').trim();
    try {
      const { client } = require('../index');
      const m = vt.match(/<#(\d+)>/);
      if (m && client?.channels?.cache) {
        const ch = client.channels.cache.get(m[1]);
        if (ch && config.guildId && ch.guildId !== config.guildId) {
          vt = 'Vouch: # ⊹˖ · 『✅』';
        }
      }
    } catch (e) {}
    vouchDisplay = vt;
  }

  embed.setDescription(
    `${saleHeader}` +
    `${packLines.join('\n')}\n\n` +
    `Chọn các gói dưới đây để mua!\n` +
    `${vouchDisplay}`
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_pack_deposit')
    .setPlaceholder(isSaleActive ? `🔥 Chọn gói nạp (Đang giảm ${sale.discountPercent}%)` : 'Chọn gói nạp')
    .addOptions(
      packages.map(p => {
        const rawLabel = (p.label || `Gói ${p.credits} xu`).split('-')[0].trim();
        let desc = `${p.credits} xu, giá ${formatVND(p.price)}`;
        if (isSaleActive) {
          const discountedPrice = Math.max(1000, Math.round(p.price * (1 - sale.discountPercent / 100)));
          desc = `${p.credits} xu, giá ${formatVND(discountedPrice)} (🔥 SALE -${sale.discountPercent}%)`;
        }
        return {
          label: rawLabel,
          description: desc,
          value: p.id
        };
      })
    );

  const row1 = new ActionRowBuilder().addComponents(selectMenu);

  const myDepositsBtn = new ButtonBuilder()
    .setCustomId('btn_my_deposits')
    .setLabel('Đơn nạp của tôi')
    .setStyle(ButtonStyle.Secondary);

  const row2 = new ActionRowBuilder().addComponents(myDepositsBtn);

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * 2. Bảng điều khiển Nitro Random / Queue Panel (Ảnh 2)
 */
function buildQueuePanel(config) {
  const isSameChannel = Boolean(
    config.channels?.priceChannelId &&
    config.channels?.panelChannelId &&
    config.channels.priceChannelId === config.channels.panelChannelId
  );
  let priceNote = '';

  if (!isSameChannel && config.channels?.priceChannelId) {
    let isValidPriceChannel = true;
    try {
      const { client } = require('../index');
      if (client?.channels?.cache) {
        const ch = client.channels.cache.get(config.channels.priceChannelId);
        if (ch && config.guildId && ch.guildId !== config.guildId) {
          isValidPriceChannel = false;
        }
      }
    } catch (e) {}

    if (isValidPriceChannel) {
      priceNote = `\n\nBảng giá các gói credit nằm ở <#${config.channels.priceChannelId}>.`;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(config.content.queuePanelTitle || 'Nitro Random')
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(
      `${config.content.queuePanelDescription}${priceNote}`
    );

  const queueBanner = config.shop.queueBannerUrl || config.shop.bannerUrl;
  if (queueBanner) {
    embed.setImage(queueBanner);
  }

  // Row 1: 3 nút chính (Khớp shop gốc không có nút rời hàng đợi cho khách)
  const btnUseCredit = new ButtonBuilder()
    .setCustomId('btn_use_credit')
    .setLabel('Dùng credit')
    .setStyle(ButtonStyle.Success);

  const btnRedeemKey = new ButtonBuilder()
    .setCustomId('btn_redeem_key')
    .setLabel('Đổi key')
    .setStyle(ButtonStyle.Primary);

  const btnGuide = new ButtonBuilder()
    .setCustomId('btn_guide_balance')
    .setLabel('Hướng dẫn & số dư')
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(btnUseCredit, btnRedeemKey, btnGuide);

  // Row 2: Danh sách lệnh
  const btnCommandList = new ButtonBuilder()
    .setCustomId('btn_command_list')
    .setLabel('Danh sách lệnh')
    .setStyle(ButtonStyle.Secondary);

  const row2 = new ActionRowBuilder().addComponents(btnCommandList);

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * 3. Hướng dẫn & số dư (Ảnh 6)
 */
function buildGuideEmbed(config, userBalance) {
  const guideTitle = config.content.guideTitle || `Hướng dẫn ${config.shop.name || 'Shop'}`;

  const balanceText = (userBalance !== null && userBalance !== undefined)
    ? `**Số dư của bạn:** ${userBalance} credit\n\n`
    : `💳 **Số dư cá nhân:** Nhấn nút **[💳 Xem số dư của tôi]** bên dưới (chỉ bạn thấy) hoặc gõ \`/bank balance\`\n\n`;

  return new EmbedBuilder()
    .setTitle(guideTitle)
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(
      balanceText +
      `**Lấy token ở đâu?**\n` +
      `${config.content.tokenGuide}\n\n` +
      `**Ưu tiên là gì?**\n` +
      `${config.content.priorityGuide}`
    );
}

/**
 * Bảng Hướng dẫn & Tra cứu số dư trong kênh bank (kèm nút bấm)
 */
function buildBankChannelGuide(config) {
  const embed = buildGuideEmbed(config, null);
  const btnCheckCredit = new ButtonBuilder()
    .setCustomId('btn_check_credit')
    .setLabel('💳 Xem số dư của tôi')
    .setStyle(ButtonStyle.Success);

  const btnRedeemKey = new ButtonBuilder()
    .setCustomId('btn_redeem_key')
    .setLabel('🔑 Đổi key')
    .setStyle(ButtonStyle.Primary);

  const btnUseCredit = new ButtonBuilder()
    .setCustomId('btn_use_credit')
    .setLabel('🚀 Dùng credit')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(btnCheckCredit, btnRedeemKey, btnUseCredit);
  return { embeds: [embed], components: [row] };
}

/**
 * 4. Danh sách lệnh (Ảnh 3)
 */
function buildCommandListEmbed(config) {
  return new EmbedBuilder()
    .setTitle('Các lệnh dành cho khách')
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(
      `**Ngay trên bảng Nitro Random:**\n` +
      `• Dùng credit — vào hàng đợi (điền số lượt + token)\n` +
      `• Hướng dẫn & số dư — xem credit + cách lấy token\n\n` +
      `**Lệnh gạch chéo (/):**\n` +
      `• \`/redeem key\` — đổi key lấy credit\n` +
      `• \`/redeem credits\` — dùng credit vào hàng đợi\n` +
      `• \`/rejoin\` — vào lại hàng đợi khi token chết\n` +
      `• \`/queue check\` — xem đơn của bạn\n` +
      `• \`/bank balance\` — xem số dư credit\n` +
      `• \`/bank gift\` — tặng credit cho người khác\n\n` +
      `**Lệnh tiền tố (;):**\n` +
      `• \`;queue\` ( \`;q\` ) — xem hàng đợi\n` +
      `• \`;queue-status\` ( \`;mystatus\` ) — trạng thái đơn của bạn\n` +
      `• \`;banktop\` ( \`;top\` ) — bảng xếp hạng credit`
    )
    .setFooter({ text: `${config.shop.name} • Hôm nay lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` });
}

/**
 * 5. Hóa đơn nạp tiền VietQR (Ảnh 7)
 */
function buildDepositInvoiceEmbed(config, deposit) {
  const qrUrl = config.bank.customQrUrl || getVietQRUrl(
    config.bank.bankId,
    config.bank.accountNo,
    config.bank.accountName,
    deposit.amount,
    deposit.code,
    config.bank.qrTemplate || 'compact2'
  );

  const embed = new EmbedBuilder()
    .setTitle(`Nạp ${deposit.credits} credit`)
    .setColor('#57F287') // Border xanh lá như trong ảnh 7
    .setDescription(
      `Số tiền: **${formatVND(deposit.amount)}**\n` +
      `Nội dung chuyển khoản: \`${deposit.code}\`\n\n` +
      `**Ghi đúng nội dung này** thì chủ shop mới biết ai vừa trả nhé.\n\n` +
      `**Ngân hàng**    **Số tài khoản**        **Chủ tài khoản**\n` +
      `${config.bank.bankId}         ${config.bank.accountNo}      ${config.bank.accountName}\n\n` +
      `**Hạn của mã**\n` +
      `\`một giờ tới\``
    )
    .setImage(qrUrl);

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`btn_cancel_deposit_${deposit.code}`)
    .setLabel('Hủy đơn nạp')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(cancelBtn);

  return { embeds: [embed], components: [row] };
}

/**
 * 6. Xếp hạng credit (Ảnh 8)
 */
function buildLeaderboardEmbed(config, topUsers, totalCredits) {
  const lines = topUsers.map(u => `<@${u.id}> — ${u.balance} credit`);
  const content = lines.length ? lines.join('\n') : 'Chưa có dữ liệu thành viên nào.';

  return new EmbedBuilder()
    .setTitle(`${config.shop.name} — Xếp hạng credit`)
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(content)
    .setFooter({ text: `Tổng credit của bảng: ${totalCredits} — cập nhật vừa xong` });
}

/**
 * 7. Thống kê săn Nitro (Ảnh 9)
 */
function buildStatsEmbed(config, stats) {
  const total = stats.totalClaims || 0;
  const basicCount = stats.basicCount || 0;
  const boostCount = stats.boostCount || 0;

  const basicPercent = total > 0 ? ((basicCount / total) * 100).toFixed(1) : '0.0';
  const boostPercent = total > 0 ? ((boostCount / total) * 100).toFixed(1) : '0.0';

  return new EmbedBuilder()
    .setTitle(`${config.shop.name} — Thống kê`)
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(
      `**Tổng cộng** — đã săn được ${total} mã, trị giá ${formatUSD(stats.totalValueUsd)} - ${formatVND(stats.totalValueVnd)}\n` +
      `**Hôm nay** — đã săn được ${stats.claimsToday || 0} mã, trị giá ${formatUSD(stats.todayValueUsd)} - ${formatVND(stats.todayValueVnd)}\n\n` +
      `**Tỉ lệ ra từng loại**\n` +
      `Nitro Basic – Tháng — ${basicCount} mã, chiếm ${basicPercent}%\n` +
      `Nitro – Tháng — ${boostCount} mã, chiếm ${boostPercent}%`
    )
    .setFooter({ text: `Bảng tự cập nhật sau mỗi lượt săn được — vừa xong` });
}

/**
 * 8. Hàng đợi Nitro (Khớp 100% layout shop gốc)
 */
function buildQueuePaginationRow(currentPage, totalPages) {
  const prevBtn = new ButtonBuilder()
    .setCustomId(`btn_queue_prev_${currentPage}`)
    .setLabel('◀ Trước')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage <= 1);

  const pageBtn = new ButtonBuilder()
    .setCustomId(`btn_queue_page_indicator`)
    .setLabel(`${currentPage}/${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`btn_queue_next_${currentPage}`)
    .setLabel('Sau ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages);

  const refreshBtn = new ButtonBuilder()
    .setCustomId(`btn_queue_refresh_${currentPage}`)
    .setLabel('🔄 Cập nhật')
    .setStyle(ButtonStyle.Success);

  return new ActionRowBuilder().addComponents(prevBtn, pageBtn, nextBtn, refreshBtn);
}

function buildQueueViewEmbed(config, queueList = [], deadOrders = [], page = 1, options = {}) {
  const maxShield = config.queueSettings?.maxShield || 10;
  const rentalOrders = options.rentalOrders || [];
  const timeAgo = options.timeAgo || 'vừa xong';

  const currentTurnIcon = config.queueSettings?.currentTurnEmoji || '<a:00ihello:1547069327587541042>';
  const waitingTurnIcon = config.queueSettings?.waitingTurnEmoji || '<a:7278loadingdonotdisturbcircle:1504292752173826231>';
  const priorityIcon = config.queueSettings?.priorityEmoji || '<a:kendallzstore:1502813746953851041>';
  const shieldIcon = config.queueSettings?.shieldEmoji || '✔';
  const itemsPerPage = 15;
  const totalPages = Math.max(1, Math.ceil(queueList.length / itemsPerPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageItems = queueList.slice(startIndex, startIndex + itemsPerPage);

  let queueLines = '';
  if (!queueList.length) {
    queueLines = 'Hiện tại chưa có đơn nào trong hàng đợi.';
  } else {
    queueLines = pageItems
      .map((item, idx) => {
        const globalIndex = startIndex + idx + 1;
        const priorityTag = item.isPriority ? ` [${priorityIcon}]` : '';
        const turnsDisplay = `${item.completedTurns || 0}/${item.initialTurns || 1}`;

        if (globalIndex === 1) {
          // Line 1 (tới lượt): Chỉ hiển thị khiên bảo vệ 0/10 khi có bật Guaranteed Boost (isPriority)
          const shieldPart = item.isPriority ? ` ${shieldIcon} ${item.shield || 0}/${maxShield}` : '';
          return `${globalIndex}) \`${item.username || item.userId}\` : \`${turnsDisplay}\`${priorityTag}${shieldPart} ${currentTurnIcon}`;
        } else {
          // Line 2+ (chờ đợi): 2) `username` : `0/1` <waitingTurnIcon>
          return `${globalIndex}) \`${item.username || item.userId}\` : \`${turnsDisplay}\`${priorityTag} ${waitingTurnIcon}`;
        }
      })
      .join('\n');
  }

  // Section 1: Hàng đợi đặc biệt — Thuê bot
  const botRentalCount = rentalOrders ? rentalOrders.length : 0;
  const botRentalRemainingTurns = rentalOrders ? rentalOrders.reduce((acc, o) => acc + (o.remainingTurns || 0), 0) : 0;
  let specialSection = '';
  if (botRentalCount > 0) {
    specialSection =
      `\n\n**Hàng đợi đặc biệt — Thuê bot**\n` +
      `${botRentalCount} đơn · còn ${botRentalRemainingTurns} lượt`;
  }

  // Section 2: Token chết — đã hoàn credit (Chỉ hiển thị khi có đơn còn hạn /rejoin)
  let deadSection = '';
  if (deadOrders && deadOrders.length > 0) {
    const deadByUser = {};
    for (const o of deadOrders) {
      const uid = o.userId;
      if (!deadByUser[uid]) {
        deadByUser[uid] = {
          username: o.username || uid,
          ordersCount: 0,
          turnsCount: 0,
          pausedAt: o.pausedAt
        };
      }
      deadByUser[uid].ordersCount += 1;
      deadByUser[uid].turnsCount += (o.remainingTurns || 0);
      if (new Date(o.pausedAt) < new Date(deadByUser[uid].pausedAt || Date.now())) {
        deadByUser[uid].pausedAt = o.pausedAt;
      }
    }

    const deadLines = [];
    const now = Date.now();
    for (const u of Object.values(deadByUser)) {
      const pausedTime = new Date(u.pausedAt || now).getTime();
      const expiryTime = pausedTime + (60 * 60 * 1000);
      const diffMinutes = Math.round((expiryTime - now) / (60 * 1000));
      if (diffMinutes <= 0) continue; // Quá hạn tự động biến mất
      const expiryText = diffMinutes > 60 ? `${Math.round(diffMinutes / 60)} giờ tới` : `${diffMinutes} phút tới`;
      deadLines.push(`\`${u.username}\` · ${u.ordersCount} đơn · ${u.turnsCount} lượt · hạn \`${expiryText}\``);
    }

    if (deadLines.length > 0) {
      deadSection =
        `\n\n**Token chết — đã hoàn credit**\n` +
        `\`/rejoin\` để tiếp tục (bị trừ lại credit) hoặc bỏ qua.\n` +
        deadLines.join('\n');
    }
  }

  const description = `${queueLines}${specialSection}${deadSection}`;

  const totalTurns =
    queueList.reduce((acc, o) => acc + (o.remainingTurns || 0), 0) + botRentalRemainingTurns;
  const deadCount = deadOrders ? deadOrders.length : 0;

  const embed = new EmbedBuilder()
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(description)
    .setFooter({
      text: `Trang ${currentPage}/${totalPages} · ${queueList.length} đang chạy · ${deadCount} đơn chờ /rejoin · ${botRentalCount} thuê bot · còn ${totalTurns} lượt · ${timeAgo}`
    });

  if (config.shop.queueStatusBannerUrl) {
    embed.setImage(config.shop.queueStatusBannerUrl);
  }

  const row = buildQueuePaginationRow(currentPage, totalPages);

  return { embed, row, totalPages, currentPage };
}

/**
 * 9. Live Claim Notification & Status Tracker (Ảnh 10 & 11)
 */
function buildLiveClaimTracker(config, { claim, user, nextOrder, queueList, stats, pingRoleId, tokenUser = null }) {
  const isPriorityBasic = claim.deductedTurn === false;
  const turnStatus = isPriorityBasic ? '**không trừ lượt** (Ưu tiên ra Nitro Basic)' : 'đã trừ 1 lượt';

  // Helper tự động tìm emoji có sẵn trong bot cache hoặc dùng ID chuẩn của máy chủ
  const resolveEmoji = (name, fallback) => {
    try {
      const { client } = require('../index');
      if (client?.emojis?.cache) {
        const found = client.emojis.cache.find(e => e.name === name);
        if (found) return `<${found.animated ? 'a:' : ':'}${found.name}:${found.id}>`;
      }
    } catch (e) {}
    return fallback;
  };

  const isBasic = (claim.nitroType || '').toLowerCase().includes('basic');
  const nitroEmoji = isBasic
    ? resolveEmoji('nitrobasic1123', config.shop?.nitroBasicEmoji || '<a:nitrobasic1123:1559191128509522020>')
    : resolveEmoji('kendallzstore', config.shop?.nitroBoostEmoji || '<a:kendallzstore:1559191135254224956>');

  // Xử lý thông minh người trúng để tránh hiển thị "@Người dùng không xác định":
  // 1. Nếu tài khoản token CÓ ở trong server: Ping trực tiếp <@tokenUser.id>
  // 2. Nếu tài khoản token KHÔNG ở trong server: Ping người đặt đơn <@user.id> kèm tên token **@username**
  let winnerChatDisplay = `<@${user.id}>`;
  let winnerEmbedDisplay = `<@${user.id}>`;

  if (tokenUser && tokenUser.id) {
    if (tokenUser.inGuild) {
      winnerChatDisplay = `<@${tokenUser.id}>`;
      winnerEmbedDisplay = `<@${tokenUser.id}>`;
    } else {
      const tokenName = tokenUser.username ? `@${tokenUser.username}` : `ID ${tokenUser.id}`;
      winnerChatDisplay = `<@${user.id}> (Token: **${tokenName}**)`;
      winnerEmbedDisplay = `<@${user.id}> (Token: **${tokenName}**)`;
    }
  }

  // Embed viền xanh lá (Ảnh 10)
  const embed = new EmbedBuilder()
    .setTitle('Vừa săn được')
    .setColor('#57F287')
    .addFields(
      {
        name: '\u200B',
        value: `${nitroEmoji} **${claim.nitroType}** · ${claim.speedMs}ms`,
        inline: false
      },
      {
        name: 'Vào tay ai',
        value: `${winnerEmbedDisplay} · \`${claim.completedTurns || 0}/${claim.initialTurns || 1}\` · ${turnStatus}`,
        inline: false
      },
      {
        name: 'Hôm nay',
        value: `\`${stats.claimsToday || 0} mã\` · \`${formatUSD(stats.todayValueUsd || 0)} - ${formatVND(stats.todayValueVnd || 0)}\``,
        inline: true
      },
      {
        name: 'Tới lượt ai',
        value: nextOrder
          ? `<@${nextOrder.userId}> · \`${nextOrder.completedTurns}/${nextOrder.initialTurns}\`\ncòn ${queueList.length} đơn · ${queueList.reduce((acc, o) => acc + o.remainingTurns, 0)} lượt đang xếp hàng`
          : 'Hàng đợi đang trống',
        inline: true
      }
    )
    .setFooter({
      text: `Bảng tự cập nhật sau mỗi lượt săn được • ${formatDateTime()}`
    });

  // Message chat đi kèm ping role (Ảnh 10, 11)
  const targetPingRoleId = pingRoleId || config.channels?.claimPingRoleId;
  const chatMessage =
    `${nitroEmoji} ${winnerChatDisplay} vừa săn được **${claim.nitroType}** trong \`${claim.speedMs}ms\` — ${claim.completedTurns || 0} trên ${claim.initialTurns || 1} lượt.` +
    (targetPingRoleId ? ` <@&${targetPingRoleId}>` : '');

  return { chatMessage, embed };
}

/**
 * 10. Hướng dẫn lấy Token Discord (# token . ▨)
 */
function buildTokenGuideChannelEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 Hướng Dẫn Lấy Token Discord Nhận Quà`)
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(
      `Token là chìa khóa để hệ thống tự động đưa phần thưởng Nitro trực tiếp vào tài khoản của bạn khi săn trúng!\n\n` +
      `**Cách 1: Lấy trên Máy tính (PC / Laptop) qua F12 Console**\n` +
      `1️⃣ Đăng nhập Discord trên trình duyệt web (Chrome, Edge, Brave, Cốc Cốc, Cốc Cốc...).\n` +
      `2️⃣ Nhấn phím **F12** (hoặc \`Ctrl + Shift + I\`) để mở cửa sổ DevTools.\n` +
      `3️⃣ Chuyển sang thẻ **Console**.\n` +
      `4️⃣ Bấm nút **"📋 Lấy Script F12"** bên dưới để nhận đoạn code dán vào Console rồi Enter.\n\n` +
      `**Cách 2: Lấy qua tab Network**\n` +
      `• Mở thẻ Network -> Lọc chữ \`messages\` hoặc \`science\` -> Chọn 1 dòng -> Thẻ Headers -> Kéo xuống tìm mục \`authorization\`.\n\n` +
      `⚠️ **LƯU Ý CỰC KỲ QUAN TRỌNG (TRÁNH CHẾT TOKEN):**\n` +
      `• Sau khi copy được Token, bạn chỉ cần **TẮT TAB TRÌNH DUYỆT ĐI**.\n` +
      `• ❌ **TUYỆT ĐỐI KHÔNG ĐƯỢC BẤM NÚT "ĐĂNG XUẤT" (Log Out)** trên Discord! Bấm Log out thì Discord sẽ hủy token đó ngay lập tức khiến đơn hàng đợi bị lỗi!`
    )
    .setFooter({ text: `${config.shop.name} • Bảo mật thông tin người dùng 100%` });

  const btnScript = new ButtonBuilder()
    .setCustomId('btn_copy_token_script')
    .setLabel('📋 Lấy Script F12')
    .setStyle(ButtonStyle.Primary);

  const btnFaq = new ButtonBuilder()
    .setCustomId('btn_token_faq')
    .setLabel('❓ Tại Sao Token Hay Bị Chết?')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(btnScript, btnFaq);
  return { embeds: [embed], components: [row] };
}

/**
 * 11. Kiểm tra số dư & Quản lý ví Credit (# checkcredit . ▨)
 */
function buildCheckCreditChannelEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle(`💳 Tra Cứu Số Dư & Quản Lý Ví Credit`)
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(
      `Ví credit dùng để quy đổi lượt tham gia hàng đợi săn Nitro Random.\n\n` +
      `**Quy ước quy đổi:**\n` +
      `• **1 credit** = 1 lượt quay thông thường (Nitro Basic & Boost).\n` +
      `• **3 credit** = 1 lượt Ưu tiên (Guaranteed Boost - không mất lượt khi trúng Nitro Basic).\n\n` +
      `**Cách có thêm Credit:**\n` +
      `• Nạp tự động qua VietQR tại kênh bảng giá hoặc lệnh \`/bank\`.\n` +
      `• Nhận mã Key quà tặng từ sự kiện và nhập bằng nút **"Đổi key"**.\n\n` +
      `👇 Bấm các nút dưới đây để kiểm tra thông tin ví hoặc đổi mã của bạn ngay:`
    )
    .setFooter({ text: `${config.shop.name} • Kiểm tra ví bảo mật ẩn danh` });

  const btnCheck = new ButtonBuilder()
    .setCustomId('btn_check_credit')
    .setLabel('💳 Xem Số Dư Của Tôi')
    .setStyle(ButtonStyle.Primary);

  const btnRedeem = new ButtonBuilder()
    .setCustomId('btn_redeem_key')
    .setLabel('🔑 Đổi Mã Key')
    .setStyle(ButtonStyle.Success);

  const btnDeposits = new ButtonBuilder()
    .setCustomId('btn_my_deposits')
    .setLabel('📜 Đơn Nạp Của Tôi')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(btnCheck, btnRedeem, btnDeposits);
  return { embeds: [embed], components: [row] };
}

/**
 * 12. Chế độ DM Bot kín cho Reseller (# dms . bot▨)
 */
function buildResellerDmsBotChannelEmbed(config, claimChannelId) {
  const embed = new EmbedBuilder()
    .setTitle(`🔒 Chế Độ Săn Kín Qua Tin Nhắn Riêng (DM Bot - Dành Cho Reseller)`)
    .setColor('#57F287')
    .setDescription(
      `🌟 **Bảo Mật Nguồn Tuyệt Đối & Giữ Kín Token Cho Reseller!**\n\n` +
      `• **Không Lộ Token & Nguồn Hàng:** Khách hàng hoặc Reseller thao tác nạp đơn, dán token trực tiếp qua tin nhắn riêng (DM) với Bot. Không một ai trong server nhìn thấy token hay biết nguồn gốc đơn hàng.\n` +
      `• **Tự Động Báo Trúng Ở Server Này:** Khi tài khoản săn trúng Nitro (Basic hoặc Boost), Bot sẽ **tự động đăng thông báo chúc mừng trúng quà tại kênh <#${claimChannelId}>** của Server này!\n` +
      `• **Tạo Uy Tín Bán Hàng:** Mọi người trong server sẽ thấy bạn liên tục giao đơn thành công mà vẫn giữ bí mật tuyệt đối nguồn hàng sỉ của bạn.\n\n` +
      `👉 **Bấm nút dưới đây để bắt đầu gửi đơn kín qua DM hoặc mở biểu mẫu ngay:**`
    )
    .setFooter({ text: `${config.shop.name} • Hỗ trợ Reseller & Khách Sỉ` });

  const btnStartDm = new ButtonBuilder()
    .setCustomId('btn_dm_bot_start')
    .setLabel('💬 Nhắn Tin Cho Bot (Queue Kín DM)')
    .setStyle(ButtonStyle.Primary);

  const btnEnterQueue = new ButtonBuilder()
    .setCustomId('btn_use_credit')
    .setLabel('🚀 Vào Hàng Đợi Ngay (Mở Form)')
    .setStyle(ButtonStyle.Success);

  const btnCheckCredit = new ButtonBuilder()
    .setCustomId('btn_check_credit')
    .setLabel('💳 Xem Số Dư Ví')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(btnStartDm, btnEnterQueue, btnCheckCredit);
  return { embeds: [embed], components: [row] };
}

/**
 * 13. Giao diện tin nhắn riêng (DM Panel) gửi cho khách/reseller
 */
function buildDmPanel(config, user, targetGuildName) {
  const embed = new EmbedBuilder()
    .setTitle(`💎 BẢNG ĐIỀU KHIỂN SĂN KÍN (DM RESELLER MODE)`)
    .setColor(config.shop.primaryColor || '#5865F2')
    .setDescription(
      `Xin chào <@${user.id}>!\n` +
      `Bạn đang thao tác trực tiếp với bot trong tin nhắn riêng tư (DM).\n\n` +
      `• 🛡️ **Bảo mật:** 100% token tài khoản và thao tác queue được giữ kín.\n` +
      `• 📢 **Kênh thông báo trúng quà:** **${targetGuildName || 'Server của bạn'}**\n` +
      `• 💰 **Số dư ví hiện tại:** **${user.balance || 0} credit**\n` +
      `• 🎁 **Tổng mã đã trúng:** **${user.totalWon || 0} mã**\n\n` +
      `Bấm nút bên dưới để vào hàng đợi hoặc kiểm tra ví:`
    )
    .setFooter({ text: `${config.shop.name} • DM Mode Stealth Queue` });

  const btnQueue = new ButtonBuilder()
    .setCustomId('btn_use_credit')
    .setLabel('🚀 Vào Hàng Đợi (Dùng Credit)')
    .setStyle(ButtonStyle.Success);

  const btnRedeem = new ButtonBuilder()
    .setCustomId('btn_redeem_key')
    .setLabel('🔑 Đổi Mã Key')
    .setStyle(ButtonStyle.Primary);

  const btnCheck = new ButtonBuilder()
    .setCustomId('btn_check_credit')
    .setLabel('💳 Xem Số Dư')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(btnQueue, btnRedeem, btnCheck);
  return { embeds: [embed], components: [row] };
}

/**
 * 15. Bảng hàng đợi đồng bộ 100% thời gian thực từ shop gốc
 */
function buildSyncedQueueEmbed(config, rootQueue) {
  const embed = new EmbedBuilder()
    .setColor(config.shop.primaryColor || '#5865F2');

  let titleLine = '';
  if (rootQueue.titleText) {
    titleLine = rootQueue.titleText.replace(/^#\s*[^·\n]+·/, `# ${config.shop.name || 'HQ SHOP'} ·`) + '\n\n';
  }

  embed.setDescription(`${titleLine}${rootQueue.queueLines}${rootQueue.specialSection || ''}${rootQueue.deadSection || ''}`);

  const banner = config.shop.queueStatusBannerUrl || rootQueue.bannerUrl;
  if (banner) {
    embed.setImage(banner);
  }

  if (rootQueue.footerText) {
    embed.setFooter({ text: `${rootQueue.footerText}` });
  }

  const row = buildQueuePaginationRow(1, 1);
  return { embed, row };
}

/**
 * 15. Chống lộ nguồn gốc (Whitelabel & Sanitize upstream embed)
 * Thay thế 100% Avatar / Thumbnail thành avatar của Server mà bot đang ở,
 * Thay thế Footer thành Tên Server và Icon của Server,
 * Xoá bỏ tên acc sỉ (giahoaimeomeoz) thay bằng tên Discord của khách,
 * Thay thế số dư acc sỉ thành số dư thực tế của khách tại server này.
 */
function sanitizeAndWhitelabelEmbed(rawEmbedOrBuilder, guild = null, config = null, options = {}) {
  const { customerUser, customerBalance, client } = options;
  const db = require('../database');
  const guildCfg = guild?.id ? db.getGuildConfig(guild.id) : {};

  // Xác định Server hiện tại mà bot đang ở
  const resolvedGuild = guild || (guildCfg.guildId && client ? client.guilds.cache.get(guildCfg.guildId) : null);
  const serverName = resolvedGuild?.name || guildCfg.name || config?.shop?.name || 'Shop';

  // LẤY AVATAR CỦA SERVER MÀ BOT ĐANG Ở
  let serverIcon = null;
  if (resolvedGuild && typeof resolvedGuild.iconURL === 'function') {
    serverIcon = resolvedGuild.iconURL({ extension: 'png', size: 256 });
  }
  // Nếu server chưa upload avatar thì lấy avatar của chính Bot hiện tại
  if (!serverIcon) {
    const activeClient = resolvedGuild?.client || client || (guild && guild.client);
    if (activeClient?.user && typeof activeClient.user.displayAvatarURL === 'function') {
      serverIcon = activeClient.user.displayAvatarURL({ extension: 'png', size: 256 });
    }
  }

  const raw = rawEmbedOrBuilder.data ? rawEmbedOrBuilder.data : rawEmbedOrBuilder;
  const newEmbed = new EmbedBuilder();

  // Helper hàm làm sạch text: thay account name, số dư, tên shop
  const sanitizeText = (text) => {
    if (!text || typeof text !== 'string') return text;
    let clean = text;

    // 1. Thay thế "Tài khoản: giahoaimeomeoz" thành tên Discord của khách
    if (customerUser) {
      const customerTag = customerUser.username || customerUser.tag || 'Khách';
      clean = clean.replace(/(\*{0,2}(?:Tài khoản|Account)\*{0,2}:\s*)([^\n\r]+)/gi, `$1**${customerTag}**`);
    }

    // 2. Thay thế "Số dư: 2" thành số dư thực của khách tại server này
    if (customerBalance !== undefined && customerBalance !== null) {
      clean = clean.replace(/(\*{0,2}(?:Số dư|Balance)\*{0,2}:\s*)([^\n\r]+)/gi, `$1**${customerBalance}**`);
    }

    // 3. Xoá bỏ hoàn toàn tên shop gốc (HQ SHOP / HQ)
    clean = clean.replace(/HQ\s*SHOP/gi, serverName);

    return clean;
  };

  if (raw.title) {
    newEmbed.setTitle(sanitizeText(raw.title));
  }
  if (raw.url) {
    // Không giữ lại link dẫn về kênh tin nhắn của shop gốc
    if (!raw.url.includes('discord.com/channels')) {
      newEmbed.setURL(raw.url);
    }
  }
  newEmbed.setColor(raw.color || 0x57F287);

  // Description (giữ nguyên bố cục số lượt, vị trí, hàng đợi, lưu ý ETA của bên kia)
  if (raw.description) {
    newEmbed.setDescription(sanitizeText(raw.description));
  }

  // Fields
  if (raw.fields?.length) {
    const cleanFields = raw.fields.map(f => ({
      name: sanitizeText(f.name),
      value: sanitizeText(f.value),
      inline: Boolean(f.inline)
    }));
    newEmbed.addFields(cleanFields);
  }

  // Giữ lại banner image nếu có (loại bỏ nếu là ảnh chứa HQ)
  if (raw.image?.url && !raw.image.url.includes('1559073359784841296')) {
    newEmbed.setImage(raw.image.url);
  }

  // BỎ HOÀN TOÀN AVATAR SHOP GỐC -> THAY BẰNG AVATAR CỦA SERVER MÀ BOT ĐANG Ở
  if (serverIcon) {
    newEmbed.setThumbnail(serverIcon);
  }

  // BỎ HOÀN TOÀN TÊN/ICON FOOTER SHOP GỐC -> THAY BẰNG TÊN VÀ AVATAR CỦA SERVER HIỆN TẠI
  newEmbed.setFooter({
    text: serverName,
    iconURL: serverIcon || undefined
  });

  return newEmbed;
}

module.exports = {
  buildShopPanel,
  buildQueuePanel,
  buildGuideEmbed,
  buildBankChannelGuide,
  buildCommandListEmbed,
  buildDepositInvoiceEmbed,
  buildLeaderboardEmbed,
  buildStatsEmbed,
  buildQueueViewEmbed,
  buildSyncedQueueEmbed,
  buildQueuePaginationRow,
  buildLiveClaimTracker,
  buildTokenGuideChannelEmbed,
  buildRequirementsChannelEmbed,
  buildCheckCreditChannelEmbed,
  buildResellerDmsBotChannelEmbed,
  buildDmPanel,
  sanitizeAndWhitelabelEmbed
};

/**
 * 12. Điều kiện & Lưu ý quan trọng (# ⚠️├・requirements)
 */
function buildRequirementsChannelEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle(`⚠️ ĐIỀU KIỆN & QUY ĐỊNH BẮT BUỘC KHI THAM GIA`)
    .setColor('#FEE75C')
    .setDescription(
      `Để đảm bảo tài khoản nhận quà an toàn, không bị lỗi đơn và hệ thống hoạt động ổn định, quý khách vui lòng tuân thủ:\n\n` +
      `📱 **1. Bắt buộc tài khoản liên kết Số Điện Thoại (SĐT):**\n` +
      `• Tài khoản Discord nhận quà **bắt buộc phải có SĐT xác minh**.\n` +
      `• Nếu chưa thêm SĐT, hãy vào Cài đặt người dùng -> Tài khoản của tôi để thêm SĐT trước khi lấy token.\n\n` +
      `🚪 **2. Tuyệt đối KHÔNG bấm "Đăng xuất" (Log out):**\n` +
      `• Sau khi copy token xong, bạn chỉ cần **TẮT TAB TRÌNH DUYỆT** đi.\n` +
      `• ❌ **CẤM:** Bấm nút Đăng xuất sẽ làm hủy token ngay lập tức khiến đơn bị chết giữa chừng!\n\n` +
      `🛡️ **3. Giới hạn 3 lượt/đơn cho 1 token trong hàng đợi:**\n` +
      `• Mỗi token chỉ được xuất hiện **tối đa 3 lượt/đơn** trong hàng đợi cùng một lúc (theo chuẩn bot gốc).\n` +
      `• Nhằm tránh tình trạng spam rải queue dài 1 dây làm ảnh hưởng thành viên khác.\n\n` +
      `💎 **4. Chế độ Ưu tiên (Guaranteed Boost):**\n` +
      `• Chế độ Ưu tiên tiêu tốn 3 xu/lượt. Đổi lại, đơn của bạn **không bị trừ lượt** khi săn ra Nitro Basic (chỉ trừ lượt khi nhận Boost)!\n\n` +
      `🔄 **5. Cơ chế bảo vệ & tự động hoàn credit:**\n` +
      `• Nếu token chẳng may bị chết giữa chừng, hệ thống tự động tạm dừng đơn và **hoàn lại toàn bộ credit** các lượt chưa săn vào ví của bạn ngay lập tức.`
    )
    .setFooter({ text: `${config.shop.name} • Quy định bảo vệ quyền lợi thành viên` });

  return { embeds: [embed] };
}

