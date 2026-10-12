const { Client: SelfClient } = require('discord.js-selfbot-v13');
const { getConfig, saveConfig } = require('../config');
const db = require('../database');

class UpstreamBridge {
  constructor() {
    this.selfClient = null;
    this.clientPool = new Map();
    this.isReady = false;
    this.lastError = null;
    this.targetBotId = null;
    this.mainBotClient = null;
  }

  /**
   * Lấy hoặc tạo kết nối riêng cho từng tài khoản upstream token của server
   * @param {string} token 
   * @param {string|null} guildId
   */
  async getClientForToken(token, guildId = null) {
    if (!token) return this.selfClient;
    if (this.selfClient && this.selfClient.token === token && this.isReady) {
      if (guildId) this.selfClient.boundGuildId = guildId;
      return this.selfClient;
    }
    if (!this.clientPool) {
      this.clientPool = new Map();
    }
    if (this.clientPool.has(token)) {
      const existing = this.clientPool.get(token);
      if (existing && existing.readyAt) {
        if (guildId) existing.boundGuildId = guildId;
        return existing;
      }
    }

    try {
      const newClient = new SelfClient({ checkUpdate: false });
      const readyPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Hết thời gian chờ kết nối tài khoản upstream!')), 12000);
        newClient.once('ready', () => {
          clearTimeout(timer);
          newClient.boundGuildId = guildId;
          console.log(`🔗 [UPSTREAM BRIDGE] Đã kết nối tài khoản sỉ (${newClient.user.tag}) cho Server: ${guildId || 'chung'}`);
          if (this.mainBotClient) {
            this.setupClaimListener(this.mainBotClient, newClient, guildId);
          }
          resolve(newClient);
        });
      });
      await newClient.login(token);
      await readyPromise;
      this.clientPool.set(token, newClient);
      return newClient;
    } catch (err) {
      console.warn(`[UPSTREAM BRIDGE] Không thể tạo client riêng cho token (${token.slice(-4)}):`, err.message);
      return this.selfClient;
    }
  }

  /**
   * Khởi động User Account (Selfbot) kết nối vào server shop gốc
   */
  async initialize(mainBotClient) {
    this.mainBotClient = mainBotClient;
    const config = getConfig();
    const token = process.env.UPSTREAM_USER_TOKEN || config.upstream?.userToken;

    // 1. Khởi động tài khoản gốc chung (nếu có cấu hình)
    if (token && config.upstream?.enabled) {
      try {
        this.selfClient = new SelfClient({ checkUpdate: false });

        this.selfClient.on('ready', () => {
          this.isReady = true;
          this.lastError = null;
          console.log(`===============================================`);
          console.log(`🔗 [UPSTREAM BRIDGE] Đã đăng nhập tài khoản gốc chung: ${this.selfClient.user.tag}`);
          console.log(`📡 Sẵn sàng chuyển tiếp đơn tự động sang shop gốc!`);
          console.log(`===============================================`);
        });

        // Lắng nghe thông báo săn được từ shop gốc (kèm DM từ bot HQ)
        if (mainBotClient) {
          this.setupClaimListener(mainBotClient, this.selfClient);
        }

        await this.selfClient.login(token);
      } catch (err) {
        this.lastError = err.message;
        console.error('[UPSTREAM BRIDGE] Lỗi đăng nhập tài khoản User Token chung:', err);
      }
    } else {
      console.log('ℹ️ Upstream Bridge: Không có tài khoản gốc chung mặc định, bot sẽ tự động tải các tài khoản riêng theo từng server.');
    }

    // 2. Tự động quét và đăng nhập toàn bộ tài khoản upstream token của các server trong data/guilds/
    try {
      const fs = require('fs');
      const path = require('path');
      const guildsDir = path.join(__dirname, '../../data/guilds');
      if (fs.existsSync(guildsDir)) {
        const files = fs.readdirSync(guildsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const gid = file.replace('.json', '');
          try {
            const raw = fs.readFileSync(path.join(guildsDir, file), 'utf8');
            const gCfg = JSON.parse(raw);
            if (gCfg && gCfg.upstreamToken) {
              console.log(`[UPSTREAM BRIDGE] Đang tự động kết nối tài khoản sỉ cho Server ${gid}...`);
              await this.getClientForToken(gCfg.upstreamToken, gid);
            }
          } catch (e) {
            console.warn(`[UPSTREAM BRIDGE] Lỗi nạp token server ${file}:`, e.message);
          }
        }
      }
    } catch (scanErr) {
      console.warn('[UPSTREAM BRIDGE] Lỗi quét danh mục data/guilds:', scanErr.message);
    }

    return true;
  }

  /**
   * Đăng nhập trực tiếp bằng token mới truyền vào từ slash command /upstream token
   */
  async loginWithToken(mainBotClient, token, guildId = null) {
    this.mainBotClient = mainBotClient;
    if (guildId) {
      const client = await this.getClientForToken(token, guildId);
      if (client && client.user) {
        return client.user;
      }
    }

    if (this.selfClient) {
      try {
        this.selfClient.destroy();
      } catch (e) {}
    }

    this.isReady = false;
    this.lastError = null;

    try {
      this.selfClient = new SelfClient({ checkUpdate: false });

      const readyPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Hết thời gian chờ kết nối (Timeout) tài khoản Discord!'));
        }, 12000);

        this.selfClient.once('ready', () => {
          clearTimeout(timer);
          this.isReady = true;
          this.lastError = null;
          console.log(`===============================================`);
          console.log(`🔗 [UPSTREAM BRIDGE] Đã đăng nhập tài khoản gốc: ${this.selfClient.user.tag}`);
          console.log(`📡 Sẵn sàng chuyển tiếp đơn tự động sang shop gốc!`);
          console.log(`===============================================`);
          resolve(this.selfClient.user);
        });
      });

      if (mainBotClient) {
        this.setupClaimListener(mainBotClient, this.selfClient, guildId);
      }

      await this.selfClient.login(token);
      return await readyPromise;
    } catch (err) {
      this.lastError = err.message;
      this.isReady = false;
      throw err;
    }
  }

  /**
   * Tự động bấm nút và điền biểu mẫu "Dùng credit vào hàng đợi" sang shop gốc
   * @param {Object} param0 { turns, token, isPriority }
   */
  async submitToUpstreamQueue({ turns, token, isPriority, guildId = null }) {
    const config = getConfig();
    const upstreamCfg = config.upstream || {};
    const { decryptToken } = require('../utils/security');
    const cleanCustomerToken = decryptToken(String(token));
    const targetHQGuildId = '1289888622295781408';

    let activeClient = null;
    let guildCfg = null;
    if (guildId) {
      guildCfg = db.getGuildConfig(guildId) || {};
      if (guildCfg.upstreamToken) {
        activeClient = await this.getClientForToken(guildCfg.upstreamToken, guildId);
      } else {
        return {
          success: false,
          message: '❌ Máy chủ này chưa cài đặt tài khoản kết nối shop gốc (Upstream User Token)! Vui lòng dùng lệnh `/upstream token token:<token_acc_gốc>` để kết nối tài khoản sỉ của server.'
        };
      }
    } else {
      activeClient = this.selfClient;
    }

    if (!activeClient || !activeClient.readyAt) {
      return {
        success: false,
        message: '❌ Tài khoản kết nối shop gốc (Upstream User Token) của máy chủ này chưa sẵn sàng! Vui lòng dùng lệnh `/upstream token token:<token_acc_gốc>` để kết nối.'
      };
    }

    // Kiểm tra tài khoản đã tham gia máy chủ Shop Gốc 1289888622295781408 chưa
    let inHQ = false;
    try {
      inHQ = activeClient.guilds.cache.has(targetHQGuildId) || !!(await activeClient.guilds.fetch(targetHQGuildId).catch(() => null));
    } catch (e) {}
    if (!inHQ) {
      return {
        success: false,
        message: `❌ Tài khoản kết nối của server này chưa tham gia máy chủ Shop Gốc (ID: \`${targetHQGuildId}\`)! Vui lòng cho tài khoản tham gia server gốc trước.`
      };
    }

    // Tính toán số credit tiêu hao khi đặt đơn
    const cost = isPriority ? turns * (config.queueSettings?.priorityMultiplier || 3) : turns;

    const targetGuildId = upstreamCfg.guildId || process.env.UPSTREAM_GUILD_ID || targetHQGuildId;
    const channelId = upstreamCfg.channelId || process.env.UPSTREAM_CHANNEL_ID;
    const messageId = upstreamCfg.messageId || process.env.UPSTREAM_MESSAGE_ID;

    const botId = upstreamCfg.botId || '1405843081890107392';
    const commandsChannelId = upstreamCfg.commandsChannelId || '1555969644173598811';

    // PHƯƠNG ÁN 1: Gửi lệnh Slash trực tiếp trong kênh bot commands (/redeem credits) và chờ phản hồi
    if (commandsChannelId) {
      try {
        console.log(`[UPSTREAM BRIDGE] Đang gửi lệnh /redeem credits từ tài khoản (${activeClient.user?.tag || 'upstream'}) vào kênh lệnh ${commandsChannelId}...`);
        const upstreamMsg = await this.sendSlashAndWaitResponse(
          'redeem credits',
          activeClient,
          Number(turns),
          String(cleanCustomerToken),
          Boolean(isPriority)
        );

        if (upstreamMsg) {
          console.log(`[UPSTREAM BRIDGE] ✅ Nhận được phản hồi từ shop gốc:`, upstreamMsg.content || upstreamMsg.embeds?.[0]?.data?.title || 'OK');

          const isError = upstreamMsg.embeds?.some(e => {
            const title = (e.data?.title || '').toLowerCase();
            const desc = (e.data?.description || '').toLowerCase();
            return title.includes('không hợp lệ') || title.includes('lỗi') || title.includes('không đủ') ||
                   desc.includes('không hợp lệ') || desc.includes('không đúng định dạng') || desc.includes('đang có đơn');
          }) || (upstreamMsg.content && (upstreamMsg.content.includes('không đủ') || upstreamMsg.content.includes('lỗi')));

          if (!isError) {
            if (guildId) {
              db.deductGuildUpstreamCredits(guildId, cost);
            } else if (config.upstream.upstreamCredits != null) {
              config.upstream.upstreamCredits = Math.max(0, config.upstream.upstreamCredits - cost);
              saveConfig(config);
            }
          }

          let upstreamOrderId = null;
          const rawText = (upstreamMsg.content || '') + ' ' + (upstreamMsg.embeds?.[0]?.data?.description || '') + ' ' + (upstreamMsg.embeds?.[0]?.data?.title || '');
          const ordMatch = rawText.match(/ORD-[a-zA-Z0-9-]+/i) || rawText.match(/Mã đơn:\s*`?([a-zA-Z0-9-]+)`?/i);
          if (ordMatch) {
            upstreamOrderId = ordMatch[1] || ordMatch[0];
          }

          return {
            success: !isError,
            message: upstreamMsg.content || upstreamMsg.embeds?.[0]?.data?.description || upstreamMsg.embeds?.[0]?.data?.title || 'Đã xử lý bên shop gốc',
            upstreamResponse: upstreamMsg,
            cost,
            upstreamOrderId
          };
        }
      } catch (slashErr) {
        console.warn('[UPSTREAM BRIDGE] Gửi slash command không thành công, thử tiếp phương án bấm nút bảng điều khiển:', slashErr.message);
      }
    }

    if (!channelId) {
      return {
        success: false,
        message: 'Chưa cấu hình ID kênh của bảng queue shop gốc (channelId)!'
      };
    }

    try {
      // 1. Tìm kênh chứa bảng queue shop gốc
      const channel = await activeClient.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return { success: false, message: `Không thể tìm thấy kênh shop gốc (${channelId})!` };
      }

      let message = null;
      if (messageId) {
        try {
          message = channel.messages.cache.get(messageId) || (await channel.messages.fetch(messageId, { force: true }));
        } catch (e) {
          message = channel.messages.cache.get(messageId) || null;
        }
      }

      // Nếu không có messageId hoặc tìm không thấy, tự động quét các tin nhắn mới nhất trong kênh tìm tin nhắn có nút bấm
      if (!message) {
        console.log(`[UPSTREAM BRIDGE] Đang tự động quét tìm tin nhắn chứa nút queue trong kênh ${channelId}...`);
        try {
          const messages = await channel.messages.fetch({ limit: 25 });
          if (messages) {
            for (const msg of messages.values()) {
              if (msg.components && msg.components.length > 0) {
                const hasButton = msg.components.some(row =>
                  row.components?.some(c => c.type === 'BUTTON')
                );
                if (hasButton) {
                  message = msg;
                  break;
                }
              }
            }
          }
        } catch (scanErr) {
          console.warn('[UPSTREAM BRIDGE] Lỗi quét tin nhắn:', scanErr.message);
        }
      }

      if (!message) {
        return { success: false, message: `Không tìm thấy tin nhắn bảng queue có nút bấm trong kênh ${channelId}!` };
      }

      // 2. Tìm nút "Dùng credit"
      // Ưu tiên tìm theo customId hoặc theo nhãn (label) "Dùng credit"
      const targetLabel = upstreamCfg.buttonLabel || 'Dùng credit';
      const targetCustomId = upstreamCfg.buttonCustomId || 'btn_use_credit';

      let buttonComponent = null;
      for (const row of message.components) {
        for (const comp of row.components) {
          if (
            comp.type === 'BUTTON' &&
            (comp.customId === targetCustomId ||
             (comp.label && comp.label.toLowerCase().includes(targetLabel.toLowerCase())))
          ) {
            buttonComponent = comp;
            break;
          }
        }
        if (buttonComponent) break;
      }

      // Nếu không khớp theo tên, lấy nút đầu tiên có màu xanh lá (SUCCESS) hoặc nút đầu tiên của hàng 1
      if (!buttonComponent && message.components.length > 0 && message.components[0].components.length > 0) {
        buttonComponent = message.components[0].components[0];
      }

      if (!buttonComponent) {
        return { success: false, message: 'Không tìm thấy nút bấm "Dùng credit" trên bảng queue shop gốc!' };
      }

      console.log(`[UPSTREAM BRIDGE] Đang nhấp nút "${buttonComponent.label || buttonComponent.customId}" trên shop gốc...`);

      // 3. Chuẩn bị lắng nghe sự kiện Modal từ bot shop gốc
      const modalPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Hết thời gian chờ (Timeout) biểu mẫu Modal từ bot shop gốc!'));
        }, 10000);

        const rawHandler = packet => {
          if (packet.t === 'INTERACTION_MODAL_CREATE') {
            cleanup();
            resolve(packet.d);
          }
        };

        const modalHandler = modal => {
          cleanup();
          resolve(modal);
        };

        const cleanup = () => {
          clearTimeout(timeout);
          this.selfClient.removeListener('raw', rawHandler);
          this.selfClient.removeListener('interactionModalCreate', modalHandler);
        };

        this.selfClient.on('raw', rawHandler);
        this.selfClient.on('interactionModalCreate', modalHandler);
      });

      // 4. Bấm nút thông qua Selfbot API
      const clickPromise = message.clickButton(buttonComponent.customId).catch(async err => {
        console.log('[UPSTREAM BRIDGE] clickButton fallback via api.interactions.post:', err.message);
        await this.selfClient.api.interactions.post({
          data: {
            type: 3,
            guild_id: message.guildId,
            channel_id: message.channelId,
            message_id: message.id,
            application_id: message.applicationId || message.author.id,
            session_id: this.selfClient.sessionId,
            data: {
              component_type: 2,
              custom_id: buttonComponent.customId
            }
          }
        }).catch(() => {});
        return null;
      });

      // Chờ Modal xuất hiện
      const modalResult = await Promise.race([
        modalPromise,
        clickPromise.then(res => (res && res.components ? res : modalPromise))
      ]);

      if (!modalResult) {
        throw new Error('Không nhận được biểu mẫu Modal từ shop gốc!');
      }

      console.log(`[UPSTREAM BRIDGE] Nhận được Modal: "${modalResult.title}" (ID: ${modalResult.custom_id || modalResult.customId})`);

      // 5. Khớp các trường nhập liệu trong Modal:
      // - Số lượt (amount)
      // - Token Discord của bạn (token)
      // - Guaranteed Boost? (boost - gõ CO để bật, tốn 3x)
      if (modalResult && typeof modalResult.reply === 'function') {
        for (const row of modalResult.components || []) {
          const input = row.components?.[0];
          if (!input) continue;
          const cid = (input.customId || '').toLowerCase();
          const label = (input.label || '').toLowerCase();
          let val = '';
          if (cid === 'amount' || label.includes('lượt') || label.includes('số') || label.includes('turns') || label.includes('credit')) {
            val = String(turns);
          } else if (cid === 'token' || label.includes('token') || label.includes('tài khoản')) {
            val = String(token);
          } else if (cid === 'boost' || label.includes('boost') || label.includes('ưu tiên') || label.includes('guaranteed')) {
            val = isPriority ? 'CO' : '';
          }
          if (typeof input.setValue === 'function') {
            input.setValue(val);
          } else {
            input.value = val;
          }
        }
        await modalResult.reply();
      } else {
        const modalData = modalResult;
        const submitComponents = [];

        for (const row of modalData.components || []) {
          const textInput = row.components?.[0];
          if (!textInput) continue;

          const cid = (textInput.custom_id || '').toLowerCase();
          const label = (textInput.label || '').toLowerCase();
          let valueToFill = '';

          if (cid === 'amount' || label.includes('lượt') || label.includes('số') || label.includes('turns') || label.includes('credit')) {
            valueToFill = String(turns);
          } else if (cid === 'token' || label.includes('token') || label.includes('tài khoản')) {
            valueToFill = String(cleanCustomerToken);
          } else if (cid === 'boost' || label.includes('boost') || label.includes('ưu tiên') || label.includes('guaranteed')) {
            valueToFill = isPriority ? 'CO' : '';
          } else {
            const index = submitComponents.length;
            if (index === 0) valueToFill = String(turns);
            else if (index === 1) valueToFill = String(cleanCustomerToken);
            else if (index === 2) valueToFill = isPriority ? 'CO' : '';
          }

          submitComponents.push({
            type: 1,
            components: [
              {
                type: 4,
                custom_id: textInput.custom_id,
                value: valueToFill
              }
            ]
          });
        }

        console.log('[UPSTREAM BRIDGE] Đang gửi biểu mẫu sang shop gốc với dữ liệu:', {
          turns,
          isPriority: isPriority ? 'CO' : 'Không',
          tokenLength: cleanCustomerToken.length
        });

        // 6. Gửi biểu mẫu Modal Submit
        await activeClient.api.interactions.post({
          data: {
            type: 5, // MODAL_SUBMIT
            application_id: modalData.application_id,
            guild_id: message.guildId,
            channel_id: message.channelId,
            session_id: activeClient.sessionId,
            data: {
              id: modalData.id,
              custom_id: modalData.custom_id,
              components: submitComponents
            }
          }
        });
      }

      // Trừ số credit ước tính bên shop gốc
      const cost = isPriority ? turns * (config.queueSettings?.priorityMultiplier || 3) : turns;
      if (guildId) {
        db.deductGuildUpstreamCredits(guildId, cost);
      } else if (config.upstream?.upstreamCredits != null) {
        config.upstream.upstreamCredits = Math.max(0, config.upstream.upstreamCredits - cost);
        saveConfig(config);
      }

      console.log(`[UPSTREAM BRIDGE] ✅ Đã nộp biểu mẫu thành công vào shop gốc! (Trừ ${cost} credit gốc)`);

      return {
        success: true,
        message: 'Đã chuyển tiếp đơn và điền biểu mẫu thành công vào shop gốc!',
        upstreamModalTitle: modalData.title,
        cost
      };
    } catch (error) {
      console.error('[UPSTREAM BRIDGE] Lỗi trong quá trình chuyển tiếp vào shop gốc:', error);
      try {
        const ownerLogService = require('./ownerLogService');
        ownerLogService.logUpstreamError({
          error: error.message,
          context: 'Lỗi chuyển tiếp đơn sang shop gốc',
          guildId
        });
      } catch (e) {}
      return {
        success: false,
        message: `Lỗi chuyển tiếp sang shop gốc: ${error.message}`
      };
    }
  }

  /**
   * Lắng nghe thông báo săn được từ kênh log của shop gốc hoặc DM từ bot HQ gốc (1405843081890107392)
   */
  setupClaimListener(mainBotClient, targetClient = null, boundGuildId = null) {
    const clientToListen = targetClient || this.selfClient;
    if (!clientToListen) return;
    if (clientToListen._claimListenerAttached) return;
    clientToListen._claimListenerAttached = true;

    clientToListen.on('messageCreate', async msg => {
      try {
        const config = getConfig();
        const rootBotId = config.upstream?.botId || '1405843081890107392';
        const claimChannelId = config.upstream?.claimChannelId || process.env.UPSTREAM_CLAIM_CHANNEL_ID;

        const isDirectMessageFromRootBot = !msg.guildId && msg.author?.id === rootBotId;
        const isClaimChannelMessage = claimChannelId && msg.channelId === claimChannelId;

        if (!isDirectMessageFromRootBot && !isClaimChannelMessage) return;

        const text = msg.content || '';
        const embeds = msg.embeds || [];
        const embedTitles = embeds.map(e => e.title || '').join(' ');
        const embedDescs = embeds.map(e => e.description || '').join('\n');
        const embedFields = embeds.flatMap(e => (e.fields || []).map(f => `${f.name}: ${f.value}`)).join('\n');
        const fullText = `${text}\n${embedTitles}\n${embedDescs}\n${embedFields}`;

        // 0. Xác định chính xác server (guild) mà tài khoản token này đang phục vụ
        let effectiveGuildId = boundGuildId || clientToListen.boundGuildId || null;
        if (!effectiveGuildId) {
          try {
            const fs = require('fs');
            const path = require('path');
            const guildsDir = path.join(__dirname, '../../data/guilds');
            if (fs.existsSync(guildsDir)) {
              const files = fs.readdirSync(guildsDir).filter(f => f.endsWith('.json'));
              for (const f of files) {
                const gid = f.replace('.json', '');
                const raw = fs.readFileSync(path.join(guildsDir, f), 'utf8');
                const gCfg = JSON.parse(raw);
                if (gCfg && gCfg.upstreamToken === clientToListen.token) {
                  effectiveGuildId = gid;
                  break;
                }
              }
            }
          } catch (e) {}
        }

        // 1. XỬ LÝ KHI TRÚNG NITRO (Nhận DM '🎉 New claim!' hoặc '🤝 Order completed' hoặc 'Chúc mừng bạn vừa săn được Nitro' từ bot gốc 1405843081890107392)
        const isNitroClaim =
          /new claim|order completed|successfully claimed/i.test(fullText) ||
          /vừa săn được|trúng nitro|săn được nitro|chúc mừng|claimed nitro/i.test(fullText) ||
          embeds.some(e => e.title?.includes('New claim') || e.title?.includes('Order completed') || e.title?.includes('Vừa săn được')) ||
          (/(https:\/\/)?discord\.gift\/[a-zA-Z0-9]+/i.test(fullText) && !fullText.includes('Đổi credit thành công'));

        if (isNitroClaim && !fullText.includes('Đổi credit thành công') && !fullText.includes('Đã vào hàng đợi thành công')) {
          const activeQueue = effectiveGuildId
            ? (db.getActiveQueue(effectiveGuildId).length ? db.getActiveQueue(effectiveGuildId) : db.getActiveQueue())
            : db.getActiveQueue();
          if (!activeQueue.length) return;

          // Trích xuất tất cả User IDs được mention trong tin nhắn
          const mentionedIds = [];
          const mentionMatches = fullText.matchAll(/<@!?(\d+)>/g);
          for (const m of mentionMatches) {
            mentionedIds.push(m[1]);
          }
          if (msg.mentions?.users) {
            for (const u of msg.mentions.users.values()) {
              mentionedIds.push(u.id);
            }
          }

          let targetOrder = null;
          const { checkDiscordTokenAlive } = require('../utils/helpers');

          if (isDirectMessageFromRootBot) {
            // NHẬN DM TỪ BOT GỐC: Bot gốc 1405843081890107392 nhắn riêng cho tài khoản sỉ -> Chắc chắn là đơn của server này!
            console.log(`[UPSTREAM BRIDGE] 🔔 Nhận DM thông báo claim Nitro từ shop gốc (Server: ${effectiveGuildId || 'tất cả'}):`, fullText.slice(0, 160));
            const orderCodeMatch = fullText.match(/Mã đơn:\s*`?([a-zA-Z0-9]+)`?/i);
            if (orderCodeMatch) {
              targetOrder = activeQueue.find(o => o.upstreamOrderId === orderCodeMatch[1] || o.id === orderCodeMatch[1]);
            }
            if (!targetOrder) {
              const codeMatch = fullText.match(/`([a-zA-Z0-9]{16,32})`/);
              if (codeMatch) {
                targetOrder = activeQueue.find(o => o.upstreamOrderId === codeMatch[1] || o.id === codeMatch[1]);
              }
            }
            if (!targetOrder && mentionedIds.length > 0) {
              targetOrder = activeQueue.find(o => o.tokenUserId && mentionedIds.includes(o.tokenUserId));
            }
            if (!targetOrder) {
              for (const ord of activeQueue) {
                try {
                  const check = await checkDiscordTokenAlive(ord.token);
                  if (check.alive && check.user && check.user.premium_type > 0) {
                    targetOrder = ord;
                    break;
                  }
                } catch (e) {}
              }
            }
            if (!targetOrder) {
              targetOrder = activeQueue[0];
            }
          } else if (isClaimChannelMessage) {
            // TIN NHẮN TỪ KÊNH CLAIM CHUNG CỦA SHOP GỐC:
            const selfId = clientToListen.user?.id;
            targetOrder = activeQueue.find(ord => {
              if (ord.tokenUserId && mentionedIds.includes(ord.tokenUserId)) return true;
              if (ord.upstreamOrderId && fullText.includes(ord.upstreamOrderId)) return true;
              return false;
            });

            if (!targetOrder && selfId && mentionedIds.includes(selfId)) {
              targetOrder = activeQueue.find(ord => ord.tokenUserId === selfId);
            }

            if (!targetOrder) return;
            console.log('[UPSTREAM BRIDGE] 🔔 Nhận thông báo claim Nitro của shop mình trong kênh claims:', fullText.slice(0, 160));
          }

          if (targetOrder) {
            if (!targetOrder.guildId && effectiveGuildId) {
              targetOrder.guildId = effectiveGuildId;
            }

            const isBasic = /nitro basic/i.test(fullText);
            const nitroType = isBasic ? 'Nitro Basic – Tháng' : 'Nitro – Tháng';

            const isBoostBasicKept = isBasic && /guaranteed boost active/i.test(fullText);
            const deductedTurn = !isBoostBasicKept;

            const speedMatch = fullText.match(/(\d+)\s*ms/i);
            const speedMs = speedMatch ? parseInt(speedMatch[1], 10) : 3800;

            const giftMatch = fullText.match(/(https:\/\/)?discord\.gift\/[a-zA-Z0-9]+/i);
            const giftCode = giftMatch ? giftMatch[0] : 'discord.gift/upstream-claimed';

            console.log(`[UPSTREAM BRIDGE] 🎯 Đã xác định đơn trúng thưởng: ${targetOrder.id} (Khách: ${targetOrder.username}, Guild: ${targetOrder.guildId || 'DM'})`);

            const sniperService = require('./sniperService');
            await sniperService.handleClaim(mainBotClient, {
              orderId: targetOrder.id,
              nitroType,
              speedMs,
              giftCode,
              deductedTurn
            });

            console.log(`[UPSTREAM BRIDGE] 🏆 Đã gửi Live Claim Tracker vào kênh claims và ping role claim của server ${targetOrder.guildId || 'mặc định'}!`);
            return;
          }
        }

        // 2. XỬ LÝ KHI ĐƯỢC TẶNG / GIFT CREDIT (TRONG DM TỪ BOT GỐC)
        const isGiftCredit = /vừa tặng bạn/i.test(fullText) && /credit/i.test(fullText);
        if (isGiftCredit) {
          console.log('[UPSTREAM BRIDGE] 🎁 Nhận thông báo tặng credit từ shop gốc:', fullText.slice(0, 150));
          const amountMatch = fullText.match(/vừa tặng bạn\s*\*\*?(\d+)\*?\*?\s*credit/i);
          const balMatch = fullText.match(/Số dư hiện tại:\s*\*\*?(\d+)\*?\*?/i);
          const senderMatch = fullText.match(/\*\*([^*]+)\*\*\s*vừa tặng bạn/i);

          const amount = amountMatch ? parseInt(amountMatch[1], 10) : 0;
          const newBal = balMatch ? parseInt(balMatch[1], 10) : (this.getUpstreamCredits() + amount);
          const senderName = senderMatch ? senderMatch[1] : 'Shop gốc';

          if (balMatch) {
            this.setUpstreamCredits(newBal);
          } else if (amount > 0) {
            this.setUpstreamCredits(this.getUpstreamCredits() + amount);
          }

          // Thông báo cho Owner bot qua DM
          if (config.ownerId && mainBotClient) {
            try {
              const { EmbedBuilder } = require('discord.js');
              const owner = await mainBotClient.users.fetch(config.ownerId).catch(() => null);
              if (owner) {
                const ownerEmbed = new EmbedBuilder()
                  .setTitle('🎁 Tài khoản sỉ nhận được Credit từ Shop Gốc')
                  .setDescription(
                    `Tài khoản sỉ vừa nhận được **+${amount} credit** từ **${senderName}**!\n\n` +
                    `• **Số dư kho sỉ hiện tại:** **${newBal} credit**\n` +
                    `• **Hệ thống:** Đã tự động cập nhật số dư kho để bán hàng.`
                  )
                  .setColor(65280)
                  .setTimestamp();
                await owner.send({ embeds: [ownerEmbed] });
              }
            } catch (e) {}
          }

          // Bắn log vào kênh bảo mật của Server Owner
          try {
            const ownerLogService = require('./ownerLogService');
            ownerLogService.logUpstreamGift({
              senderName,
              amount,
              newBal,
              guildId: effectiveGuildId
            });
          } catch (e) {}
          return;
        }

        // 3. XỬ LÝ THÔNG BÁO ĐỔI CREDIT / VÀO HÀNG ĐỢI THÀNH CÔNG (DM từ bot HQ gốc "Đổi credit thành công")
        if (fullText.includes('Đổi credit thành công') || fullText.includes('Đã vào hàng đợi thành công') || /mã đơn:/i.test(fullText)) {
          console.log('[UPSTREAM BRIDGE] 📋 Nhận xác nhận vào hàng đợi từ shop gốc:', fullText.slice(0, 150));
          const orderCodeMatch = fullText.match(/Mã đơn:\s*`?([a-zA-Z0-9]+)`?/i);
          const posMatch = fullText.match(/Vị trí hàng đợi:\s*\*\*?(\d+)\*?\*?/i);

          if (orderCodeMatch) {
            const upstreamOrderId = orderCodeMatch[1];
            const upstreamPos = posMatch ? parseInt(posMatch[1], 10) : null;

            // Tìm đơn gần nhất trong hệ thống nội bộ của server này để gắn thông tin đơn gốc
            const guildQueue = effectiveGuildId ? db.getActiveQueue(effectiveGuildId) : db.getActiveQueue();
            const matchedOrder = guildQueue.find(o => !o.upstreamOrderId) || guildQueue[guildQueue.length - 1];
            if (matchedOrder) {
              db.updateOrder(matchedOrder.id, {
                upstreamOrderId,
                upstreamPosition: upstreamPos,
                upstreamSynced: true
              });
              console.log(`[UPSTREAM BRIDGE] ✅ Đã liên kết đơn nội bộ ${matchedOrder.id} với mã đơn shop gốc: ${upstreamOrderId} (Vị trí: ${upstreamPos})`);

              // Cập nhật lại bảng queue realtime
              try {
                const updaterService = require('./updaterService');
                updaterService.notifyQueueChanged();
              } catch (e) {}

              // Gửi DM cho khách hàng xác nhận đơn đã vào hàng đợi shop gốc
              if (mainBotClient && matchedOrder.userId) {
                try {
                  const customer = await mainBotClient.users.fetch(matchedOrder.userId).catch(() => null);
                  if (customer) {
                    await customer.send({
                      content:
                        `📋 **ĐƠN HÀNG ĐÃ ĐƯỢC SHOP GỐC TIẾP NHẬN THÀNH CÔNG!**\n\n` +
                        `• Mã đơn shop gốc: \`${upstreamOrderId}\`\n` +
                        (upstreamPos != null ? `• Vị trí trong hàng đợi: **#${upstreamPos}**\n` : '') +
                        `• Số lượt: **${matchedOrder.turns || matchedOrder.initialTurns} lượt** ${matchedOrder.isPriority ? '(⚡ Ưu tiên)' : ''}\n` +
                        `• Trạng thái: ⏳ **Đang xếp hàng chờ bot săn Nitro**\n\n` +
                        `*Hệ thống đang tự động theo dõi, ngay khi săn trúng quà sẽ ping bạn tại kênh claims của server!*`
                    }).catch(() => {});
                  }
                } catch (e) {}
              }

              // Ghi log vào kênh bảo mật của Server Owner
              try {
                const ownerLogService = require('./ownerLogService');
                ownerLogService.logUpstreamOrderSynced(matchedOrder, {
                  upstreamOrderId,
                  upstreamPos
                });
              } catch (e) {}
            }
          }
          return;
        }

        // 4. XỬ LÝ TOKEN CHẾT / HOÀN LƯỢT TỪ SHOP GỐC
        if (/token/i.test(fullText) && (/chết|không hợp lệ|hỏng|bị lỗi/i.test(fullText))) {
          console.warn('[UPSTREAM BRIDGE] ⚠️ Shop gốc báo lỗi token:', fullText.slice(0, 150));
          const activeQueue = effectiveGuildId ? (db.getActiveQueue(effectiveGuildId).length ? db.getActiveQueue(effectiveGuildId) : db.getActiveQueue()) : db.getActiveQueue();
          if (activeQueue.length) {
            const targetOrder = activeQueue[0];
            const queueService = require('./queueService');
            await queueService.handleDeadToken(mainBotClient, targetOrder.id);
          }
          return;
        }
      } catch (err) {
        console.error('[UPSTREAM BRIDGE] Lỗi xử lý tin nhắn từ shop gốc:', err);
      }
    });
  }

  /**
   * Lấy số credit gốc hiện có
   */
  getUpstreamCredits() {
    const config = getConfig();
    return config.upstream?.upstreamCredits ?? 0;
  }

  /**
   * Cập nhật số credit gốc
   */
  setUpstreamCredits(amount) {
    const config = getConfig();
    if (!config.upstream) config.upstream = {};
    config.upstream.upstreamCredits = Number(amount);
    saveConfig(config);
    return config.upstream.upstreamCredits;
  }

  /**
   * Helper gửi slash command sang bot shop gốc và chờ tin nhắn phản hồi chính xác (kèm embeds)
   */
  async sendSlashAndWaitResponse(commandName, ...args) {
    const config = getConfig();
    const upstreamCfg = config.upstream || {};

    let clientToUse = this.selfClient;
    let actualArgs = args;
    if (args.length > 0 && args[0] && typeof args[0] === 'object' && args[0].readyAt !== undefined) {
      clientToUse = args[0];
      actualArgs = args.slice(1);
    }

    if (!clientToUse || !clientToUse.readyAt) return null;

    const botId = upstreamCfg.botId || '1405843081890107392';
    const commandsChannelId = upstreamCfg.commandsChannelId || '1555969644173598811';
    const cmdChannel = await clientToUse.channels.fetch(commandsChannelId).catch(() => null);
    if (!cmdChannel || typeof cmdChannel.sendSlash !== 'function') return null;

    return new Promise(async (resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 10000);

      const updateHandler = (oldMsg, newMsg) => {
        if (initialMsg && newMsg.id === initialMsg.id && (newMsg.content || newMsg.embeds?.length)) {
          cleanup();
          resolve(this.normalizeMessage(newMsg));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        clientToUse.removeListener('messageUpdate', updateHandler);
      };

      clientToUse.on('messageUpdate', updateHandler);

      let initialMsg = null;
      try {
        initialMsg = await cmdChannel.sendSlash(botId, commandName, ...actualArgs);
        if (initialMsg && (initialMsg.content || initialMsg.embeds?.length)) {
          cleanup();
          return resolve(this.normalizeMessage(initialMsg));
        }
      } catch (err) {
        cleanup();
        console.warn(`[UPSTREAM BRIDGE] Lỗi khi gửi /${commandName}:`, err.message);
        return resolve(null);
      }
    });
  }

  /**
   * Chuẩn hóa tin nhắn và embeds từ selfbot để hiển thị trên bot Discord.js v14
   */
  normalizeMessage(msg) {
    if (!msg) return null;
    const content = msg.content || '';
    const embeds = [];

    if (msg.embeds && msg.embeds.length > 0) {
      const { EmbedBuilder } = require('discord.js');
      for (const e of msg.embeds) {
        const eb = new EmbedBuilder();
        if (e.title) eb.setTitle(e.title);
        if (e.description) eb.setDescription(e.description);
        if (e.color) eb.setColor(e.color);
        if (e.thumbnail?.url) eb.setThumbnail(e.thumbnail.url);
        if (e.image?.url) eb.setImage(e.image.url);
        if (e.footer?.text) {
          eb.setFooter({
            text: e.footer.text,
            iconURL: e.footer.icon_url || e.footer.iconURL
          });
        }
        if (e.fields && e.fields.length > 0) {
          eb.addFields(
            e.fields.map(f => ({
              name: f.name || '\u200B',
              value: f.value || '\u200B',
              inline: Boolean(f.inline)
            }))
          );
        }
        embeds.push(eb);
      }
    }

    return { content, embeds, raw: msg };
  }

  /**
   * Đồng bộ rút đơn / rời hàng đợi sang shop gốc (/queue leave position)
   * @param {number} position 0 = Rời tất cả, > 0 = Đơn cụ thể
   */
  async leaveUpstreamQueue(position = 0) {
    if (!this.selfClient || !this.isReady) {
      return { success: false, message: 'Upstream chưa sẵn sàng' };
    }

    try {
      console.log(`[UPSTREAM BRIDGE] Đang gửi /queue leave position:${position} sang shop gốc...`);
      const upstreamMsg = await this.sendSlashAndWaitResponse('queue leave', Number(position));
      if (upstreamMsg) {
        console.log(`[UPSTREAM BRIDGE] ✅ Nhận phản hồi /queue leave:`, upstreamMsg.content || upstreamMsg.embeds?.[0]?.data?.description || 'OK');
        return { success: true, upstreamResponse: upstreamMsg };
      }
      return { success: true, message: 'Đã gửi lệnh rút đơn' };
    } catch (err) {
      console.warn('[UPSTREAM BRIDGE] Lỗi gửi /queue leave sang shop gốc:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Đồng bộ /rejoin sang shop gốc khi khách đổi token mới
   */
  async rejoinUpstreamQueue(token) {
    if (!this.selfClient || !this.isReady) {
      return { success: false, message: 'Upstream chưa sẵn sàng' };
    }

    try {
      console.log('[UPSTREAM BRIDGE] Đang gửi /rejoin sang shop gốc...');
      const upstreamMsg = await this.sendSlashAndWaitResponse('rejoin', String(token));
      if (upstreamMsg) {
        console.log('[UPSTREAM BRIDGE] ✅ Nhận phản hồi /rejoin:', upstreamMsg.content || upstreamMsg.embeds?.[0]?.data?.description || 'OK');
        return { success: true, upstreamResponse: upstreamMsg };
      }
      return { success: true, message: 'Đã gửi lệnh rejoin' };
    } catch (err) {
      console.warn('[UPSTREAM BRIDGE] Lỗi gửi /rejoin sang shop gốc:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Tra cứu trạng thái đơn hàng & số dư từ shop gốc (/queue check)
   */
  async checkUpstreamQueueStatus() {
    if (!this.selfClient || !this.isReady) return null;
    return await this.sendSlashAndWaitResponse('queue check');
  }

  /**
   * Tra cứu số dư từ shop gốc (/bank balance)
   */
  async checkUpstreamBankBalance(clientToUse = null) {
    const client = clientToUse || this.selfClient;
    if (!client || !client.readyAt) return null;
    return await this.sendSlashAndWaitResponse('bank balance', client);
  }

  /**
   * Lấy số dư credit thực tế dạng số nguyên của token trên shop gốc
   * @param {string|null} guildId
   * @returns {Promise<number|null>}
   */
  async getUpstreamRealBalance(guildId = null) {
    let clientToUse = this.selfClient;
    if (guildId) {
      const guildCfg = db.getGuildConfig(guildId) || {};
      if (guildCfg.upstreamToken) {
        clientToUse = await this.getClientForToken(guildCfg.upstreamToken, guildId);
      }
    }
    if (!clientToUse || !clientToUse.readyAt) return null;
    try {
      const res = await this.checkUpstreamBankBalance(clientToUse);
      if (!res) return null;

      const desc =
        res.embeds?.[0]?.data?.description ||
        res.embeds?.[0]?.description ||
        res.content ||
        '';

      const match = desc.match(/\*\*Số dư:\*\*\s*(\d+)\s*credit/i) || desc.match(/(\d+)\s*credit/i);
      if (match) {
        const credits = parseInt(match[1], 10);
        if (guildId) {
          db.setGuildUpstreamCredits(guildId, credits);
        } else {
          this.setUpstreamCredits(credits);
        }
        return credits;
      }
    } catch (e) {
      console.warn('[UPSTREAM BRIDGE] Lỗi phân tích số dư kho gốc:', e.message);
    }
    return null;
  }

  /**
   * Lấy dữ liệu bảng hàng đợi trực tiếp từ tin nhắn kênh queue của shop gốc
   */
  async fetchRootQueue() {
    const config = getConfig();
    const upstreamCfg = config.upstream || {};
    if (!this.selfClient || !this.isReady) return null;

    const queueChannelId = upstreamCfg.rootQueueChannelId || upstreamCfg.channelId || '1405832729114710036';
    try {
      const qChannel = await this.selfClient.channels.fetch(queueChannelId).catch(() => null);
      if (!qChannel) return null;

      const msgs = await qChannel.messages.fetch({ limit: 5 }).catch(() => null);
      if (!msgs || !msgs.size) return null;

      for (const msg of msgs.values()) {
        const container = msg.components?.[0];
        if (container && container.components) {
          let titleText = '';
          let bannerUrl = null;
          let queueLines = '';
          let specialSection = '';
          let deadSection = '';
          let footerText = '';

          for (const comp of container.components) {
            if (comp.type === 'MEDIA_GALLERY' || comp.type === 12) {
              bannerUrl = comp.items?.[0]?.media?.url || null;
            } else if (comp.type === 'TEXT_DISPLAY' || comp.type === 10) {
              const text = comp.content || '';
              if (text.startsWith('#') && (text.includes('Hàng đợi') || text.includes('SHOP') || text.includes('Shop'))) {
                titleText = text;
              } else if (text.includes('1)') || text.includes('Hiện tại chưa có đơn')) {
                queueLines = text;
              } else if (text.includes('Thuê bot') || text.includes('Hàng đợi đặc biệt')) {
                specialSection = `\n\n${text}`;
              } else if (text.includes('Token chết') || text.includes('/rejoin')) {
                deadSection = `\n\n${text}`;
              } else if (text.includes('Trang') || text.includes('đang chạy')) {
                footerText = text.replace(/^-#\s*/, '').trim();
              }
            }
          }

          if (queueLines) {
            return {
              titleText,
              queueLines,
              specialSection,
              deadSection,
              footerText,
              bannerUrl
            };
          }
        }
      }
    } catch (err) {
      console.warn('[UPSTREAM BRIDGE] Lỗi fetchRootQueue:', err.message);
    }
    return null;
  }
}

module.exports = new UpstreamBridge();
