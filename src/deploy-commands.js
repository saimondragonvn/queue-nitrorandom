require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[CẢNH BÁO] Lệnh tại ${filePath} thiếu thuộc tính "data" hoặc "execute"!`);
  }
}

const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('[LỖI] Thiếu BOT_TOKEN hoặc CLIENT_ID trong file .env!');
  console.error('Vui lòng mở file .env và điền đầy đủ BOT_TOKEN và CLIENT_ID.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    const activeGuilds = [];
    if (process.env.GUILD_ID) activeGuilds.push(process.env.GUILD_ID.trim());
    try {
      const gFiles = fs.readdirSync(path.join(__dirname, '../data/guilds')).filter(f => f.endsWith('.json'));
      for (const gf of gFiles) {
        const gid = gf.replace('.json', '');
        if (/^\d{17,21}$/.test(gid) && !activeGuilds.includes(gid)) {
          activeGuilds.push(gid);
        }
      }
    } catch (e) {}
    for (const gid of activeGuilds) {
      try {
        const guildData = await rest.put(
          Routes.applicationGuildCommands(clientId, gid),
          { body: commands }
        );
        console.log(`[DEPLOY] ✅ Đã đăng ký thành công ${guildData.length} lệnh (/) tức thì cho server ID: ${gid}!`);
      } catch (err) {
        console.warn(`[DEPLOY] Không thể đăng ký lệnh cho server ${gid}:`, err.message);
      }
    }

    // Luôn đăng ký cả Global
    const globalData = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log(`[DEPLOY] ✅ Đã đăng ký thành công ${globalData.length} lệnh (/) TOÀN CẦU (GLOBAL)!`);

    const inviteLink = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8`;
    console.log(`\n===============================================================`);
    console.log(`🔗 LINK MỜI BOT VÀO CÁC SERVER KHÁC (Bấm để thêm bot vào server mới):`);
    console.log(`${inviteLink}`);
    console.log(`===============================================================\n`);
  } catch (error) {
    console.error('[DEPLOY LỖI]:', error);
  }
})();
