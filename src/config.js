const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config.json');

let configData = null;

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      throw new Error(`Config file not found at ${CONFIG_PATH}`);
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    configData = JSON.parse(raw);
    return configData;
  } catch (error) {
    console.error('[CONFIG] Lỗi đọc config.json:', error);
    if (!configData) {
      configData = {};
    }
    return configData;
  }
}

function getConfig() {
  if (!configData) {
    loadConfig();
  }
  return configData;
}

function saveConfig(newConfig) {
  try {
    configData = newConfig || configData;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('[CONFIG] Lỗi ghi config.json:', error);
    return false;
  }
}

function updateConfig(partial) {
  const current = getConfig();
  const merged = deepMerge(current, partial);
  return saveConfig(merged);
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && !Array.isArray(source[key]) && key in target) {
      Object.assign(source[key], deepMerge(target[key], source[key]));
    }
  }
  Object.assign(target || {}, source);
  return target;
}

function getGuildEffectiveConfig(guildId) {
  const base = JSON.parse(JSON.stringify(getConfig()));
  if (!guildId) return base;
  try {
    const db = require('./database');
    const override = db.getGuildConfig(guildId);
    if (!override || !Object.keys(override).length) return base;

    // 1. Thương hiệu Shop & Emoji
    if (override.name || override.shop?.name) base.shop.name = override.name || override.shop?.name;
    if (override.avatarUrl || override.shop?.avatarUrl) base.shop.avatarUrl = override.avatarUrl || override.shop?.avatarUrl;
    if (override.bannerUrl || override.shop?.bannerUrl) base.shop.bannerUrl = override.bannerUrl || override.shop?.bannerUrl;
    if (override.primaryColor || override.shop?.primaryColor) base.shop.primaryColor = override.primaryColor || override.shop?.primaryColor;
    if (override.nitroBasicEmoji || override.shop?.nitroBasicEmoji) base.shop.nitroBasicEmoji = override.nitroBasicEmoji || override.shop?.nitroBasicEmoji;
    if (override.nitroBoostEmoji || override.shop?.nitroBoostEmoji) base.shop.nitroBoostEmoji = override.nitroBoostEmoji || override.shop?.nitroBoostEmoji;
    if (override.nitroEmoji || override.shop?.nitroEmoji) base.shop.nitroEmoji = override.nitroEmoji || override.shop?.nitroEmoji;
    if (override.celebrateEmoji || override.shop?.celebrateEmoji) base.shop.celebrateEmoji = override.celebrateEmoji || override.shop?.celebrateEmoji;

    // 1.1 Emoji & Cài đặt Hàng đợi (Queue)
    if (!base.queueSettings) base.queueSettings = {};
    const qOverride = override.queueSettings || {};
    if (qOverride.currentTurnEmoji || override.currentTurnEmoji) base.queueSettings.currentTurnEmoji = qOverride.currentTurnEmoji || override.currentTurnEmoji;
    if (qOverride.waitingTurnEmoji || override.waitingTurnEmoji) base.queueSettings.waitingTurnEmoji = qOverride.waitingTurnEmoji || override.waitingTurnEmoji;
    if (qOverride.priorityEmoji || override.priorityEmoji) base.queueSettings.priorityEmoji = qOverride.priorityEmoji || override.priorityEmoji;
    if (qOverride.shieldEmoji || override.shieldEmoji) base.queueSettings.shieldEmoji = qOverride.shieldEmoji || override.shieldEmoji;
    if (qOverride.discordEmoji || override.discordEmoji) base.queueSettings.discordEmoji = qOverride.discordEmoji || override.discordEmoji;

    // 2. Nội dung chữ các kênh
    if (override.guideTitle || override.content?.guideTitle) base.content.guideTitle = override.guideTitle || override.content?.guideTitle;
    if (override.tokenGuide || override.content?.tokenGuide) base.content.tokenGuide = override.tokenGuide || override.content?.tokenGuide;
    if (override.priorityGuide || override.content?.priorityGuide) base.content.priorityGuide = override.priorityGuide || override.content?.priorityGuide;
    if (override.queuePanelTitle || override.content?.queuePanelTitle) base.content.queuePanelTitle = override.queuePanelTitle || override.content?.queuePanelTitle;
    if (override.queuePanelDescription || override.description || override.content?.queuePanelDescription) {
      base.content.queuePanelDescription = override.queuePanelDescription || override.description || override.content?.queuePanelDescription;
    }
    if (override.vouchText || override.content?.vouchText) base.content.vouchText = override.vouchText || override.content?.vouchText;

    // 3. Bảng giá niêm yết sản phẩm & Tài khoản ngân hàng VietQR
    if (override.packages && Array.isArray(override.packages) && override.packages.length > 0) {
      base.pricing.packages = override.packages;
    } else if (override.pricing?.packages && Array.isArray(override.pricing.packages) && override.pricing.packages.length > 0) {
      base.pricing.packages = override.pricing.packages;
    }
    if (override.bank || override.pricing?.bank) {
      base.bank = { ...base.bank, ...(override.bank || override.pricing?.bank) };
    }

    // 4. Kênh & Role: Kênh của Guild nào chỉ dùng của Guild đó, tuyệt đối không kế thừa chéo tránh lộ nguồn!
    base.guildId = guildId;
    base.channels = {
      claimLogChannelId: override.claimLogChannelId || null,
      claimPingRoleId: override.claimPingRoleId || null,
      priceChannelId: override.priceChannelId || null,
      panelChannelId: override.panelChannelId || null,
      queueChannelId: override.queueChannelId || null,
      bankChannelId: override.bankChannelId || null,
      statsChannelId: override.statsChannelId || null,
      tokenGuideChannelId: override.tokenGuideChannelId || null,
      requirementsChannelId: override.requirementsChannelId || null,
      checkCreditChannelId: override.checkCreditChannelId || null,
      dmsBotChannelId: override.dmsBotChannelId || null,
      ownerLogChannelId: override.ownerLogChannelId || null,
      deadTokenChannelId: override.deadTokenChannelId || null,
      commandsChannelId: override.commandsChannelId || null,
      vouchChannelId: override.vouchChannelId || null
    };

    if (override.priceChannelId) {
      base.content.priceChannelText = `<#${override.priceChannelId}>`;
    } else {
      base.content.priceChannelText = '';
    }

    if (override.legitCount || override.content?.legitCount) base.content.legitCount = override.legitCount || override.content?.legitCount;

    // 5. Upstream Token riêng
    if (override.upstreamToken) {
      if (!base.upstream) base.upstream = {};
      base.upstream.userToken = override.upstreamToken;
    }
  } catch (err) {
    // fallback
  }
  return base;
}

module.exports = {
  loadConfig,
  getConfig,
  saveConfig,
  updateConfig,
  getGuildEffectiveConfig
};
