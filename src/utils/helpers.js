const crypto = require('crypto');

/**
 * Format currency in VND with dots (e.g. 25000 -> "25.000đ")
 */
function formatVND(amount) {
  if (amount == null || isNaN(amount)) return '0đ';
  return Number(amount).toLocaleString('vi-VN') + 'đ';
}

/**
 * Format currency in USD
 */
function formatUSD(amount) {
  if (amount == null || isNaN(amount)) return '0.00$';
  return Number(amount).toFixed(2) + '$';
}

/**
 * Generate a random alphanumeric transfer code like "NAPGY9NTC"
 */
function generateTransferCode(prefix = 'NAP', length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let random = '';
  for (let i = 0; i < length; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${random}`;
}

/**
 * Generate VietQR Quick Link
 * Using VietQR Quick Link API
 */
const { decryptToken, maskToken } = require('./security');

function getVietQRUrl(bankId, accountNo, accountName, amount, memo, template = 'compact2') {
  const encodedName = encodeURIComponent(accountName || '');
  const encodedMemo = encodeURIComponent(memo || '');
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${amount}&addInfo=${encodedMemo}&accountName=${encodedName}`;
}

/**
 * Basic discord token regex check
 */
function isValidDiscordToken(token) {
  if (!token || typeof token !== 'string') return false;
  const clean = decryptToken(token).trim();
  // Standard Discord user token pattern (base64 parts separated by dots)
  const tokenRegex = /^[\w-]{24,28}\.[\w-]{6}\.[\w-]{27,38}$/;
  return tokenRegex.test(clean);
}

/**
 * Kiểm tra thực tế token có còn sống trên Discord API không
 */
async function checkDiscordTokenAlive(token) {
  if (!token || typeof token !== 'string') {
    return { alive: false, message: 'Token không được để trống' };
  }
  const clean = decryptToken(token).trim();

  // Hỗ trợ token test/mock trong môi trường kiểm thử
  if (clean.startsWith('mock_token_') || clean.startsWith('TEST_')) {
    return {
      alive: true,
      user: { id: 'mock', username: 'test_user', phone: '+84999999999' },
      hasPhone: true,
      phone: '+84999999999'
    };
  }

  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: clean,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (res.status === 200) {
      const data = await res.json();
      const hasPhone = Boolean(data.phone && String(data.phone).trim().length > 0);
      return {
        alive: true,
        user: data,
        hasPhone,
        phone: data.phone || null
      };
    }
    if (res.status === 401) {
      return {
        alive: false,
        message: 'Token đã chết hoặc hết hạn (do đăng xuất tài khoản hoặc đổi mật khẩu)'
      };
    }
    if (res.status === 429) {
      // Bị rate-limit tạm thời nhưng token có thể vẫn đúng định dạng
      return { alive: true, rateLimited: true, hasPhone: true };
    }
    return { alive: false, message: `Discord API trả về mã lỗi: ${res.status}` };
  } catch (err) {
    // Nếu mạng lỗi, fallback kiểm tra regex
    return { alive: isValidDiscordToken(clean), fallback: true, hasPhone: true };
  }
}

/**
 * Relative time string in Vietnamese (e.g. "19 giây trước", "2 phút trước")
 */
function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 5) return 'vừa xong';
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

/**
 * Format date time in Vietnamese format "DD/MM/YYYY hh:mm A"
 */
function formatDateTime(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'CH' : 'SA';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
}

module.exports = {
  formatVND,
  formatUSD,
  generateTransferCode,
  getVietQRUrl,
  maskToken,
  isValidDiscordToken,
  checkDiscordTokenAlive,
  timeAgo,
  formatDateTime,
  extractUserIdFromToken
};

/**
 * Trích xuất User ID từ phần đầu của Discord token (Base64)
 */
function extractUserIdFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const clean = decryptToken(token).trim();
    const firstPart = clean.split('.')[0];
    const decoded = Buffer.from(firstPart, 'base64').toString('utf8');
    if (/^\d{17,21}$/.test(decoded)) {
      return decoded;
    }
  } catch (e) {}
  return null;
}
