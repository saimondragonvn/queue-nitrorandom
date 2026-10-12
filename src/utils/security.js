const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
// Khóa mã hóa bảo mật từ môi trường hoặc fallback key nội bộ
const SECRET_SALT = process.env.TOKEN_SECRET || 'NICHO_RANDOM_SECURE_VAULT_KEY_2026';
const SECRET_KEY = crypto.createHash('sha256').update(SECRET_SALT).digest();
const IV_LENGTH = 16;

/**
 * Mã hóa token của khách hàng bằng chuẩn bảo mật quân sự AES-256-CBC
 * @param {string} token 
 * @returns {string} Token đã được mã hóa
 */
function encryptToken(token) {
  if (!token || typeof token !== 'string') return '';
  if (token.startsWith('enc:')) return token; // Đã được mã hóa trước đó

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
    let encrypted = cipher.update(token.trim(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `enc:${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[SECURITY] Lỗi mã hóa token:', err.message);
    return token;
  }
}

/**
 * Giải mã token của khách hàng (chỉ dùng nội bộ khi gửi yêu cầu sang shop gốc)
 * @param {string} encryptedToken 
 * @returns {string} Token gốc
 */
function decryptToken(encryptedToken) {
  if (!encryptedToken || typeof encryptedToken !== 'string') return '';
  if (!encryptedToken.startsWith('enc:')) return encryptedToken; // Token dạng thô cũ

  try {
    const parts = encryptedToken.split(':');
    if (parts.length !== 3) return encryptedToken;

    const iv = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[SECURITY] Lỗi giải mã token:', err.message);
    return encryptedToken;
  }
}

/**
 * Che dấu token của khách hàng để hiển thị an toàn trên giao diện và log
 * Tuyệt đối không để lộ token thô ra ngoài!
 * Ví dụ: "••••••••••••88A2"
 * @param {string} token 
 * @returns {string}
 */
function maskToken(token) {
  if (!token || typeof token !== 'string') return '••••••••';
  const plain = decryptToken(token).trim();
  if (plain.length <= 4) return '••••' + plain;
  return '••••••••••••' + plain.slice(-4);
}

module.exports = {
  encryptToken,
  decryptToken,
  maskToken
};
