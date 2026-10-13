const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');
const { encryptToken, decryptToken, maskToken } = require('./utils/security');
const { extractUserIdFromToken } = require('./utils/helpers');

const DATA_DIR = path.join(__dirname, '../data');
const GUILDS_DIR = path.join(DATA_DIR, 'guilds');

// Ensure data and guilds directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(GUILDS_DIR)) {
  fs.mkdirSync(GUILDS_DIR, { recursive: true });
}

class JsonFileStore {
  constructor(filename, defaultData) {
    this.filepath = path.join(DATA_DIR, filename);
    this.defaultData = defaultData;
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filepath)) {
        const raw = fs.readFileSync(this.filepath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error(`[DB] Error loading ${this.filepath}:`, err);
    }
    this.save(this.defaultData);
    return JSON.parse(JSON.stringify(this.defaultData));
  }

  save(data = null) {
    try {
      if (data !== null) this.data = data;
      fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error(`[DB] Error saving ${this.filepath}:`, err);
      return false;
    }
  }
}

// Stores
const usersStore = new JsonFileStore('users.json', {});
const ordersStore = new JsonFileStore('orders.json', []);
const keysStore = new JsonFileStore('keys.json', {});
const depositsStore = new JsonFileStore('deposits.json', []);
const claimsStore = new JsonFileStore('claims.json', []);
const settingsStore = new JsonFileStore('settings.json', {});
const licensesStore = new JsonFileStore('licenses.json', {});
const statsStore = new JsonFileStore('stats.json', {
  totalClaims: 8,
  claimsToday: 0,
  basicCount: 7,
  boostCount: 1,
  totalValueUsd: 30.92,
  totalValueVnd: 803920,
  todayValueUsd: 0,
  todayValueVnd: 0,
  lastResetDate: new Date().toISOString().split('T')[0]
});

