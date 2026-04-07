require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Tachiがサポートしている主要なゲーム
const GAME_URLS = {
  iidx: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/iidx.json",
  sdvx: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/sdvx.json",
  popn: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/popn.json",
  chunithm:
    "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/chunithm.json",
  maimai:
    "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/maimai.json",
  ongeki:
    "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/ongeki.json",
  jubeat:
    "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/jubeat.json",
  wacca:
    "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/wacca.json",
  bms: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/bms.json",
  pms: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/pms.json",
  ddr: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/ddr.json",
  museca:
    "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/museca.json",
  gitadora:
    "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/gitadora.json",
  usc: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/usc.json",
  itg: "https://raw.githubusercontent.com/zkldi/Tachi/master/seeds/collections/songs/itg.json",
};

const songsData = {};

// 起動時に全ゲームのデータを一括で取得する関数
async function fetchAllSongs() {
  console.log("楽曲データの取得を開始します...");

  for (const [game, url] of Object.entries(GAME_URLS)) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const data = await response.json();
      songsData[game] = data;
      console.log(`[${game}] のデータを ${data.length} 曲読み込みました。`);
    } catch (error) {
      console.log(
        `[${game}] のデータ取得スキップ（URLが存在しない可能性があります）`,
      );
    }
  }
  console.log("全楽曲データの準備が完了しました！");
}

client.once("ready", async () => {
  console.log(`Botがログインしました: ${client.user.tag}`);
  await fetchAllSongs();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // !random と !rondom の両方に対応
  if (message.content.startsWith("!random")) {
    const args = message.content.split(" ").slice(1);

    // ヘルプコマンド (!random help または !rondom help)
    if (args.length > 0 && args[0].toLowerCase() === "help") {
      const availableGames = Object.keys(songsData).join(", ");
      return message.channel.send(
        "**【ランダム選曲Botの使い方】**\n" +
          "`!random [ゲーム名]` で、指定したゲームの楽曲をランダムに1曲選んで表示します。\n\n" +
          "**対応しているゲーム:**\n" +
          availableGames +
          "\n\n" +
          "**コマンド例:**\n" +
          "・`!random iidx` (IIDXの曲をランダムに選曲)\n" +
          "・`!random sdvx` (SDVXの曲をランダムに選曲)\n" +
          "・`!random help` (このヘルプメッセージを表示)",
      );
    }

    // 引数がない場合はヘルプへ誘導
    if (args.length === 0) {
      return message.channel.send(
        "ゲームを指定してください。使い方は `!random help` で確認できます。",
      );
    }

    const game = args[0].toLowerCase();

    if (!songsData[game] || songsData[game].length === 0) {
      return message.channel.send(
        `「${game}」は未対応か、データの読み込みに失敗しています。`,
      );
    }

    const gameSongs = songsData[game];
    const randomSong = gameSongs[Math.floor(Math.random() * gameSongs.length)];

    const title = randomSong.title || "不明なタイトル";
    const artist = randomSong.artist || "不明なアーティスト";

    return message.channel.send(
      `🎵 今日の選曲 [${game.toUpperCase()}]:\n**${title}** / ${artist}`,
    );
  }
});

// RenderとUptimeRobot用のWebサーバー設定
const app = express();
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(process.env.PORT || 3000, () => {
  console.log("Webサーバーが起動しました");
});

client.login(process.env.DISCORD_TOKEN);
