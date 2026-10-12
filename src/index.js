require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ActivityType,
  PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

const { getConfig } = require('./config');
const db = require('./database');
const bankService = require('./services/bankService');
const sniperService = require('./services/sniperService');
const queueService = require('./services/queueService');
const { handleButtonInteraction } = require('./interactions/buttons');
const { handleSelectMenuInteraction } = require('./interactions/selects');
const { handleModalInteraction } = require('./interactions/modals');
const upstreamBridge = require('./services/upstreamBridge');

// Khởi tạo Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Load tất cả các Slash Commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARNING] Lệnh tại ${filePath} thiếu thuộc tính "data" hoặc "execute"!`);
  }
}

// Xử lý sự kiện Ready
client.once('ready', async () => {
  const config = getConfig();
  console.log(`===============================================`);
  console.log(`🤖 Bot đã trực tuyến: ${client.user.tag}`);
  console.log(`🏪 Cửa hàng: ${config.shop.name}`);
  console.log(`📦 Số lệnh đã tải: ${client.commands.size}`);
  console.log(`===============================================`);

  client.user.setActivity({
    name: `${config.shop.name} | /queue view`,
    type: ActivityType.Custom
  });

  // Khởi động Upstream Bridge (nếu có cấu hình tài khoản gốc)
  await upstreamBridge.initialize(client);

  // Khởi động dịch vụ tự động đồng bộ và hiển thị Realtime Queue & Stats Embed
  const updaterService = require('./services/updaterService');
  updaterService.initialize(client);

  // Khởi động dịch vụ Owner Log bảo mật riêng biệt cho từng Server Owner
  const ownerLogService = require('./services/ownerLogService');
  ownerLogService.initialize(client);

  // Tự động kiểm tra và khởi tạo kênh owner-logs cho các máy chủ đã kích hoạt
  for (const [, guild] of client.guilds.cache) {
    if (db.isGuildActivated(guild.id)) {
      ownerLogService.ensureOwnerLogChannel(guild).catch(() => {});
    }
  }

  // Định kỳ quét kiểm tra token trong hàng đợi mỗi 3 phút
  setInterval(() => {
    queueService.checkQueueTokensHealth(client).catch(err => {
      console.error('[TOKEN HEALTH CHECK ERROR]:', err);
    });
  }, 3 * 60 * 1000);
});

