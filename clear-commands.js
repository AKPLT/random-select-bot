// Discordのグローバルおよび全ギルドのコマンドをすべてクリアするスクリプト
// 使い方: node clear-commands.js
require("dotenv").config();
const { REST, Routes, Client, GatewayIntentBits } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function getClientId() {
  const app = await rest.get(Routes.oauth2CurrentApplication());
  return app.id;
}

(async () => {
  try {
    const clientId = await getClientId();
    console.log(`Application ID: ${clientId}`);

    // グローバルコマンドをクリア
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log("グローバルコマンドをクリアしました");

    // ボットが参加している全ギルドを取得してクリア
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(TOKEN);
    await new Promise((resolve) => client.once("ready", resolve));

    const guilds = await client.guilds.fetch();
    console.log(`参加ギルド数: ${guilds.size}`);

    for (const [guildId] of guilds) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        console.log(`ギルドコマンドをクリアしました (${guildId})`);
      } catch (err) {
        console.warn(`スキップ (${guildId}): ${err.message}`);
      }
    }

    await client.destroy();
    console.log("完了。ボットを再起動するとコマンドが再登録されます。");
  } catch (err) {
    console.error(err);
  }
})();
