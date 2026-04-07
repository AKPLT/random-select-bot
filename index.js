require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// URLの共通部分
const BASE_URL =
  "https://raw.githubusercontent.com/zkldi/Tachi/refs/heads/main/seeds/collections/";

const GAME_URLS = {
  iidx: BASE_URL + "songs-arcaea.json",
  iidx: BASE_URL + "songs-iidx.json",
  bms: BASE_URL + "songs-bms.json",
  chunithm: BASE_URL + "songs-chunithm.json",
  ddr: BASE_URL + "songs-ddr.json",
  gitadora: BASE_URL + "songs-gitadora.json",
  itg: BASE_URL + "songs-itg.json",
  jubeat: BASE_URL + "songs-jubeat.json",
  maimai: BASE_URL + "songs-maimai.json",
  maimaidx: BASE_URL + "songs-maimaidx.json",
  museca: BASE_URL + "songs-museca.json",
  ongeki: BASE_URL + "songs-ongeki.json",
  pms: BASE_URL + "songs-pms.json",
  popn: BASE_URL + "songs-popn.json",
  sdvx: BASE_URL + "songs-sdvx.json",
  usc: BASE_URL + "songs-usc.json",
  wacca: BASE_URL + "songs-wacca.json",
};

const songsData = {};

// 起動時に全ゲームのデータを一括取得する関数
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
        `[${game}] のデータ取得スキップ（URLが存在しないか通信エラー）`,
      );
      console.error(error.message);
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
  if (
    message.content.startsWith("!random") ||
    message.content.startsWith("!rondom")
  ) {
    const args = message.content.split(" ").slice(1);

    // ヘルプコマンド (!random help または !rondom help)
    if (args.length > 0 && args[0].toLowerCase() === "help") {
      // データの読み込みに成功しているゲーム一覧を動的に生成
      const availableGames = Object.keys(songsData).join(", ");
      return message.channel.send(
        "**【ランダム選曲Botの使い方】**\n" +
          "`!random [ゲーム名]` で、指定したゲームの楽曲をランダムに1曲選んで表示します。\n\n" +
          "**現在対応しているゲーム:**\n" +
          availableGames +
          "\n\n" +
          "**コマンド例:**\n" +
          "・`!random iidx` (IIDXの曲をランダムに選曲)\n" +
          "・`!random maimaidx` (maimaiでらっくすの曲をランダムに選曲)\n" +
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

    // 指定されたゲームのデータが存在するかチェック
    if (!songsData[game] || songsData[game].length === 0) {
      return message.channel.send(
        `「${game}」は未対応か、データの読み込みに失敗しています。`,
      );
    }

    // ランダム抽出処理
    const gameSongs = songsData[game];
    const randomSong = gameSongs[Math.floor(Math.random() * gameSongs.length)];

    const title = randomSong.title || "不明なタイトル";
    const artist = randomSong.artist || "不明なアーティスト";

    return message.channel.send(
      `選曲 [${game.toUpperCase()}]:\n**${title}** / ${artist}`,
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