// Sự kiện khi Bot được thêm vào một Server mới
client.on('guildCreate', async guild => {
  console.log(`[GUILD JOIN] 🚀 Bot vừa được thêm vào máy chủ mới: ${guild.name} (${guild.id}) - Thành viên: ${guild.memberCount}`);
  const config = getConfig();
  const ownerId = process.env.OWNER_ID || config.ownerId || '';

  // Khởi tạo file cấu hình riêng biệt cho máy chủ này: data/guilds/${guild.id}.json
  db.getGuildConfig(guild.id);

  const { EmbedBuilder } = require('discord.js');
  const onboardingEmbed = new EmbedBuilder()
    .setTitle(`🎉 CHÀO MỪNG ĐẾN VỚI NITRO RANDOM BOT SYSTEM (${guild.name})`)
    .setColor('#5865F2')
    .setDescription(
      `Chào mừng **Server Owner** & Quản trị viên máy chủ **${guild.name}**!\n` +
      `Để thiết lập bot hoạt động hoàn toàn độc lập và bảo mật cho máy chủ của bạn, vui lòng hoàn tất các bước sau:\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔑 **1. CUNG CẤP KEY KÍCH HOẠT BẢN QUYỀN (BẮT BUỘC):**\n` +
      `• Mỗi server Discord cần một mã bản quyền riêng để mở khóa tính năng.\n` +
      `• Gõ lệnh: \`/activate key: <mã_của_bạn>\` (Liên hệ Bot Owner: <@${ownerId}> để nhận key).\n\n` +
      `🔗 **2. CUNG CẤP TOKEN ACC SHOP GỐC (BẮT BUỘC):**\n` +
      `• Cần 1 token Discord của bạn (acc đã có sẵn trong shop gốc và có credit).\n` +
      `• Khi khách mua hàng trên server bạn, bot sẽ dùng acc này để nộp đơn và trừ credit ở shop gốc.\n` +
      `• Gõ lệnh: \`/upstream token token: <token_acc_gốc>\`.\n\n` +
      `🏪 **3. THƯƠNG HIỆU & NỘI DUNG TỪNG KÊNH:**\n` +
      `• **Tên Shop, Banner & Nội dung:** Gõ \`/settings profile\` để đặt tên shop và lời giới thiệu riêng.\n` +
      `• **Tùy biến chữ từng kênh:** Gõ \`/settings content\` để sửa text hướng dẫn, thể lệ.\n` +
      `• **Giá niêm yết mỗi sản phẩm:** Gõ \`/settings package-add\` để cài giá tiền VNĐ và số xu từng gói.\n` +
      `• **Ngân hàng nhận tiền VietQR:** Gõ \`/settings payment\` để cài STK và tên thụ hưởng của bạn.\n\n` +
      `🛠️ **4. TỰ ĐỘNG TẠO 10 KÊNH & ROLE BẰNG 1 LỆNH:**\n` +
      `• Gõ lệnh \`/setup build\` để bot tự động tạo 2 Danh mục, 10 Kênh và Role \`@Claim Ping\`.\n\n` +
      `🔒 **5. KÊNH QUẢN TRỊ DÀNH RIÊNG CHO OWNER:**\n` +
      `• Trong kênh \`🔒-.-owner-logs-.-▨\` (chỉ riêng bạn thấy), gõ lệnh \`/owner help\` để xem hướng dẫn cách dùng từ A-Z bất kỳ lúc nào.\n` +
      `• Kênh này tự động cập nhật mọi đơn hàng, token chết hoàn tiền và thông báo lỗi shop gốc.\n\n` +
      `📁 *Mọi thông tin máy chủ của bạn được lưu độc lập tại file: \`data/guilds/${guild.id}.json\`.*`
    )
    .setFooter({ text: `${config.shop.name} • Hệ thống Multi-Tenant độc lập & Bảo mật tuyệt đối` })
    .setTimestamp();

  // 1. Gửi vào kênh văn bản khả dụng trong Guild
  const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
  if (channel) {
    channel.send({ embeds: [onboardingEmbed] }).catch(() => {});
  }

  // 2. Gửi DM trực tiếp cho Server Owner
  try {
    const guildOwner = await guild.fetchOwner().catch(() => null);
    if (guildOwner) {
      await guildOwner.send({ embeds: [onboardingEmbed] }).catch(() => {});
    }
  } catch (e) {}

  if (db.isGuildActivated(guild.id)) {
    ownerLogService.ensureOwnerLogChannel(guild).catch(() => {});
  }
});

function isOperator(member, guild, config) {
  const ownerId = process.env.OWNER_ID || config.ownerId || '';
  const userId = member?.id || member?.user?.id;
  if (ownerId && userId === ownerId) return true;

  if (guild) {
    if (guild.ownerId === userId) return true;
    if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
    if (member?.permissions?.has(PermissionFlagsBits.ModerateMembers)) return true;
    if (config.adminRoleIds && Array.isArray(config.adminRoleIds) && config.adminRoleIds.some(roleId => member?.roles?.cache?.has(roleId))) {
      return true;
    }
  }
  return false;
}

