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

// GitHub APIが制限に引っかかった時用のバックアップ（主要な基本セット）
const FALLBACK_URLS = {
  iidx: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/iidx.json",
  sdvx: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/sdvx.json",
  popn: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/popn.json",
  chunithm:
    "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/chunithm.json",
  maimai:
    "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/maimai.json",
  ongeki:
    "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/ongeki.json",
  jubeat:
    "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/jubeat.json",
  wacca:
    "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/wacca.json",
  bms: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/bms.json",
  pms: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/pms.json",
  ddr: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/ddr.json",
  museca:
    "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/museca.json",
  gitadora:
    "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/gitadora.json",
  usc: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/usc.json",
  itg: "https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/itg.json",
};

const songsData = {};

// 起動時に全ゲームのデータを取得する関数
async function fetchAllSongs() {
  console.log("GitHubのディレクトリから対応ゲーム一覧を自動取得しています...");
  const apiURL =
    "https://api.github.com/repos/zkldi/Tachi/contents/seeds/collections/songs";
  let targetUrls = {};

  try {
    // フォルダの中身（ファイル一覧）を取得
    const dirResponse = await fetch(apiURL);
    if (dirResponse.ok) {
      const files = await dirResponse.json();
      console.log(
        `${files.length} 件のファイルが見つかりました。自動でURLを構築します。`,
      );

      // 見つかったすべての.jsonファイルをURLリストに追加
      for (const file of files) {
        if (file.name.endsWith(".json")) {
          const game = file.name.replace(".json", ""); // 例: "iidx.json" -> "iidx"
          targetUrls[game] =
            file.download_url ||
            `https://raw.githubusercontent.com/zkldi/Tachi/main/seeds/collections/${file.name}`;
        }
      }
    } else {
      console.log(
        `GitHub API制限 (Status: ${dirResponse.status}) のため、バックアップ用の基本セットを使用します。`,
      );
      targetUrls = FALLBACK_URLS;
    }
  } catch (error) {
    console.log("通信エラーのため、バックアップ用の基本セットを使用します。");
    targetUrls = FALLBACK_URLS;
  }

  // 取得したURL一覧を使って、すべてのゲームの楽曲データをダウンロード
  for (const [game, url] of Object.entries(targetUrls)) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const data = await response.json();
      songsData[game] = data;
      console.log(`[${game}] のデータを ${data.length} 曲読み込みました。`);
    } catch (error) {
      console.log(`[${game}] のデータ取得をスキップしました。`);
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

    // ヘルプコマンド
    if (args.length > 0 && args[0].toLowerCase() === "help") {
      const availableGames = Object.keys(songsData).join(", ");
      return message.channel.send(
        "**【ランダム選曲Botの使い方】**\n" +
          "`!random [ゲーム名]` で、指定したゲームの楽曲をランダムに1曲選んで表示します。\n\n" +
          "**現在対応しているゲーム:**\n" +
          availableGames +
          "\n\n" +
          "**コマンド例:**\n" +
          "・`!random iidx` (IIDXの曲をランダムに選曲)\n" +
          "・`!random sdvx` (SDVXの曲をランダムに選曲)\n" +
          "・`!random help` (このヘルプメッセージを表示)",
      );
    }

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
