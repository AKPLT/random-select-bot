require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const cron = require("node-cron");

// --- 設定エリア ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const BASE_URL =
  "https://raw.githubusercontent.com/zkldi/Tachi/refs/heads/main/seeds/collections/";

const GAME_URLS = {
  arcaea: BASE_URL + "songs-arcaea.json",
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

const CHARTS_URLS = {
  iidx: BASE_URL + "charts-iidx.json",
};

let songsData = {};
let chartsData = {};
let isFetching = false;
let dataLoaded = false;

// --- 1. スラッシュコマンドの定義 ---
const commands = [
  new SlashCommandBuilder()
    .setName("random")
    .setDescription("楽曲をランダムに選曲します")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("ゲームタイトルを選択")
        .setRequired(true)
        .addChoices(
          ...Object.keys(GAME_URLS).map((k) => ({
            name: k.toUpperCase(),
            value: k,
          })),
        ),
    )
    .addStringOption((option) =>
      option.setName("level").setDescription("難易度レベルで絞り込み (例: 18)"),
    )
    .addStringOption((option) =>
      option
        .setName("artist")
        .setDescription("アーティスト名で検索（部分一致）"),
    )
    .addStringOption((option) =>
      option.setName("genre").setDescription("ジャンルで検索"),
    ),

  new SlashCommandBuilder()
    .setName("update_data")
    .setDescription("楽曲データベースを手動で最新状態に更新します"),
].map((command) => command.toJSON());

// --- 2. 楽曲データ取得関数 ---
async function fetchAllSongs() {
  console.log(
    `[${new Date().toLocaleString()}] 楽曲データの更新を開始します...`,
  );
  const newData = {};

  for (const [game, url] of Object.entries(GAME_URLS)) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      newData[game] = data;
      console.log(`[${game}] ${data.length} 曲の読み込みに成功しました`);
    } catch (error) {
      console.error(`[${game}] データの取得に失敗しました:`, error.message);
    }
  }

  songsData = newData;
  dataLoaded = Object.keys(newData).length > 0;
  console.log("全楽曲データの更新が完了しました。");
}

async function fetchAllCharts() {
  console.log(
    `[${new Date().toLocaleString()}] チャートデータの更新を開始します...`,
  );
  const newCharts = {};

  for (const [game, url] of Object.entries(CHARTS_URLS)) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      newCharts[game] = data;
      console.log(`[${game}] ${data.length} チャートの読み込みに成功しました`);
    } catch (error) {
      console.error(
        `[${game}] チャートデータの取得に失敗しました:`,
        error.message,
      );
    }
  }

  chartsData = newCharts;
  console.log("全チャートデータの更新が完了しました。");
}

async function fetchAllData() {
  isFetching = true;
  try {
    await Promise.all([fetchAllSongs(), fetchAllCharts()]);
  } finally {
    isFetching = false;
  }
}

function getSongGenre(song) {
  return song.genre || song.data?.genre || "N/A";
}

function getSongCharts(game, song) {
  const extra = chartsData[game] || [];
  const matched = extra.filter((chart) => chart.songID === song.id);
  if (matched.length > 0) return matched;
  return Array.isArray(song.charts) ? song.charts : [];
}

const MAIN_IIDX_DIFFICULTIES = new Set([
  "NORMAL",
  "HYPER",
  "ANOTHER",
  "BASIC",
  "BEGINNER",
  "LEGGENDARIA",
]);

function difficultyBadge(difficulty) {
  const key = difficulty?.toUpperCase();
  if (key === "BEGINNER" || key === "BASIC") return "🟢";
  if (key === "NORMAL") return "🔵";
  if (key === "ANOTHER") return "🔴";
  if (key === "HYPER") return "🟡";
  if (key === "LEGGENDARIA") return "🟣";
  return "⚪";
}

function formatChartEntry(chart) {
  const difficulty = chart.difficulty || chart.name || "Unknown";
  const level = chart.level || chart.levelNum || "?";
  return `${difficultyBadge(difficulty)} ${difficulty} ${level}`;
}