// Xử lý tất cả các tương tác (Interactions)
client.on('interactionCreate', async interaction => {
  try {
    const config = getConfig();
    const ownerId = process.env.OWNER_ID || config.ownerId || '';

    // 0. BẢO MẬT BẢN QUYỀN MÁY CHỦ (License Check)
    if (interaction.guildId && !db.isGuildActivated(interaction.guildId)) {
      const isAllowedCommand = interaction.isChatInputCommand() && ['activate', 'license'].includes(interaction.commandName);

      if (!isAllowedCommand) {
        return interaction.reply({
          content:
            `🔒 **MÁY CHỦ CHƯA ĐƯỢC KÍCH HOẠT BẢN QUYỀN!**\n\n` +
            `Máy chủ **${interaction.guild.name}** cần được kích hoạt bản quyền trước khi sử dụng các tính năng của bot.\n` +
            `👉 Vui lòng liên hệ Chủ sở hữu Bot: **<@${ownerId}>** để nhận mã kích hoạt.\n` +
            `👉 Sau khi có mã, Quản trị viên server gõ lệnh:\n` +
            `\`/activate key: <mã_kích_hoạt>\` để bắt đầu!`,
          ephemeral: true
        }).catch(() => {});
      }
    }

    // Xử lý Autocomplete
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === 'function') {
        await command.autocomplete(interaction);
      }
      return;
    }

    // 1. Slash Command
    if (interaction.isChatInputCommand()) {
      // BẢO MẬT: Lệnh tạo key bản quyền kích hoạt bot (/license) chỉ DUY NHẤT ID trong config bot mới được dùng
      if (interaction.commandName === 'license') {
        if (interaction.user.id !== ownerId) {
          return interaction.reply({
            content: `❌ **Quyền truy cập bị từ chối!**\nLệnh tạo mã bản quyền kích hoạt bot chỉ dành riêng cho Chủ sở hữu Bot có ID trong cấu hình bot (<@${ownerId}>).`,
            ephemeral: true
          });
        }
      } else {
        const ADMIN_ONLY_COMMANDS = ['setup', 'settings', 'owner', 'upstream', 'key', 'panel', 'banner', 'hunt', 'testclaim', 'activate'];
        if (ADMIN_ONLY_COMMANDS.includes(interaction.commandName)) {
          if (!isOperator(interaction.member, interaction.guild, config)) {
            return interaction.reply({
              content: `❌ **Quyền truy cập bị từ chối!**\nChỉ người điều hành máy chủ (Quản lý máy chủ / Quản trị viên) mới có quyền sử dụng lệnh quản trị này.`,
              ephemeral: true
            });
          }
        }
      }

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`Không tìm thấy lệnh: ${interaction.commandName}`);
        return;
      }
      await command.execute(interaction);
      return;
    }

    // 2. Button
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    // 3. String Select Menu
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
      return;
    }

    // 4. Modal Submit
    if (interaction.isModalSubmit()) {
      await handleModalInteraction(interaction);
      return;
    }
  } catch (error) {
    console.error('[INTERACTION LỖI]:', error);
    const errorMessage = '❌ Đã xảy ra lỗi khi thực thi thao tác này! Vui lòng thử lại sau.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
    }
  }
});

// Xử lý tin nhắn trực tiếp (DM) cho Bot & Lệnh tiền tố (;)
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // 1. Nếu là tin nhắn gửi riêng qua DM - Chế độ DM kín cho Reseller
  if (!message.guild) {
    try {
      const config = getConfig();
      const user = db.getUser(message.author.id);
      let targetGuildName = null;
      const targetGuildId = user.resellerGuildId || user.lastGuildId;
      if (targetGuildId) {
        const g = client.guilds.cache.get(targetGuildId);
        if (g) targetGuildName = g.name;
      }

      const { buildDmPanel } = require('./utils/embeds');
      const dmPanelData = buildDmPanel(config, user, targetGuildName);
      return await message.reply(dmPanelData);
    } catch (err) {
      console.error('[DM HANDLER ERROR]:', err);
    }
    return;
  }

  // 2. Lệnh tiền tố (;): ;queue (;q), ;queue-status (;mystatus), ;banktop (;top)
  const content = message.content.trim().toLowerCase();
  if (content.startsWith(';')) {
    const config = getConfig();
    if (!isOperator(message.member, message.guild, config)) {
      return message.reply('❌ **Quyền truy cập bị từ chối!** Chỉ người điều hành máy chủ mới có quyền sử dụng các lệnh của bot.').catch(() => {});
    }

    const args = content.slice(1).trim().split(/\s+/);
    const cmd = args[0];

    // ;queue hoặc ;q - Xem hàng đợi
    if (cmd === 'queue' || cmd === 'q') {
      const activeQueue = db.getActiveQueue();
      const deadOrders = db.getDeadOrders();
      const rentalOrders = db.getRentalQueue();
      const { buildQueueViewEmbed } = require('./utils/embeds');
      const { embed, row } = buildQueueViewEmbed(config, activeQueue, deadOrders, 1, { rentalOrders });
      return await message.reply({ embeds: [embed], components: [row] }).catch(() => {});
    }

    // ;queue-status hoặc ;mystatus - Trạng thái đơn của bạn
    if (cmd === 'queue-status' || cmd === 'mystatus') {
      const activeQueue = db.getActiveQueue();
      const userOrders = db.getUserActiveOrders(message.author.id);

      if (!userOrders.length) {
        return await message.reply('ℹ️ Bạn hiện không có đơn nào đang chờ trong hàng đợi.').catch(() => {});
      }

      const lines = userOrders.map(ord => {
        const rank = activeQueue.findIndex(o => o.id === ord.id) + 1;
        const priorityTag = ord.isPriority ? ' [Ưu tiên]' : '';
        return `• Mã \`${ord.id}\`: Vị trí **#${rank || 'N/A'}** · Tiến độ **${ord.completedTurns || 0}/${ord.initialTurns || 1} lượt**${priorityTag} · Khiên \`${ord.shield || 0}/${ord.maxShield || 10}\``;
      });

      return await message.reply(`📋 **Trạng thái đơn của bạn:**\n${lines.join('\n')}`).catch(() => {});
    }

    // ;banktop hoặc ;top - Bảng xếp hạng credit
    if (cmd === 'banktop' || cmd === 'top') {
      const topUsers = db.getLeaderboard(message.guild.id, 10);
      const totalCredits = db.getTotalCreditsInSystem(message.guild.id);
      const { buildLeaderboardEmbed } = require('./utils/embeds');
      const embed = buildLeaderboardEmbed(config, topUsers, totalCredits);
      return await message.reply({ embeds: [embed] }).catch(() => {});
    }
  }
});

