const db = require('../database');
const { getConfig, getGuildEffectiveConfig } = require('../config');
const { buildQueueViewEmbed, buildSyncedQueueEmbed, buildStatsEmbed, buildShopPanel } = require('../utils/embeds');

class UpdaterService {
  constructor() {
    this.client = null;
    this.updateTimeout = null;
    this.interval = null;
  }

  /**
   * Khởi tạo dịch vụ cập nhật tự động khi bot online
   */
  initialize(client) {
    this.client = client;

    // Định kỳ 30 giây tự động cập nhật bảng hàng đợi, thống kê và bảng giá
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.updateAllGuildDisplays();
    }, 30000);

    // Chạy lần đầu sau 3 giây khi bot đã sẵn sàng
    setTimeout(() => {
      this.updateAllGuildDisplays();
    }, 3000);

    console.log('[UPDATER SERVICE] 🔄 Đã kích hoạt hệ thống tự động cập nhật Queue, Stats & Bảng Giá realtime!');
  }

  /**
   * Gọi thông báo khi hàng đợi thay đổi (vào queue, token lỗi, rời queue, hoàn thành)
   */
  notifyQueueChanged() {
    this.scheduleUpdate();
  }

  /**
   * Gọi thông báo khi thống kê thay đổi (săn được Nitro, chỉnh sửa thống kê)
   */
  notifyStatsChanged() {
    this.scheduleUpdate();
  }

  /**
   * Gọi thông báo khi bảng giá hoặc sự kiện sale thay đổi
   */
  notifyPricePanelChanged() {
    this.scheduleUpdate();
  }

  scheduleUpdate() {
    if (this.updateTimeout) clearTimeout(this.updateTimeout);
    this.updateTimeout = setTimeout(() => {
      this.updateAllGuildDisplays();
    }, 600); // Debounce 600ms tránh spam rate limit
  }

  /**
   * Duyệt qua tất cả các Guild bot tham gia và cập nhật tin nhắn trong kênh queue, stats và bảng giá
   */
  async updateAllGuildDisplays() {
    if (!this.client || !this.client.isReady()) return;
    const config = getConfig();

    for (const guild of this.client.guilds.cache.values()) {
      try {
        await this.updateGuildPricePanel(guild, config);
        await this.updateGuildQueue(guild, config);
        await this.updateGuildStats(guild, config);
      } catch (err) {
        // console.error(`[UPDATER SERVICE] Lỗi cập nhật guild ${guild.id}:`, err.message);
      }
    }
  }

  /**
   * Cập nhật tin nhắn bảng giá trong kênh #price của Guild (Tự động cập nhật khi đổi giá hoặc chạy sale)
   */
  async updateGuildPricePanel(guild, config) {
    const guildCfg = db.getGuildConfig(guild.id);
    const priceChannelId = guildCfg.priceChannelId || config.channels?.priceChannelId;
    if (!priceChannelId) return;

    const channel = await guild.channels.fetch(priceChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const effConfig = getGuildEffectiveConfig(guild.id);
    const saleStatus = db.getGuildSaleStatus(guild.id);
    const { embeds, components } = buildShopPanel(effConfig, saleStatus);

    let targetMsg = null;
    if (guildCfg.priceMessageId) {
      targetMsg = await channel.messages.fetch(guildCfg.priceMessageId).catch(() => null);
    }

    if (!targetMsg) {
      // Quét các tin nhắn gần nhất do bot gửi có embed hoặc select menu
      const messages = await channel.messages.fetch({ limit: 15 }).catch(() => null);
      if (messages) {
        for (const msg of messages.values()) {
          if (msg.author.id === this.client.user.id) {
            targetMsg = msg;
            break;
          }
        }
      }
    }

    if (targetMsg) {
      await targetMsg.edit({ embeds, components }).catch(() => null);
      if (guildCfg.priceMessageId !== targetMsg.id) {
        db.setGuildConfig(guild.id, { priceMessageId: targetMsg.id });
      }
    } else {
      const newMsg = await channel.send({ embeds, components }).catch(() => null);
      if (newMsg) {
        db.setGuildConfig(guild.id, { priceMessageId: newMsg.id });
      }
    }
  }

  /**
   * Cập nhật tin nhắn bảng hàng đợi trong kênh #queue của Guild
   */
  async updateGuildQueue(guild, config) {
    const guildCfg = db.getGuildConfig(guild.id);
    const queueChannelId = guildCfg.queueChannelId || config.channels.queueChannelId;
    if (!queueChannelId) return;

    const channel = await guild.channels.fetch(queueChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const activeQueue = db.getActiveQueue(guild.id);
    const deadOrders = db.getDeadOrders(guild.id);
    const rentalOrders = db.getRentalQueue(guild.id);
    const { embed, row } = buildQueueViewEmbed(config, activeQueue, deadOrders, 1, { rentalOrders });

    let targetMsg = null;
    if (guildCfg.queueMessageId) {
      targetMsg = await channel.messages.fetch(guildCfg.queueMessageId).catch(() => null);
    }

    if (!targetMsg) {
      // Quét các tin nhắn gần nhất do bot gửi
      const messages = await channel.messages.fetch({ limit: 15 }).catch(() => null);
      if (messages) {
        for (const msg of messages.values()) {
          if (msg.author.id === this.client.user.id) {
            targetMsg = msg;
            break;
          }
        }
      }
    }

    if (targetMsg) {
      await targetMsg.edit({ embeds: [embed], components: [row] }).catch(() => null);
      if (guildCfg.queueMessageId !== targetMsg.id) {
        db.setGuildConfig(guild.id, { queueMessageId: targetMsg.id });
      }
    } else {
      const newMsg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
      if (newMsg) {
        db.setGuildConfig(guild.id, { queueMessageId: newMsg.id });
      }
    }
  }

  /**
   * Cập nhật tin nhắn bảng thống kê trong kênh #stats của Guild (Tính riêng theo từng server)
   */
  async updateGuildStats(guild, config) {
    const guildCfg = db.getGuildConfig(guild.id);
    const statsChannelId = guildCfg.statsChannelId || config.channels.statsChannelId;
    if (!statsChannelId) return;

    const channel = await guild.channels.fetch(statsChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    // Lấy thống kê tính riêng cho từng server
    const stats = db.getGuildStats(guild.id);
    const embed = buildStatsEmbed(config, stats);

    let targetMsg = null;
    if (guildCfg.statsMessageId) {
      targetMsg = await channel.messages.fetch(guildCfg.statsMessageId).catch(() => null);
    }

    if (!targetMsg) {
      const messages = await channel.messages.fetch({ limit: 15 }).catch(() => null);
      if (messages) {
        for (const msg of messages.values()) {
          if (msg.author.id === this.client.user.id) {
            targetMsg = msg;
            break;
          }
        }
      }
    }

    if (targetMsg) {
      await targetMsg.edit({ embeds: [embed] }).catch(() => null);
      if (guildCfg.statsMessageId !== targetMsg.id) {
        db.setGuildConfig(guild.id, { statsMessageId: targetMsg.id });
      }
    } else {
      const newMsg = await channel.send({ embeds: [embed] }).catch(() => null);
      if (newMsg) {
        db.setGuildConfig(guild.id, { statsMessageId: newMsg.id });
      }
    }
  }
}

module.exports = new UpdaterService();