function formatChartsByPlaytype(charts, level) {
  const filtered = charts.filter((c) => {
    const difficulty = (c.difficulty || c.name || "").toUpperCase();
    const allowed = MAIN_IIDX_DIFFICULTIES.has(difficulty);
    if (!allowed) return false;
    if (!level) return true;
    return (
      String(c.level) === level ||
      String(c.levelNum) === level ||
      String(c.data?.levelNum) === level
    );
  });

  const groups = { SP: [], DP: [] };
  for (const chart of filtered) {
    const type = chart.playtype;
    if (type === "SP" || type === "DP") {
      groups[type].push(formatChartEntry(chart));
    }
  }

  return ["SP", "DP"]
    .map((type) => `${type}: ${groups[type].join(", ") || "なし"}`)
    .join("\n");
}

// --- 3. Discord Bot 起動イベント ---
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // スラッシュコマンドをDiscordに登録
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("スラッシュコマンドをアプリケーションに登録中...");
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("コマンドの登録が正常に完了しました。");
  } catch (error) {
    console.error("コマンド登録エラー:", error);
  }

  // 初回データ取得
  await fetchAllData();

  // --- 4. 定期更新 (Cron) の設定 ---
  // 毎日 深夜 00:00 に実行
  cron.schedule(
    "0 0 * * *",
    async () => {
      await fetchAllSongs();
    },
    {
      scheduled: true,
      timezone: "Asia/Tokyo",
    },
  );
  console.log("Cronスケジュールを設定しました（毎日 00:00 JST）");
});

// --- 5. インタラクション (コマンド実行) の処理 ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  // 手動更新コマンド
  if (commandName === "update_data") {
    await interaction.deferReply();
    await fetchAllData();
    return interaction.editReply(
      "全楽曲データベースとチャートデータベースを最新の状態に更新しました！",
    );
  }

  // ランダム選曲コマンド
  if (commandName === "random") {
    if (isFetching) {
      await interaction.deferReply({ ephemeral: true });
      return interaction.editReply(
        "現在楽曲データを読み込み中です。数秒待ってから再度お試しください。",
      );
    }

    if (!dataLoaded) {
      await interaction.deferReply({ ephemeral: true });
      return interaction.editReply(
        "楽曲データがまだ読み込まれていません。しばらく待ってから再試行してください。",
      );
    }

    const game = options.getString("game");
    const level = options.getString("level");
    const artist = options.getString("artist")?.toLowerCase();
    const genre = options.getString("genre")?.toLowerCase();

    if (!songsData[game] || songsData[game].length === 0) {
      return interaction.reply({
        content:
          "選択されたゲームのデータが読み込まれていません。管理者に確認してください。",
        ephemeral: true,
      });
    }

    let filtered = songsData[game] || [];

    // フィルタリング処理
    if (artist) {
      filtered = filtered.filter((s) =>
        s.artist?.toLowerCase().includes(artist),
      );
    }
    if (genre) {
      filtered = filtered.filter((s) =>
        getSongGenre(s).toLowerCase().includes(genre),
      );
    }
    if (level) {
      filtered = filtered.filter((s) => {
        const charts = getSongCharts(game, s);
        return charts.some(
          (c) =>
            String(c.level) === level ||
            String(c.levelNum) === level ||
            String(c.data?.levelNum) === level,
        );
      });
    }

    // 結果がない場合
    if (filtered.length === 0) {
      return interaction.reply({
        content:
          "指定された条件に一致する楽曲が見つかりませんでした。条件を変えて試してみてください。",
        ephemeral: true,
      });
    }

    // 抽選
    const song = filtered[Math.floor(Math.random() * filtered.length)];
    const songCharts = getSongCharts(game, song);

    const matchedCharts = formatChartsByPlaytype(songCharts, level);

    // Embedの構築
    const resultEmbed = new EmbedBuilder()
      .setTitle(song.title)
      .setColor(0x5865f2)
      .setAuthor({ name: `${game.toUpperCase()} ランダム選曲結果` })
      .addFields(
        { name: "Artist", value: song.artist || "Unknown", inline: true },
        { name: "Genre", value: getSongGenre(song), inline: true },
        {
          name: "SP / DP",
          value: matchedCharts || "主要難易度のデータがありません",
        },
      )
      .setFooter({ text: `全 ${filtered.length} 曲の候補から選ばれました` })
      .setTimestamp();

    await interaction.reply({ embeds: [resultEmbed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