// ==========================================================
// TÍCH HỢP REST API / WEBHOOK (Dành cho Auto Bank & Sniper ngoài)
// ==========================================================
const app = express();
app.use(express.json());

// API kiểm tra trạng thái hoạt động của bot
app.get('/api/status', (req, res) => {
  const config = getConfig();
  const activeQueue = db.getActiveQueue();
  const stats = db.getStats();
  res.json({
    online: true,
    shop: config.shop.name,
    queueCount: activeQueue.length,
    stats,
    paused: db.isShopPaused()
  });
});

// API nhận webhook claim từ Nitro Sniper bên ngoài
app.post('/api/claim', async (req, res) => {
  const secret = req.headers['x-webhook-secret'] || req.body.secret;
  const configuredSecret = process.env.WEBHOOK_SECRET;

  if (configuredSecret && secret !== configuredSecret) {
    return res.status(401).json({ success: false, message: 'Sai Webhook Secret!' });
  }

  const { orderId, nitroType, speedMs, giftCode } = req.body;
  const result = await sniperService.handleClaim(client, {
    orderId,
    nitroType: nitroType || 'Nitro Basic – Tháng',
    speedMs: speedMs || 3500,
    giftCode: giftCode || 'discord.gift/webhook'
  });

  return res.json(result);
});

// API Webhook ngân hàng tự động (Ví dụ: SePay, Casso)
app.post('/api/payment/webhook', async (req, res) => {
  try {
    const { content, amount } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: 'Thiếu nội dung chuyển khoản' });
    }

    // Tìm mã NAP trong nội dung
    const match = content.match(/NAP[A-Z0-9]{5,8}/i);
    if (!match) {
      return res.json({ success: false, message: 'Không phát hiện mã nạp trong nội dung' });
    }

    const code = match[0].toUpperCase();
    const result = await bankService.approveDepositWithStockCheck(code, 'AUTO_BANK_WEBHOOK', client);

    if (result.success) {
      return res.json({
        success: true,
        message: `Đã duyệt tự động cho mã ${code}`,
        credits: result.deposit.credits,
        rootStock: result.rootStock
      });
    }

    if (result.insufficientStock) {
      return res.json({
        success: false,
        insufficientStock: true,
        message: `Đã nhận tiền mã ${code} nhưng kho gốc chỉ còn ${result.rootStock} credit (cần ${result.requiredCredits} credit). Đã gửi cảnh báo tới chủ shop.`
      });
    }

    return res.json({ success: false, message: result.message || 'Không tìm thấy đơn nạp tương ứng hoặc đã duyệt' });
  } catch (err) {
    console.error('[PAYMENT WEBHOOK LỖI]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.WEBHOOK_PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Webhook server đang lắng nghe tại port: ${PORT}`);
});

// Xử lý lỗi không bắt
process.on('unhandledRejection', error => {
  console.error('[UNHANDLED REJECTION]:', error);
});

process.on('uncaughtException', error => {
  console.error('[UNCAUGHT EXCEPTION]:', error);
});

// Khởi động bot nếu có token
const token = process.env.BOT_TOKEN;
if (token && token.trim() && token !== 'YOUR_BOT_TOKEN_HERE') {
  client.login(token).catch(err => {
    console.error('[BOT LOGIN LỖI]:', err);
  });
} else {
  console.log('⚠️ BOT_TOKEN chưa được cấu hình trong file .env! Vui lòng mở file .env và điền Token của Bot.');
}

module.exports = { client, app };
