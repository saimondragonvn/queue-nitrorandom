const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  OverwriteType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { getConfig, saveConfig, getGuildEffectiveConfig } = require('../config');
const {
  buildShopPanel,
  buildQueuePanel,
  buildStatsEmbed,
  buildQueueViewEmbed,
  buildGuideEmbed,
  buildBankChannelGuide,
  buildCommandListEmbed,
  buildTokenGuideChannelEmbed,
  buildRequirementsChannelEmbed,
  buildCheckCreditChannelEmbed,
  buildResellerDmsBotChannelEmbed
} = require('../utils/embeds');
const db = require('../database');

function checkIsAdmin(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleIds && config.adminRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId))) {
    return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('[Chủ shop] Tự động tạo toàn bộ kênh, role và gửi sẵn các bảng panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('build')
        .setDescription('Tự động tạo danh mục và 6 kênh chuẩn aesthetic theo ảnh tham khảo')
    ),

  async execute(interaction) {
    if (interaction.guildId && !db.isGuildActivated(interaction.guildId)) {
      return interaction.reply({
        content:
          `🔒 **MÁY CHỦ CHƯA ĐƯỢC KÍCH HOẠT BẢN QUYỀN!**\n\n` +
          `Máy chủ **${interaction.guild?.name || 'này'}** chưa được kích hoạt bản quyền sử dụng bot.\n` +
          `👉 Vui lòng liên hệ Chủ sở hữu Bot để nhận mã key và kích hoạt bằng lệnh:\n` +
          `\`/activate key: <mã_kích_hoạt>\`\n` +
          `trước khi sử dụng lệnh thiết lập hệ thống!`,
        ephemeral: true
      });
    }

    const config = getConfig();
    if (!checkIsAdmin(interaction, config)) {
      return interaction.reply({
        content: '❌ Bạn không có quyền sử dụng lệnh này!',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const effCfg = getGuildEffectiveConfig(guild.id);
    const shopName = effCfg.shop?.name || config.shop?.name || 'Shop';

    try {
      // 1. Tạo hoặc tìm Role @Claim Ping
      let claimPingRole = guild.roles.cache.find(r => r.name === 'Claim Ping');
      if (!claimPingRole) {
        claimPingRole = await guild.roles.create({
          name: 'Claim Ping',
          color: '#5865F2',
          mentionable: true,
          reason: 'Role ping khi săn trúng Nitro'
        });
      }

      // 2. Tạo Danh mục Category chuẩn: Sniper 🎁
      const category = await guild.channels.create({
        name: 'Sniper 🎁',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
            deny: [PermissionsBitField.Flags.SendMessages] // Khách chỉ xem và bấm nút tương tác
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ManageChannels
            ]
          }
        ]
      });

      // 3. Tạo 7 Kênh chuẩn theo đúng ảnh người dùng cung cấp:
      // Kênh 1: ❓├・how-to-use
      const howToUseChannel = await guild.channels.create({
        name: '❓├・how-to-use',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Hướng dẫn sử dụng bot và cách lấy token Discord an toàn`
      });

      // Kênh 2: ⚠️├・requirements
      const requirementsChannel = await guild.channels.create({
        name: '⚠️├・requirements',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Điều kiện & Quy định bắt buộc: Bắt buộc SĐT, Không đăng xuất, Giới hạn 3 lượt/token`
      });

      // Kênh 3: 💵├・bảng-giá (Bảng giá các gói nạp)
      const priceChannel = await guild.channels.create({
        name: '💵├・bảng-giá',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Bảng giá nạp credit VietQR của ${shopName}`
      });

      // Kênh 4: 🚀├・panel (Bảng điều khiển Nitro Random)
      const panelChannel = await guild.channels.create({
        name: '🚀├・panel',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Bảng điều khiển Nitro Random: Vào hàng đợi, Đổi key, Xem số dư & Hướng dẫn`
      });

      // Kênh 5: 🎁├・claims
      const claimsChannel = await guild.channels.create({
        name: '🎁├・claims',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Kênh thông báo trực tiếp kết quả săn trúng Nitro và Live Tracker`
      });

      // Kênh 6: ✈️├・queue
      const queueChannel = await guild.channels.create({
        name: '✈️├・queue',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Bảng danh sách hàng đợi Nitro Random đang chạy trực tiếp`
      });

      // Kênh 7: 🥀├・token-die (Thông báo token die của khách)
      const deadTokenChannel = await guild.channels.create({
        name: '🥀├・token-die',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Thông báo token hết hạn / đăng xuất giữa chừng của người dùng lệnh`
      });

      // Kênh 8: 🌍├・bank
      const bankChannel = await guild.channels.create({
        name: '🌍├・bank',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Tra cứu số dư ví credit cá nhân, hướng dẫn nạp VietQR và đổi key`
      });

      // Kênh 9: ⛽├・stats
      const statsChannel = await guild.channels.create({
        name: '⛽├・stats',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Thống kê số lượng mã Nitro shop đã săn được và tỉ lệ`
      });

      // Kênh 10: 🤖├・cmd-bot (Kênh dành riêng cho mọi người dùng lệnh bot)
      const cmdBotChannel = await guild.channels.create({
        name: '🤖├・cmd-bot',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Kênh dành cho mọi người sử dụng lệnh bot (/check, /rejoin, /bank, /help...)`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.UseApplicationCommands
            ]
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.UseApplicationCommands
            ]
          }
        ]
      });

      // Kênh 11 (Riêng tư): 🔒├・owner-logs (Dành riêng cho Server Owner)
      const ownerLogChannel = await guild.channels.create({
        name: '🔒├・owner-logs',
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Nhật ký bảo mật riêng cho Owner: Đơn hàng, Gift credit, Lỗi shop gốc`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionsBitField.Flags.ViewChannel] // Tuyệt đối ẩn với mọi người
          },
          {
            id: guild.ownerId,
            type: OverwriteType.Member,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.SendMessages
            ]
          },
          {
            id: guild.members.me.id,
            type: OverwriteType.Member,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles
            ]
          }
        ]
      });

      // 4. Lưu toàn bộ ID kênh và Role vào config.json và guild config
      config.channels.priceChannelId = priceChannel.id;
      config.channels.panelChannelId = panelChannel.id;
      config.channels.queueChannelId = queueChannel.id;
      config.channels.claimLogChannelId = claimsChannel.id;
      config.channels.deadTokenChannelId = deadTokenChannel.id;
      config.channels.claimPingRoleId = claimPingRole.id;
      config.channels.tokenGuideChannelId = howToUseChannel.id;
      config.channels.requirementsChannelId = requirementsChannel.id;
      config.channels.checkCreditChannelId = bankChannel.id;
      config.channels.statsChannelId = statsChannel.id;
      config.channels.bankChannelId = bankChannel.id;
      config.channels.commandsChannelId = cmdBotChannel.id;
      config.channels.ownerLogChannelId = ownerLogChannel.id;
      config.content.priceChannelText = `<#${priceChannel.id}>`;
      saveConfig(config);

      // Tự động tìm kênh Vouch nếu server đã có sẵn kênh legit/rep/vouch
      const autoVouchChannel = guild.channels.cache.find(c => c.isTextBased() && (c.name.includes('vouch') || c.name.includes('legit') || c.name.includes('rep')));
      let resolvedVouchId = null;
      if (autoVouchChannel) {
        resolvedVouchId = autoVouchChannel.id;
      } else if (effCfg.channels?.vouchChannelId && guild.channels.cache.has(effCfg.channels.vouchChannelId)) {
        resolvedVouchId = effCfg.channels.vouchChannelId;
      }

      // Lưu riêng theo từng guild
      db.setGuildConfig(guild.id, {
        claimLogChannelId: claimsChannel.id,
        claimPingRoleId: claimPingRole.id,
        priceChannelId: priceChannel.id,
        panelChannelId: panelChannel.id,
        deadTokenChannelId: deadTokenChannel.id,
        queueChannelId: queueChannel.id,
        statsChannelId: statsChannel.id,
        bankChannelId: bankChannel.id,
        tokenGuideChannelId: howToUseChannel.id,
        requirementsChannelId: requirementsChannel.id,
        checkCreditChannelId: bankChannel.id,
        commandsChannelId: cmdBotChannel.id,
        ownerLogChannelId: ownerLogChannel.id,
        vouchChannelId: resolvedVouchId || undefined
      });

      // Lấy config hiệu lực đã cập nhật của Guild hiện tại (tránh kế thừa cache cũ)
      const currentGuildCfg = getGuildEffectiveConfig(guild.id);

      // 5. Tự động gửi sẵn bảng giao diện (Panel Embeds) vào từng kênh theo cấu hình riêng của Server:

      // Gửi Shop Panel (Bảng giá) vào 💵├・bảng-giá
      const shopPanelData = buildShopPanel(currentGuildCfg);
      const priceMsg = await priceChannel.send(shopPanelData).catch(() => null);
      if (priceMsg) {
        db.setGuildConfig(guild.id, { priceMessageId: priceMsg.id });
      }

      // Gửi Queue Panel (Bảng điều khiển Nitro Random) vào kênh riêng 🚀├・panel
      const queuePanelData = buildQueuePanel(currentGuildCfg);
      const panelMsg = await panelChannel.send(queuePanelData).catch(() => null);
      if (panelMsg) {
        db.setGuildConfig(guild.id, { panelMessageId: panelMsg.id });
      }

      // Gửi thông báo hướng dẫn vào 🥀├・token-die
      const deadTokenGuideEmbed = new EmbedBuilder()
        .setTitle('🥀 KÊNH THÔNG BÁO TOKEN DIE / ĐĂNG XUẤT')
        .setColor('#ED4245')
        .setDescription(
          `Kênh này dùng để **tự động thông báo và ping người dùng lệnh** khi tài khoản token bị đăng xuất hoặc hết hạn giữa chừng.\n\n` +
          `• **Khi token bị die:** Bot tạm dừng đơn, bảo lưu thứ hạng **24 giờ**, hoàn ngay credit vào ví.\n` +
          `• **Khách hàng chỉ cần:** Lấy token mới (đóng tab, không bấm Đăng xuất) và gõ lệnh \`/rejoin token:<token_mới>\` để tiếp tục săn!`
        )
        .setFooter({ text: `${shopName} • Tự động cảnh báo khi có sự cố token` });
      await deadTokenChannel.send({ embeds: [deadTokenGuideEmbed] }).catch(() => null);

      // Gửi Hướng dẫn Token & Cẩm nang lệnh vào ❓├・how-to-use
      const tokenGuideData = buildTokenGuideChannelEmbed(currentGuildCfg);
      await howToUseChannel.send(tokenGuideData).catch(() => null);
      const commandListData = buildCommandListEmbed(currentGuildCfg);
      await howToUseChannel.send({ embeds: [commandListData] }).catch(() => null);

      // Gửi Điều kiện & Lưu ý bắt buộc vào ⚠️├・requirements
      const requirementsData = buildRequirementsChannelEmbed(effCfg);
      await requirementsChannel.send(requirementsData).catch(() => null);

      // Gửi Guide Embed & Nút nạp/tra cứu vào 🌍├・bank
      const bankGuideData = buildBankChannelGuide(effCfg);
      await bankChannel.send(bankGuideData).catch(() => null);

      // Gửi Welcome Embed vào 🔒├・owner-logs
      const btnUpstream = new ButtonBuilder()
        .setCustomId('btn_owner_cfg_upstream')
        .setLabel('🔗 Cài Token Shop Gốc')
        .setStyle(ButtonStyle.Primary);

      const btnProfile = new ButtonBuilder()
        .setCustomId('btn_owner_cfg_profile')
        .setLabel('🎨 Đổi Tên Shop & Bảng Giá')
        .setStyle(ButtonStyle.Secondary);

      const btnCreateKey = new ButtonBuilder()
        .setCustomId('btn_owner_create_key')
        .setLabel('🔑 Tạo Key Bán Khách')
        .setStyle(ButtonStyle.Success);

      const ownerRow = new ActionRowBuilder().addComponents(btnUpstream, btnProfile, btnCreateKey);

      const ownerWelcomeEmbed = new EmbedBuilder()
        .setTitle('🔒 KÊNH NHẬT KÝ QUẢN TRỊ DÀNH RIÊNG CHO SERVER OWNER')
        .setColor('#5865F2')
        .setDescription(
          `Chào mừng **Server Owner**! Đây là kênh riêng tư chỉ duy nhất bạn và bot có quyền truy cập.\n\n` +
          `**Kênh này tự động cập nhật trực tiếp theo thời gian thực:**\n` +
          `• 🛒 **Tình trạng đơn hàng:** Khi khách đặt đơn mới, rút đơn, hoàn thành đơn.\n` +
          `• ⚠️ **Sự cố token & hoàn tiền:** Khi token của khách bị chết, tự động hoàn credit vào ví.\n` +
          `• 🎁 **Nhật ký Credit:** Ai tặng credit cho ai (\`/bank gift\`), ai nạp key, nạp tiền VietQR.\n` +
          `• 🚨 **Cảnh báo Shop Gốc:** Lỗi kho sỉ hết credit, bot gốc từ chối hoặc được shop gốc tặng credit.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👑 **CẨM NANG & THAO TÁC QUẢN TRỊ DÀNH CHO OWNER:**\n` +
          `• Gõ lệnh \`/owner help\` để xem cẩm nang quản trị toàn diện từ A-Z bất cứ lúc nào.\n` +
          `• Gõ lệnh \`/owner status\` để kiểm tra hạn bản quyền, token shop gốc, kênh và số dư.\n` +
          `• Bấm nhanh các nút dưới đây để thiết lập ngay mà không cần nhớ cú pháp lệnh:`
        )
        .setFooter({ text: `File lưu trữ riêng biệt của server này: data/guilds/${guild.id}.json` })
        .setTimestamp();
      await ownerLogChannel.send({ embeds: [ownerWelcomeEmbed], components: [ownerRow] }).catch(() => null);

      // Gửi Stats Embed vào ⛽├・stats
      const statsData = db.getGuildStats(guild.id);
      const statsEmbed = buildStatsEmbed(effCfg, statsData);
      const statsMsg = await statsChannel.send({ embeds: [statsEmbed] }).catch(() => null);

      // Gửi Cẩm nang dùng lệnh vào 🤖├・cmd-bot
      const cmdBotWelcomeEmbed = new EmbedBuilder()
        .setTitle('🤖 KÊNH DÙNG LỆNH BOT')
        .setColor('#5865F2')
        .setDescription(
          `Chào mừng bạn đến với kênh sử dụng lệnh bot của **${shopName}**!\n\n` +
          `Các lệnh bạn có thể sử dụng tại đây:\n` +
          `• \`/bank balance\` — Tra cứu số dư ví xu, lịch sử nạp và thông tin tài khoản\n` +
          `• \`/rejoin token:<token_mới>\` — Nối lại đơn hàng khi cần thay đổi token mới\n` +
          `• \`/bank deposit\` — Nạp thêm credit qua mã QR VietQR tự động\n` +
          `• \`/bank gift user:<@ai> amount:<số_xu>\` — Tặng credit cho bạn bè\n` +
          `• \`/redeem key key:<mã_key>\` — Kích hoạt key quà tặng nhận credit\n` +
          `• \`/redeem credits\` — Dùng credit vào hàng đợi săn Nitro\n` +
          `• \`/stats\` — Xem thống kê số lượng mã Nitro đã săn được\n` +
          `• \`/leaderboard\` — Bảng xếp hạng thành viên săn nhiều Nitro nhất`
        )
        .setFooter({ text: `${shopName} • Gõ / để chọn lệnh Discord` });
      await cmdBotChannel.send({ embeds: [cmdBotWelcomeEmbed] }).catch(() => null);

      // Gửi Queue View vào ✈️├・queue
      const activeQueue = db.getActiveQueue(guild.id);
      const deadOrders = db.getDeadOrders(guild.id);
      const rentalOrders = db.getRentalQueue(guild.id);
      const { embed: queueEmbed, row: queueRow } = buildQueueViewEmbed(effCfg, activeQueue, deadOrders, 1, { rentalOrders });
      const queueMsg = await queueChannel.send({ embeds: [queueEmbed], components: [queueRow] }).catch(() => null);

      // Lưu message IDs để tự động update
      db.setGuildConfig(guild.id, {
        statsMessageId: statsMsg ? statsMsg.id : undefined,
        queueMessageId: queueMsg ? queueMsg.id : undefined
      });

      // 6. Trả về thông báo thành công
      const summaryEmbed = new EmbedBuilder()
        .setTitle('🎉 TỰ ĐỘNG THIẾT LẬP KÊNH THÀNH CÔNG!')
        .setColor('#57F287')
        .setDescription(
          `Hệ thống đã tự động xây dựng danh mục **${category.name}** với giao diện chuẩn aesthetic:\n\n` +
          `• ❓ <#${howToUseChannel.id}> *(Hướng dẫn sử dụng bot & cách lấy token an toàn)*\n` +
          `• ⚠️ <#${requirementsChannel.id}> *(Điều kiện & Quy định: Bắt buộc SĐT, Không đăng xuất)*\n` +
          `• 💵 <#${priceChannel.id}> *(Bảng giá nạp credit VietQR)*\n` +
          `• 🚀 <#${panelChannel.id}> *(Bảng điều khiển Nitro Random)*\n` +
          `• 🥀 <#${deadTokenChannel.id}> *(Thông báo token die)*\n` +
          `• 🎁 <#${claimsChannel.id}> *(Thông báo kết quả trúng thưởng - Ping: <@&${claimPingRole.id}>)*\n` +
          `• ✈️ <#${queueChannel.id}> *(Bảng danh sách hàng đợi trực tiếp)*\n` +
          `• 🌍 <#${bankChannel.id}> *(Nạp tiền VietQR & Tra cứu số dư cá nhân)*\n` +
          `• ⛽ <#${statsChannel.id}> *(Thống kê Nitro đã săn được)*\n` +
          `• 🤖 <#${cmdBotChannel.id}> *(Kênh dành cho mọi người gõ lệnh bot)*\n` +
          `• 🔒 <#${ownerLogChannel.id}> *(Nhật ký quản trị riêng cho Server Owner)*\n\n` +
          `✅ **Đã tự động lưu toàn bộ ID kênh vào hệ thống!**`
        );

      return interaction.editReply({ embeds: [summaryEmbed] });
    } catch (error) {
      console.error('[SETUP BUILD LỖI]:', error);
      return interaction.editReply({
        content: `❌ Đã xảy ra lỗi khi tạo kênh: \`${error.message}\`. Vui lòng kiểm tra bot đã có quyền **Manage Channels** và **Manage Roles** chưa!`
      });
    }
  }
};