// Database API
const db = {
  // === USER METHODS (CÔ LẬP SỐ DƯ CREDIT THEO MỖI MÁY CHỦ DISCORD) ===
  getUser(userId, guildId = null) {
    if (guildId) {
      const gConfig = this.getGuildConfig(guildId);
      if (!gConfig.users) {
        gConfig.users = {};
      }
      if (!gConfig.users[userId]) {
        // Tự động đồng bộ số dư từ users.json cho máy chủ chính hoặc máy chủ gần nhất
        const legacyUser = usersStore.data[userId];
        if (legacyUser && (legacyUser.lastGuildId === String(guildId) || String(guildId) === '1558873001045393480')) {
          gConfig.users[userId] = {
            id: userId,
            balance: Number(legacyUser.balance || 0),
            totalSpent: Number(legacyUser.totalSpent || 0),
            totalWon: Number(legacyUser.totalWon || 0),
            guildId: String(guildId),
            createdAt: legacyUser.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        } else {
          gConfig.users[userId] = {
            id: userId,
            balance: 0,
            totalSpent: 0,
            totalWon: 0,
            guildId: String(guildId),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        this.setGuildConfig(guildId, { users: gConfig.users });
      }
      return gConfig.users[userId];
    }

    if (!usersStore.data[userId]) {
      usersStore.data[userId] = {
        id: userId,
        balance: 0,
        totalSpent: 0,
        totalWon: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      usersStore.save();
    }
    return usersStore.data[userId];
  },

  addCredits(userId, amount, guildId = null) {
    if (guildId) {
      const user = this.getUser(userId, guildId);
      user.balance += Number(amount);
      user.updatedAt = new Date().toISOString();
      const gConfig = this.getGuildConfig(guildId);
      gConfig.users = gConfig.users || {};
      gConfig.users[userId] = user;
      this.setGuildConfig(guildId, { users: gConfig.users });
      return user.balance;
    }
    const user = this.getUser(userId);
    user.balance += Number(amount);
    user.updatedAt = new Date().toISOString();
    usersStore.save();
    return user.balance;
  },

  deductCredits(userId, amount, guildId = null) {
    if (guildId) {
      const user = this.getUser(userId, guildId);
      if (user.balance < Number(amount)) return false;
      user.balance -= Number(amount);
      user.totalSpent = (user.totalSpent || 0) + Number(amount);
      user.updatedAt = new Date().toISOString();
      const gConfig = this.getGuildConfig(guildId);
      gConfig.users = gConfig.users || {};
      gConfig.users[userId] = user;
      this.setGuildConfig(guildId, { users: gConfig.users });
      return true;
    }
    const user = this.getUser(userId);
    if (user.balance < Number(amount)) return false;
    user.balance -= Number(amount);
    user.totalSpent = (user.totalSpent || 0) + Number(amount);
    user.updatedAt = new Date().toISOString();
    usersStore.save();
    return true;
  },

  getLeaderboard(guildId = null, limit = 10) {
    if (guildId) {
      const gConfig = this.getGuildConfig(guildId);
      const users = Object.values(gConfig.users || {});
      users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      return users.slice(0, limit);
    }
    const users = Object.values(usersStore.data);
    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
    return users.slice(0, limit);
  },

  getTotalCreditsInSystem(guildId = null) {
    if (guildId) {
      const gConfig = this.getGuildConfig(guildId);
      return Object.values(gConfig.users || {}).reduce((acc, u) => acc + (u.balance || 0), 0);
    }
    return Object.values(usersStore.data).reduce((acc, u) => acc + (u.balance || 0), 0);
  },

  updateUser(userId, partial, guildId = null) {
    if (guildId) {
      const user = this.getUser(userId, guildId);
      Object.assign(user, partial);
      user.updatedAt = new Date().toISOString();
      const gConfig = this.getGuildConfig(guildId);
      gConfig.users = gConfig.users || {};
      gConfig.users[userId] = user;
      this.setGuildConfig(guildId, { users: gConfig.users });
      return user;
    }
    const user = this.getUser(userId);
    Object.assign(user, partial);
    user.updatedAt = new Date().toISOString();
    usersStore.save();
    return user;
  },

  // === ORDER / QUEUE METHODS ===
  createOrder({ userId, username, token, tokenUserId = null, tokenUsername = null, turns, isPriority, guildId, isDm }) {
    const config = getConfig();
    const maxShield = config.queueSettings?.maxShield || 10;
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const encToken = encryptToken(token);
    const masked = maskToken(token);
    const resolvedTokenUserId = tokenUserId || extractUserIdFromToken(token);

    const order = {
      id: orderId,
      userId,
      username,
      token: encToken,
      tokenMasked: masked,
      tokenUserId: resolvedTokenUserId || null,
      tokenUsername: tokenUsername || null,
      initialTurns: Number(turns),
      remainingTurns: Number(turns),
      completedTurns: 0,
      isPriority: Boolean(isPriority),
      guildId: guildId || null,
      isDm: Boolean(isDm),
      shield: 0,
      maxShield,
      status: 'WAITING', // WAITING, HUNTING, COMPLETED, CANCELLED, PAUSED_TOKEN_DEAD
      enteredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    ordersStore.data.push(order);
    ordersStore.save();
    return order;
  },

  cleanExpiredDeadOrders() {
    const config = getConfig();
    const timeoutMs = (config.queueSettings?.rejoinTimeoutMinutes || 60) * 60 * 1000;
    const now = Date.now();
    let hasChanged = false;

    for (const o of ordersStore.data) {
      if (o.status === 'PAUSED_TOKEN_DEAD') {
        const pausedTime = new Date(o.pausedAt || o.updatedAt || o.enteredAt).getTime();
        if (now - pausedTime >= timeoutMs) {
          o.status = 'EXPIRED';
          o.updatedAt = new Date().toISOString();
          hasChanged = true;
        }
      }
    }

    if (hasChanged) {
      ordersStore.save();
    }
  },

  getActiveQueue(guildId = null) {
    this.cleanExpiredDeadOrders();
    // Active orders are WAITING or HUNTING
    const active = ordersStore.data.filter(o => {
      if (o.status !== 'WAITING' && o.status !== 'HUNTING') return false;
      if (guildId && o.guildId && o.guildId !== guildId) return false;
      return true;
    });
    // Đơn nào join sau thì đứng ở dưới (xếp theo thời gian enteredAt tăng dần - FIFO)
    active.sort((a, b) => new Date(a.enteredAt) - new Date(b.enteredAt));
    return active;
  },

  getOrder(orderId) {
    return ordersStore.data.find(o => o.id === orderId);
  },

  getUserActiveOrders(userId) {
    return ordersStore.data.filter(
      o => o.userId === userId && (o.status === 'WAITING' || o.status === 'HUNTING')
    );
  },

  getUserOrders(userId) {
    return ordersStore.data.filter(o => o.userId === userId);
  },

  getDeadOrders(guildId = null) {
    this.cleanExpiredDeadOrders();
    const config = getConfig();
    const timeoutMs = (config.queueSettings?.rejoinTimeoutMinutes || 60) * 60 * 1000;
    const now = Date.now();

    return ordersStore.data.filter(o => {
      if (o.status !== 'PAUSED_TOKEN_DEAD') return false;
      const pausedTime = new Date(o.pausedAt || o.updatedAt || o.enteredAt).getTime();
      if (now - pausedTime >= timeoutMs) return false;
      if (guildId && o.guildId && o.guildId !== guildId) return false;
      return true;
    });
  },

  getRentalQueue(guildId = null) {
    return ordersStore.data.filter(o => {
      if (!o.isRental && o.orderType !== 'RENTAL') return false;
      if (o.status !== 'WAITING' && o.status !== 'HUNTING') return false;
      if (guildId && o.guildId && o.guildId !== guildId) return false;
      return true;
    });
  },

  updateOrder(orderId, partial) {
    const order = ordersStore.data.find(o => o.id === orderId);
    if (!order) return null;
    Object.assign(order, partial);
    order.updatedAt = new Date().toISOString();
    ordersStore.save();
    return order;
  },

  cancelOrder(orderId, userId) {
    const order = ordersStore.data.find(o => o.id === orderId && o.userId === userId);
    if (!order || (order.status !== 'WAITING' && order.status !== 'HUNTING')) {
      return null;
    }

    const config = getConfig();
    const priorityMult = config.queueSettings?.priorityMultiplier || 3;
    const multiplier = order.isPriority ? priorityMult : 1;
    const refundCredits = order.remainingTurns * multiplier;

    order.status = 'CANCELLED';
    order.updatedAt = new Date().toISOString();
    ordersStore.save();

    if (refundCredits > 0) {
      this.addCredits(userId, refundCredits, order.guildId);
    }

    return { order, refundCredits };
  },

  leaveQueue(userId, guildId = null) {
    const activeOrders = this.getUserActiveOrders(userId).filter(
      o => !guildId || !o.guildId || o.guildId === guildId
    );
    if (!activeOrders.length) return null;

    let totalRefund = 0;
    const cancelledOrders = [];
    const config = getConfig();
    const priorityMult = config.queueSettings?.priorityMultiplier || 3;

    for (const order of activeOrders) {
      const multiplier = order.isPriority ? priorityMult : 1;
      const refund = order.remainingTurns * multiplier;
      order.status = 'CANCELLED';
      order.updatedAt = new Date().toISOString();
      totalRefund += refund;
      cancelledOrders.push(order);
      if (refund > 0) {
        this.addCredits(userId, refund, order.guildId);
      }
    }

    ordersStore.save();
    return { totalRefund, count: cancelledOrders.length, cancelledOrders };
  },

  // === KEY METHODS (CÔ LẬP THEO MÁY CHỦ PHÁT HÀNH KEY) ===
  createKey(codeOrOptions, credits = null, guildId = null, createdBy = null) {
    let code;
    let numCredits = credits;
    let targetGuildId = guildId;
    let creator = createdBy;

    if (typeof codeOrOptions === 'object' && codeOrOptions !== null) {
      code = codeOrOptions.code;
      numCredits = codeOrOptions.credits;
      targetGuildId = codeOrOptions.guildId;
      creator = codeOrOptions.createdBy;
    } else {
      code = codeOrOptions;
    }

    if (!code) {
      code = `KEY-${numCredits}X-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    const upperCode = String(code).trim().toUpperCase();
    const keyData = {
      code: upperCode,
      credits: Number(numCredits),
      guildId: targetGuildId ? String(targetGuildId) : null,
      isUsed: false,
      usedBy: null,
      usedAt: null,
      usedInGuild: null,
      createdBy: creator ? String(creator) : null,
      createdAt: new Date().toISOString()
    };

    keysStore.data[upperCode] = keyData;
    keysStore.save();

    // Đồng bộ vào config riêng của server nếu có guildId
    if (targetGuildId) {
      const gConfig = this.getGuildConfig(targetGuildId);
      gConfig.keys = gConfig.keys || {};
      gConfig.keys[upperCode] = keyData;
      this.setGuildConfig(targetGuildId, { keys: gConfig.keys });
    }

    return keyData;
  },

  generateBatchKeys(count, credits, guildId = null, createdBy = null) {
    const created = [];
    for (let i = 0; i < count; i++) {
      const code = `KEY-${credits}X-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const item = this.createKey({ code, credits, guildId, createdBy });
      created.push(item);
    }
    return created;
  },

  redeemKey(code, userId, guildId = null) {
    const upperCode = String(code).trim().toUpperCase();
    const key = keysStore.data[upperCode];
    if (!key || key.isUsed) {
      return { success: false, error: 'INVALID_OR_USED', message: 'Mã key này không hợp lệ hoặc đã qua sử dụng!' };
    }

    // 🔒 KIỂM TRA MÁY CHỦ SỞ HỮU KEY
    if (key.guildId) {
      if (!guildId) {
        return {
          success: false,
          error: 'GUILD_REQUIRED',
          message: '❌ Mã key này chỉ có hiệu lực tại máy chủ đã phát hành nó, không thể đổi qua tin nhắn riêng!'
        };
      }
      if (String(key.guildId) !== String(guildId)) {
        return {
          success: false,
          error: 'DIFFERENT_GUILD',
          message: '❌ Mã key này thuộc về máy chủ khác! Mỗi key chỉ có thể dùng tại máy chủ phát hành nó.'
        };
      }
    }

    key.isUsed = true;
    key.usedBy = String(userId);
    key.usedInGuild = guildId ? String(guildId) : null;
    key.usedAt = new Date().toISOString();
    keysStore.save();

    // Cập nhật trong file guild nếu có
    const targetGuild = key.guildId || guildId;
    if (targetGuild) {
      const gConfig = this.getGuildConfig(targetGuild);
      gConfig.keys = gConfig.keys || {};
      gConfig.keys[upperCode] = key;
      this.setGuildConfig(targetGuild, { keys: gConfig.keys });
    }

    // Cộng credit trực tiếp vào tài khoản của khách tại MÁY CHỦ ĐÓ
    this.addCredits(userId, key.credits, guildId);
    return { success: true, ...key };
  },

  redeemBatchKeys(keyStrings, userId, guildId = null) {
    let successCredits = 0;
    const successKeys = [];
    const failedKeys = [];
    const differentGuildKeys = [];

    for (const raw of keyStrings) {
      const cleaned = String(raw).trim().toUpperCase();
      if (!cleaned) continue;
      const res = this.redeemKey(cleaned, userId, guildId);
      if (res && res.success) {
        successCredits += res.credits;
        successKeys.push(res);
      } else if (res && res.error === 'DIFFERENT_GUILD') {
        differentGuildKeys.push(cleaned);
      } else {
        failedKeys.push(cleaned);
      }
    }

    return {
      successCredits,
      successCount: successKeys.length,
      failedCount: failedKeys.length,
      differentGuildCount: differentGuildKeys.length,
      successKeys,
      failedKeys,
      differentGuildKeys
    };
  },

  listKeys(guildId = null, unusedOnly = true) {
    let all = Object.values(keysStore.data);
    if (guildId) {
      all = all.filter(k => !k.guildId || String(k.guildId) === String(guildId));
    }
    if (unusedOnly) {
      return all.filter(k => !k.isUsed);
    }
    return all;
  },

  // === DEPOSIT / TOP-UP METHODS ===
  createDeposit({ userId, packId, credits, amount, code, guildId = null }) {
    const config = getConfig();
    const expireMinutes = config.bank?.expireMinutes || 60;
    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();

    const deposit = {
      id: `DEP-${Date.now().toString().slice(-6)}`,
      code,
      userId,
      packId,
      credits: Number(credits),
      amount: Number(amount),
      guildId: guildId || null,
      status: 'PENDING', // PENDING, APPROVED, REJECTED, EXPIRED
      createdAt: new Date().toISOString(),
      expiresAt
    };

    depositsStore.data.push(deposit);
    depositsStore.save();
    return deposit;
  },

  getDepositByCode(code) {
    return depositsStore.data.find(d => d.code === code.trim().toUpperCase());
  },

  getUserPendingDeposits(userId) {
    return depositsStore.data.filter(
      d => d.userId === userId && d.status === 'PENDING' && new Date(d.expiresAt) > new Date()
    );
  },

  approveDeposit(codeOrId, adminId = 'SYSTEM') {
    const dep = depositsStore.data.find(d => d.code === codeOrId || d.id === codeOrId);
    if (!dep || dep.status !== 'PENDING') return null;

    dep.status = 'APPROVED';
    dep.approvedBy = adminId;
    dep.approvedAt = new Date().toISOString();
    depositsStore.save();

    this.addCredits(dep.userId, dep.credits, dep.guildId);
    return dep;
  },

  rejectDeposit(codeOrId) {
    const dep = depositsStore.data.find(d => d.code === codeOrId || d.id === codeOrId);
    if (!dep || dep.status !== 'PENDING') return null;

    dep.status = 'REJECTED';
    dep.rejectedAt = new Date().toISOString();
    depositsStore.save();
    return dep;
  },

  // === STATS & CLAIM LOGGING ===
  checkDailyStatsReset() {
    const today = new Date().toISOString().split('T')[0];
    if (statsStore.data.lastResetDate !== today) {
      statsStore.data.claimsToday = 0;
      statsStore.data.todayValueUsd = 0;
      statsStore.data.todayValueVnd = 0;
      statsStore.data.lastResetDate = today;
      statsStore.save();
    }
  },

  resetStats() {
    const today = new Date().toISOString().split('T')[0];
    statsStore.data = {
      totalClaims: 0,
      claimsToday: 0,
      basicCount: 0,
      boostCount: 0,
      totalValueUsd: 0,
      totalValueVnd: 0,
      todayValueUsd: 0,
      todayValueVnd: 0,
      lastResetDate: today,
      guilds: statsStore.data.guilds || {}
    };
    statsStore.save();
    return { ...statsStore.data };
  },

  resetGuildStats(guildId) {
    if (!guildId) return this.resetStats();
    if (!statsStore.data.guilds) statsStore.data.guilds = {};
    const today = new Date().toISOString().split('T')[0];
    statsStore.data.guilds[guildId] = {
      totalClaims: 0,
      claimsToday: 0,
      basicCount: 0,
      boostCount: 0,
      totalValueUsd: 0,
      totalValueVnd: 0,
      todayValueUsd: 0,
      todayValueVnd: 0,
      lastResetDate: today
    };
    statsStore.save();
    return { ...statsStore.data.guilds[guildId] };
  },

  setCustomStats({ totalClaims = 0, basicCount = 0, boostCount = 0, claimsToday = 0 } = {}) {
    const config = getConfig();
    const basicPriceUsd = config.shop?.basicPriceUsd || 2.99;
    const boostPriceUsd = config.shop?.boostPriceUsd || 9.99;
    const basicPriceVnd = config.shop?.basicPriceVnd || 77740;
    const boostPriceVnd = config.shop?.boostPriceVnd || 259740;

    const totalUsd = Number((basicCount * basicPriceUsd + boostCount * boostPriceUsd).toFixed(2));
    const totalVnd = Math.round(basicCount * basicPriceVnd + boostCount * boostPriceVnd);

    const todayUsd = Number((claimsToday * (basicPriceUsd + boostPriceUsd) / 2).toFixed(2));
    const todayVnd = Math.round(claimsToday * (basicPriceVnd + boostPriceVnd) / 2);

    const today = new Date().toISOString().split('T')[0];
    statsStore.data = {
      ...statsStore.data,
      totalClaims: Number(totalClaims),
      claimsToday: Number(claimsToday),
      basicCount: Number(basicCount),
      boostCount: Number(boostCount),
      totalValueUsd: totalUsd,
      totalValueVnd: totalVnd,
      todayValueUsd: todayUsd,
      todayValueVnd: todayVnd,
      lastResetDate: today
    };
    statsStore.save();
    return { ...statsStore.data };
  },

  setCustomGuildStats(guildId, { totalClaims = 0, basicCount = 0, boostCount = 0, claimsToday = 0 } = {}) {
    if (!guildId) return this.setCustomStats({ totalClaims, basicCount, boostCount, claimsToday });
    const config = getConfig();
    const basicPriceUsd = config.shop?.basicPriceUsd || 2.99;
    const boostPriceUsd = config.shop?.boostPriceUsd || 9.99;
    const basicPriceVnd = config.shop?.basicPriceVnd || 77740;
    const boostPriceVnd = config.shop?.boostPriceVnd || 259740;

    const totalUsd = Number((basicCount * basicPriceUsd + boostCount * boostPriceUsd).toFixed(2));
    const totalVnd = Math.round(basicCount * basicPriceVnd + boostCount * boostPriceVnd);

    const todayUsd = Number((claimsToday * (basicPriceUsd + boostPriceUsd) / 2).toFixed(2));
    const todayVnd = Math.round(claimsToday * (basicPriceVnd + boostPriceVnd) / 2);

    const today = new Date().toISOString().split('T')[0];
    if (!statsStore.data.guilds) statsStore.data.guilds = {};
    statsStore.data.guilds[guildId] = {
      totalClaims: Number(totalClaims),
      claimsToday: Number(claimsToday),
      basicCount: Number(basicCount),
      boostCount: Number(boostCount),
      totalValueUsd: totalUsd,
      totalValueVnd: totalVnd,
      todayValueUsd: todayUsd,
      todayValueVnd: todayVnd,
      lastResetDate: today
    };
    statsStore.save();
    return { ...statsStore.data.guilds[guildId] };
  },

  getStats() {
    this.checkDailyStatsReset();
    return { ...statsStore.data };
  },

  getGuildStats(guildId) {
    this.checkDailyStatsReset();
    if (!guildId) return this.getStats();
    if (!statsStore.data.guilds) statsStore.data.guilds = {};
    if (!statsStore.data.guilds[guildId]) {
      const today = new Date().toISOString().split('T')[0];
      statsStore.data.guilds[guildId] = {
        totalClaims: 0,
        claimsToday: 0,
        basicCount: 0,
        boostCount: 0,
        totalValueUsd: 0,
        totalValueVnd: 0,
        todayValueUsd: 0,
        todayValueVnd: 0,
        lastResetDate: today
      };
      statsStore.save();
    }
    return { ...statsStore.data.guilds[guildId] };
  },

  recordClaim({ orderId, userId, username, nitroType, speedMs, giftCode, deductedTurn, guildId }) {
    this.checkDailyStatsReset();
    const config = getConfig();

    let targetGuildId = guildId;
    if (!targetGuildId && orderId) {
      const ord = this.getOrder(orderId);
      if (ord) targetGuildId = ord.guildId;
    }

    const isBasic = nitroType.toLowerCase().includes('basic');
    const priceUsd = isBasic ? (config.shop.basicPriceUsd || 2.99) : (config.shop.boostPriceUsd || 9.99);
    const priceVnd = isBasic ? (config.shop.basicPriceVnd || 77740) : (config.shop.boostPriceVnd || 259740);

    const claim = {
      id: `CLM-${Date.now().toString().slice(-6)}`,
      orderId,
      userId,
      username,
      nitroType,
      speedMs: Number(speedMs) || 3000,
      giftCode: giftCode || 'discord.gift/mock',
      deductedTurn: Boolean(deductedTurn),
      priceUsd,
      priceVnd,
      guildId: targetGuildId || null,
      claimedAt: new Date().toISOString()
    };

    claimsStore.data.push(claim);
    claimsStore.save();

    // 1. Update global stats
    statsStore.data.totalClaims = (statsStore.data.totalClaims || 0) + 1;
    statsStore.data.claimsToday = (statsStore.data.claimsToday || 0) + 1;
    if (isBasic) {
      statsStore.data.basicCount = (statsStore.data.basicCount || 0) + 1;
    } else {
      statsStore.data.boostCount = (statsStore.data.boostCount || 0) + 1;
    }
    statsStore.data.totalValueUsd = Number(((statsStore.data.totalValueUsd || 0) + priceUsd).toFixed(2));
    statsStore.data.totalValueVnd = Math.round((statsStore.data.totalValueVnd || 0) + priceVnd);
    statsStore.data.todayValueUsd = Number(((statsStore.data.todayValueUsd || 0) + priceUsd).toFixed(2));
    statsStore.data.todayValueVnd = Math.round((statsStore.data.todayValueVnd || 0) + priceVnd);

    // 2. Update server-specific stats (Bảng thống kê tính riêng cho từng server)
    if (targetGuildId) {
      if (!statsStore.data.guilds) statsStore.data.guilds = {};
      if (!statsStore.data.guilds[targetGuildId]) {
        const today = new Date().toISOString().split('T')[0];
        statsStore.data.guilds[targetGuildId] = {
          totalClaims: 0,
          claimsToday: 0,
          basicCount: 0,
          boostCount: 0,
          totalValueUsd: 0,
          totalValueVnd: 0,
          todayValueUsd: 0,
          todayValueVnd: 0,
          lastResetDate: today
        };
      }
      const gStats = statsStore.data.guilds[targetGuildId];
      gStats.totalClaims = (gStats.totalClaims || 0) + 1;
      gStats.claimsToday = (gStats.claimsToday || 0) + 1;
      if (isBasic) {
        gStats.basicCount = (gStats.basicCount || 0) + 1;
      } else {
        gStats.boostCount = (gStats.boostCount || 0) + 1;
      }
      gStats.totalValueUsd = Number(((gStats.totalValueUsd || 0) + priceUsd).toFixed(2));
      gStats.totalValueVnd = Math.round((gStats.totalValueVnd || 0) + priceVnd);
      gStats.todayValueUsd = Number(((gStats.todayValueUsd || 0) + priceUsd).toFixed(2));
      gStats.todayValueVnd = Math.round((gStats.todayValueVnd || 0) + priceVnd);
    }

    // 3. Tăng số mã Nitro đã săn được (totalWon) cho khách hàng
    if (userId) {
      if (usersStore.data[userId]) {
        usersStore.data[userId].totalWon = (usersStore.data[userId].totalWon || 0) + 1;
        usersStore.data[userId].updatedAt = new Date().toISOString();
        usersStore.save();
      }
      if (targetGuildId) {
        const gConfig = this.getGuildConfig(targetGuildId);
        if (gConfig && gConfig.users && gConfig.users[userId]) {
          gConfig.users[userId].totalWon = (gConfig.users[userId].totalWon || 0) + 1;
          gConfig.users[userId].updatedAt = new Date().toISOString();
          this.setGuildConfig(targetGuildId, { users: gConfig.users });
        }
      }
    }

    statsStore.save();

    return claim;
  },

  getRecentClaims(limit = 10) {
    return claimsStore.data.slice(-limit).reverse();
  },

  setBalance(userId, amount, guildId = null) {
    if (guildId) {
      const user = this.getUser(userId, guildId);
      user.balance = Number(amount);
      user.updatedAt = new Date().toISOString();
      const gConfig = this.getGuildConfig(guildId);
      gConfig.users = gConfig.users || {};
      gConfig.users[userId] = user;
      this.setGuildConfig(guildId, { users: gConfig.users });
      return user.balance;
    }
    const user = this.getUser(userId);
    user.balance = Number(amount);
    user.updatedAt = new Date().toISOString();
    usersStore.save();
    return user.balance;
  },

  getUserRank(userId, guildId = null) {
    if (guildId) {
      const gConfig = this.getGuildConfig(guildId);
      const users = Object.values(gConfig.users || {});
      users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
      const index = users.findIndex(u => u.id === userId);
      return index !== -1 ? index + 1 : (users.length || 1);
    }
    const users = Object.values(usersStore.data);
    users.sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const index = users.findIndex(u => u.id === userId);
    return index !== -1 ? index + 1 : users.length;
  },

  // Wholesale supply (Ví sỉ)
  getWholesaleBalance() {
    if (settingsStore.data.wholesaleBalance == null) {
      settingsStore.data.wholesaleBalance = 1000;
      settingsStore.save();
    }
    return settingsStore.data.wholesaleBalance;
  },

  deductWholesaleBalance(amount) {
    const current = this.getWholesaleBalance();
    settingsStore.data.wholesaleBalance = Math.max(0, current - Number(amount));
    settingsStore.save();
    return settingsStore.data.wholesaleBalance;
  },

  addWholesaleBalance(amount) {
    const current = this.getWholesaleBalance();
    settingsStore.data.wholesaleBalance = current + Number(amount);
    settingsStore.save();
    return settingsStore.data.wholesaleBalance;
  },

  // Deposits
  getPendingDeposits() {
    return depositsStore.data.filter(d => d.status === 'PENDING');
  },

  confirmDeposit(code, adminId = 'ADMIN') {
    const upperCode = code.trim().toUpperCase();
    const dep = depositsStore.data.find(d => d.code === upperCode);
    if (!dep) return null;
    if (dep.status === 'APPROVED') return { alreadyApproved: true, deposit: dep };

    // Cho phép duyệt cả đơn đã hết hạn (quá hạn)
    dep.status = 'APPROVED';
    dep.approvedBy = adminId;
    dep.approvedAt = new Date().toISOString();
    depositsStore.save();

    this.addCredits(dep.userId, dep.credits, dep.guildId);
    return { deposit: dep, user: this.getUser(dep.userId, dep.guildId) };
  },

  // Orders admin methods
  deleteOrderWithoutRefund(orderId) {
    const order = ordersStore.data.find(o => o.id === orderId);
    if (!order) return null;
    order.status = 'CANCELLED';
    order.deletedWithoutRefund = true;
    order.updatedAt = new Date().toISOString();
    ordersStore.save();
    return order;
  },

  adjustOrderEntry(orderId, action, amount) {
    const order = ordersStore.data.find(o => o.id === orderId);
    if (!order) return null;
    const num = Number(amount);

    if (action === 'add') {
      // Tăng lượt đã nhận (tương đương giảm còn lại hoặc cộng thêm lượt hoàn thành)
      order.completedTurns = (order.completedTurns || 0) + num;
      order.remainingTurns = Math.max(0, order.remainingTurns - num);
    } else if (action === 'remove') {
      // Giảm lượt đã nhận (trả lại số lượt còn lại)
      order.completedTurns = Math.max(0, (order.completedTurns || 0) - num);
      order.remainingTurns += num;
    }

    if (order.remainingTurns <= 0) {
      order.status = 'COMPLETED';
    } else if (order.status === 'COMPLETED' && order.remainingTurns > 0) {
      order.status = 'WAITING';
    }

    order.updatedAt = new Date().toISOString();
    ordersStore.save();
    return order;
  },

  getAllOrders(statusFilter = null, guildId = null, userId = null) {
    let filtered = ordersStore.data;
    if (guildId) {
      filtered = filtered.filter(o => o.guildId === guildId);
    }
    if (userId) {
      filtered = filtered.filter(o => o.userId === userId);
    }
    if (statusFilter && statusFilter !== 'ALL') {
      filtered = filtered.filter(o => o.status === statusFilter);
    }
    return [...filtered].reverse();
  },

  /**
   * Thống kê toàn diện số lượng đơn và số lượt/credit cần hoàn trong server
   * @param {string|null} guildId 
   * @param {string|null} userId 
   */
  getGuildOrdersSummary(guildId = null, userId = null) {
    const orders = this.getAllOrders('ALL', guildId, userId);
    const config = getConfig();
    const priorityMult = config.queueSettings?.priorityMultiplier || 3;

    let totalOrders = orders.length;
    let waitingCount = 0;
    let huntingCount = 0;
    let completedCount = 0;
    let deadCount = 0;
    let cancelledCount = 0;
    let expiredCount = 0;

    let totalTurnsInitial = 0;
    let totalTurnsCompleted = 0;
    let totalRemainingTurns = 0;
    let totalRefundableCredits = 0;

    const userMap = {};

    for (const o of orders) {
      const initTurns = Number(o.initialTurns || 1);
      const compTurns = Number(o.completedTurns || 0);
      const remTurns = Number(o.remainingTurns || 0);
      const mult = o.isPriority ? priorityMult : 1;
      const refundable = remTurns * mult;

      totalTurnsInitial += initTurns;
      totalTurnsCompleted += compTurns;

      if (o.status === 'WAITING') waitingCount++;
      else if (o.status === 'HUNTING') huntingCount++;
      else if (o.status === 'COMPLETED') completedCount++;
      else if (o.status === 'PAUSED_TOKEN_DEAD') deadCount++;
      else if (o.status === 'CANCELLED') cancelledCount++;
      else if (o.status === 'EXPIRED') expiredCount++;

      // Các đơn chưa hoàn thành hoặc bị lỗi token cần hoàn:
      const isPendingRefund = ['WAITING', 'HUNTING', 'PAUSED_TOKEN_DEAD'].includes(o.status);
      if (isPendingRefund) {
        totalRemainingTurns += remTurns;
        totalRefundableCredits += refundable;
      }

      const uid = o.userId;
      if (!userMap[uid]) {
        userMap[uid] = {
          userId: uid,
          username: o.username || uid,
          totalOrders: 0,
          activeOrders: 0,
          deadOrders: 0,
          completedOrders: 0,
          remainingTurns: 0,
          refundableCredits: 0
        };
      }
      userMap[uid].totalOrders++;
      if (o.status === 'WAITING' || o.status === 'HUNTING') userMap[uid].activeOrders++;
      if (o.status === 'PAUSED_TOKEN_DEAD') userMap[uid].deadOrders++;
      if (o.status === 'COMPLETED') userMap[uid].completedOrders++;

      if (isPendingRefund) {
        userMap[uid].remainingTurns += remTurns;
        userMap[uid].refundableCredits += refundable;
      }
    }

    return {
      totalOrders,
      waitingCount,
      huntingCount,
      activeCount: waitingCount + huntingCount,
      completedCount,
      deadCount,
      cancelledCount,
      expiredCount,
      totalTurnsInitial,
      totalTurnsCompleted,
      totalRemainingTurns,
      totalRefundableCredits,
      userList: Object.values(userMap).sort((a, b) => b.totalOrders - a.totalOrders)
    };
  },

  // Pause / Resume shop
  isShopPaused() {
    return Boolean(settingsStore.data.isShopPaused);
  },

  setShopPaused(paused) {
    settingsStore.data.isShopPaused = Boolean(paused);
    settingsStore.save();
    return settingsStore.data.isShopPaused;
  },

  // Sale system
  getSaleStatus() {
    const sale = settingsStore.data.sale || { active: false };
    if (sale.active && sale.expiresAt && new Date(sale.expiresAt) <= new Date()) {
      sale.active = false;
      settingsStore.save();
    }
    return sale;
  },

  getGuildSaleStatus(guildId = null) {
    if (guildId) {
      const guildCfg = this.getGuildConfig(guildId);
      const sale = guildCfg.sale || { active: false };
      if (sale.active && sale.expiresAt && new Date(sale.expiresAt) <= new Date()) {
        sale.active = false;
        this.setGuildConfig(guildId, { sale });
      }
      if (sale.active) return sale;
    }
    return this.getSaleStatus();
  },

  startSale(discountPercent, durationMinutes) {
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
    const sale = {
      active: true,
      discountPercent: Number(discountPercent),
      durationMinutes: Number(durationMinutes),
      startedAt: new Date().toISOString(),
      expiresAt,
      nextSale: settingsStore.data.sale?.nextSale || null
    };
    settingsStore.data.sale = sale;
    settingsStore.save();
    return sale;
  },

  startGuildSale(guildId, discountPercent, durationMinutes) {
    if (!guildId) return this.startSale(discountPercent, durationMinutes);
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
    const sale = {
      active: true,
      discountPercent: Number(discountPercent),
      durationMinutes: Number(durationMinutes),
      startedAt: new Date().toISOString(),
      expiresAt
    };
    this.setGuildConfig(guildId, { sale });
    return sale;
  },

  extendSale(extraMinutes) {
    const sale = this.getSaleStatus();
    if (!sale.active) return null;
    const currentExp = new Date(sale.expiresAt).getTime();
    sale.expiresAt = new Date(currentExp + extraMinutes * 60 * 1000).toISOString();
    settingsStore.data.sale = sale;
    settingsStore.save();
    return sale;
  },

  extendGuildSale(guildId, extraMinutes) {
    if (!guildId) return this.extendSale(extraMinutes);
    const sale = this.getGuildSaleStatus(guildId);
    if (!sale.active) return null;
    const currentExp = new Date(sale.expiresAt).getTime();
    sale.expiresAt = new Date(currentExp + extraMinutes * 60 * 1000).toISOString();
    this.setGuildConfig(guildId, { sale });
    return sale;
  },

  stopSale() {
    const sale = this.getSaleStatus();
    sale.active = false;
    settingsStore.data.sale = sale;
    settingsStore.save();
    return sale;
  },

  stopGuildSale(guildId = null) {
    if (!guildId) return this.stopSale();
    const sale = { active: false };
    this.setGuildConfig(guildId, { sale });
    return sale;
  },

  scheduleNextSale(startTimeISO, discountPercent, durationMinutes) {
    const sale = settingsStore.data.sale || { active: false };
    sale.nextSale = {
      scheduledAt: startTimeISO,
      discountPercent: Number(discountPercent),
      durationMinutes: Number(durationMinutes)
    };
    settingsStore.data.sale = sale;
    settingsStore.save();
    return sale.nextSale;
  },

  // === LICENSE / ACTIVATION SYSTEM (BẢN QUYỀN MÁY CHỦ) ===
  createLicenseKey({ days = 0, note = '', createdBy = process.env.OWNER_ID || 'Owner' } = {}) {
    const randomPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `LIC-MK-${randomPart1}-${randomPart2}`;

    const license = {
      code,
      days: Number(days), // 0 = Vĩnh viễn (Lifetime)
      note: note || 'Bản quyền bot Nitro Random',
      createdBy: String(createdBy),
      isUsed: false,
      usedByGuild: null,
      usedByGuildName: null,
      usedByUser: null,
      usedAt: null,
      expiresAt: null,
      createdAt: new Date().toISOString()
    };

    licensesStore.data[code] = license;
    licensesStore.save();
    return license;
  },

  generateBatchLicenseKeys({ count = 1, days = 0, note = '', createdBy = process.env.OWNER_ID || 'Owner' } = {}) {
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push(this.createLicenseKey({ days, note, createdBy }));
    }
    return list;
  },

  listLicenses(onlyUnused = false) {
    const all = Object.values(licensesStore.data);
    if (onlyUnused) {
      return all.filter(l => !l.isUsed);
    }
    return all.reverse();
  },

  revokeLicense(codeOrGuildId) {
    // 1. Tìm theo code
    const upper = String(codeOrGuildId).trim().toUpperCase();
    if (licensesStore.data[upper]) {
      const lic = licensesStore.data[upper];
      lic.isUsed = true;
      lic.revoked = true;
      if (lic.usedByGuild) {
        settingsStore.data[`activated_${lic.usedByGuild}`] = { active: false, revoked: true };
        settingsStore.save();
      }
      licensesStore.save();
      return true;
    }

    // 2. Hoặc tìm theo guildId
    const guildActivation = settingsStore.data[`activated_${codeOrGuildId}`];
    if (guildActivation) {
      guildActivation.active = false;
      guildActivation.revoked = true;
      settingsStore.save();
      return true;
    }

    return false;
  },

  activateGuildWithKey(guildId, guildName, userId, inputKey) {
    const code = String(inputKey).trim().toUpperCase();
    const license = licensesStore.data[code];

    if (!license) {
      return {
        success: false,
        message: 'Mã kích hoạt không tồn tại trong hệ thống! Vui lòng liên hệ Owner để nhận mã chính xác.'
      };
    }

    if (license.isUsed) {
      return {
        success: false,
        message: `Mã này đã được kích hoạt trước đó cho máy chủ **${license.usedByGuildName || license.usedByGuild}**!`
      };
    }

    // Tính hạn sử dụng
    let expiresAt = null;
    if (license.days > 0) {
      expiresAt = new Date(Date.now() + license.days * 24 * 60 * 60 * 1000).toISOString();
    }

    license.isUsed = true;
    license.usedByGuild = String(guildId);
    license.usedByGuildName = String(guildName);
    license.usedByUser = String(userId);
    license.usedAt = new Date().toISOString();
    license.expiresAt = expiresAt;
    licensesStore.save();

    const actData = {
      active: true,
      key: code,
      days: license.days,
      expiresAt,
      activatedAt: license.usedAt,
      activatedBy: userId
    };
    settingsStore.data[`activated_${guildId}`] = actData;
    settingsStore.save();

    this.setGuildConfig(guildId, { license: actData });

    return {
      success: true,
      license,
      expiresAt
    };
  },

  isActivated(guildId) {
    return this.isGuildActivated(guildId);
  },

  isGuildActivated(guildId) {
    if (!guildId) return true; // Trong DM không cần check guild activation
    const act = settingsStore.data[`activated_${guildId}`];
    if (!act || act.active === false || act.revoked === true) {
      return false;
    }

    // Kiểm tra hết hạn nếu có ngày expiresAt
    if (act.expiresAt && new Date(act.expiresAt) <= new Date()) {
      act.active = false;
      act.expired = true;
      settingsStore.save();
      return false;
    }

    return true;
  },

  getGuildLicenseInfo(guildId) {
    if (!guildId) return null;
    return settingsStore.data[`activated_${guildId}`] || null;
  },

  getSetting(key) {
    return settingsStore.data[key];
  },

  setSetting(key, val) {
    settingsStore.data[key] = val;
    settingsStore.save();
    return val;
  },

  // Per-server configuration (Mỗi server lưu vào 1 file riêng biệt: data/guilds/${guildId}.json)
  getGuildConfig(guildId) {
    if (!guildId) return {};
    const filePath = path.join(GUILDS_DIR, `${guildId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      } catch (e) {
        console.error(`[DB] Lỗi đọc file config server ${guildId}:`, e);
      }
    }

    // Fallback: migrate từ settingsStore nếu đã lưu trước đó
    const legacy = settingsStore.data[`guild_cfg_${guildId}`] || {};
    const act = settingsStore.data[`activated_${guildId}`];
    const initialConfig = {
      guildId: String(guildId),
      license: act ? { ...act } : null,
      ...legacy
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(initialConfig, null, 2), 'utf-8');
    } catch (e) {}

    return initialConfig;
  },

  setGuildConfig(guildId, data) {
    if (!guildId) return {};
    const existing = this.getGuildConfig(guildId);
    const updated = {
      ...existing,
      ...data,
      guildId: String(guildId),
      updatedAt: new Date().toISOString()
    };

    const filePath = path.join(GUILDS_DIR, `${guildId}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[DB] Lỗi lưu file config server ${guildId}:`, e);
    }

    // Đồng bộ legacy trong settingsStore để tương thích ngược
    settingsStore.data[`guild_cfg_${guildId}`] = updated;
    settingsStore.save();
    return updated;
  },

  getAllGuildConfigs() {
    try {
      const files = fs.readdirSync(GUILDS_DIR).filter(f => f.endsWith('.json'));
      const result = {};
      for (const file of files) {
        try {
          const gId = file.replace('.json', '');
          result[gId] = JSON.parse(fs.readFileSync(path.join(GUILDS_DIR, file), 'utf-8'));
        } catch (e) {}
      }
      return result;
    } catch (err) {
      return {};
    }
  },

  ensureGuildData(guildId, guildName = '', ownerId = '') {
    if (!guildId) return {};
    const filePath = path.join(GUILDS_DIR, `${guildId}.json`);
    let data = {};
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) {
        data = {};
      }
    }

    let modified = false;
    if (!data.guildId) { data.guildId = String(guildId); modified = true; }
    if (guildName && data.name !== guildName) { data.name = guildName; modified = true; }
    if (ownerId && data.ownerId !== ownerId) { data.ownerId = ownerId; modified = true; }
    if (!data.joinedAt) { data.joinedAt = new Date().toISOString(); modified = true; }
    if (!data.users) { data.users = {}; modified = true; }
    if (!data.orders) { data.orders = []; modified = true; }
    if (!data.stats) {
      data.stats = {
        totalClaims: 0,
        claimsToday: 0,
        basicCount: 0,
        boostCount: 0,
        totalValueUsd: 0,
        totalValueVnd: 0
      };
      modified = true;
    }
    if (data.upstreamToken === undefined) { data.upstreamToken = ''; modified = true; }
    if (data.upstreamCredits === undefined) { data.upstreamCredits = 0; modified = true; }
    if (!data.channels) { data.channels = {}; modified = true; }
    if (data.license === undefined) {
      const act = settingsStore.data[`activated_${guildId}`];
      data.license = act ? { ...act } : null;
      modified = true;
    }
    if (!data.createdAt) { data.createdAt = new Date().toISOString(); modified = true; }

    if (modified || !fs.existsSync(filePath)) {
      data.updatedAt = new Date().toISOString();
      try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      } catch (e) {
        console.error(`[DB] Lỗi lưu ensureGuildData cho ${guildId}:`, e);
      }
    }

    return data;
  },

  getGuildUpstreamCredits(guildId) {
    if (!guildId) {
      const { getConfig } = require('./config');
      return getConfig().upstream?.upstreamCredits ?? 0;
    }
    const gConfig = this.getGuildConfig(guildId);
    return gConfig.upstreamCredits ?? 0;
  },

  setGuildUpstreamCredits(guildId, amount) {
    if (!guildId) {
      const { getConfig, saveConfig } = require('./config');
      const cfg = getConfig();
      if (!cfg.upstream) cfg.upstream = {};
      cfg.upstream.upstreamCredits = Number(amount);
      saveConfig(cfg);
      return cfg.upstream.upstreamCredits;
    }
    const gConfig = this.getGuildConfig(guildId);
    gConfig.upstreamCredits = Number(amount);
    this.setGuildConfig(guildId, { upstreamCredits: gConfig.upstreamCredits });
    return gConfig.upstreamCredits;
  },

  deductGuildUpstreamCredits(guildId, amount) {
    const current = this.getGuildUpstreamCredits(guildId);
    const newAmount = Math.max(0, current - Number(amount));
    this.setGuildUpstreamCredits(guildId, newAmount);
    return newAmount;
  }
};

module.exports = db;
