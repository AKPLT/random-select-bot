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
      option.setName("level").setDescription("難易度レベルで絞り込み"),
    )
    .addStringOption((option) =>
      option
        .setName("playtype")
        .setDescription("プレイスタイルを選択 (デフォルト: SP)")
        .addChoices({ name: "SP", value: "SP" }, { name: "DP", value: "DP" }),
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

  new SlashCommandBuilder()
    .setName("search")
    .setDescription("楽曲情報を検索します")
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
      option
        .setName("query")
        .setDescription("検索キーワード（タイトル・アーティスト・ジャンル）")
        .setRequired(true),
    ),
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

const IIDX_VERSION_NAMES = {
  1: "1st style",
  2: "2nd style",
  3: "3rd style",
  4: "4th style",
  5: "5th style",
  6: "6th style",
  7: "7th style",
  8: "8th style",
  9: "9th style",
  10: "10th style",
  11: "IIDX RED",
  12: "HAPPY SKY",
  13: "DistorteD",
  14: "GOLD",
  15: "DJ TROOPERS",
  16: "EMPRESS",
  17: "SIRIUS",
  18: "Resort Anthem",
  19: "Lincle",
  20: "tricoro",
  21: "SPADA",
  22: "PENDUAL",
  23: "copula",
  24: "SINOBUZ",
  25: "CANNON BALLERS",
  26: "Rootage",
  27: "HEROIC VERSE",
  28: "BISTROVER",
  29: "CastHour",
  30: "RESIDENT",
  31: "EPOLIS",
  32: "Pinky Crush",
};

const MAIN_IIDX_DIFFICULTIES = new Set([
  "NORMAL",
  "HYPER",
  "ANOTHER",
  "BASIC",
  "BEGINNER",
  "LEGGENDARIA",
]);

function getFirstVersion(songCharts) {
  let minVerNum = Infinity;
  let originalRawVersion = "";
  for (const chart of songCharts) {
    if (chart.versions && chart.versions.length > 0) {
      chart.versions.forEach((v) => {
        const cleanV = v.replace(/-omni$/, "");
        const numPart = parseInt(cleanV.replace(/[^\d]/g, ""), 10);
        if (!isNaN(numPart) && numPart < minVerNum) {
          minVerNum = numPart;
          originalRawVersion = cleanV;
        }
      });
    }
  }
  if (minVerNum === Infinity) return "不明";
  const name = IIDX_VERSION_NAMES[minVerNum] || "Unknown Style";
  return `${originalRawVersion} ${name}`;
}

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

function formatChartsByPlaytype(charts, levelFilter, typeFilter) {
  const filtered = charts.filter((c) => {
    const difficulty = (c.difficulty || c.name || "").toUpperCase();
    if (!MAIN_IIDX_DIFFICULTIES.has(difficulty)) return false;
    const levelMatch = levelFilter
      ? String(c.level) === levelFilter || String(c.levelNum) === levelFilter
      : true;
    const typeMatch = typeFilter ? c.playtype === typeFilter : true;
    return levelMatch && typeMatch;
  });

  const groups = { SP: [], DP: [] };
  for (const chart of filtered) {
    if (chart.playtype === "SP" || chart.playtype === "DP") {
      groups[chart.playtype].push(formatChartEntry(chart));
    }
  }

  const results = [];
  if (groups.SP.length > 0) results.push(`**SP:** ${groups.SP.join(", ")}`);
  if (groups.DP.length > 0) results.push(`**DP:** ${groups.DP.join(", ")}`);
  return results.join("\n") || "条件に合う譜面がありません";
}

// --- 3. Discord Bot 起動イベント ---
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("コマンドの登録完了");
  } catch (error) {
    console.error(error);
  }

  await fetchAllData();
});

// --- 5. インタラクション処理 ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options } = interaction;

  if (commandName === "update_data") {
    await interaction.deferReply();
    await fetchAllData();
    return interaction.editReply("データベースを更新しました！");
  }

  if (commandName === "random") {
    await interaction.deferReply();

    if (isFetching || !dataLoaded) {
      return interaction.editReply(
        "データ準備中です。数秒待ってから再度お試しください。",
      );
    }

    const game = options.getString("game");
    const level = options.getString("level");
    const playtype = options.getString("playtype") || "SP";
    const artist = options.getString("artist")?.toLowerCase();
    const genre = options.getString("genre")?.toLowerCase();

    if (!songsData[game])
      return interaction.editReply("ゲームデータが見つかりません。");

    let filtered = songsData[game] || [];

    if (artist)
      filtered = filtered.filter((s) =>
        s.artist?.toLowerCase().includes(artist),
      );
    if (genre)
      filtered = filtered.filter((s) =>
        getSongGenre(s).toLowerCase().includes(genre),
      );

    // 難易度とプレイタイプのフィルタリング
    filtered = filtered.filter((s) => {
      const charts = getSongCharts(game, s);
      return charts.some((c) => {
        const levelMatch = level
          ? String(c.level) === level || String(c.levelNum) === level
          : true;
        const typeMatch = c.playtype === playtype;
        return levelMatch && typeMatch;
      });
    });

    if (filtered.length === 0)
      return interaction.editReply("一致する楽曲が見つかりませんでした。");

    const song = filtered[Math.floor(Math.random() * filtered.length)];
    const songCharts = getSongCharts(game, song);
    const matchedCharts = formatChartsByPlaytype(songCharts, level, playtype);
    const firstVersion = getFirstVersion(songCharts);

    const resultEmbed = new EmbedBuilder()
      .setTitle(song.title)
      .setColor(0x5865f2)
      .setAuthor({ name: `${game.toUpperCase()} ランダム選曲結果` })
      .addFields(
        { name: "Artist", value: song.artist || "Unknown", inline: true },
        { name: "Genre", value: getSongGenre(song), inline: true },
        { name: "First Version", value: firstVersion, inline: true },
        { name: "Result Charts", value: matchedCharts },
      )
      .setFooter({ text: `全 ${filtered.length} 曲から選出されました` })
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });
  }

  if (commandName === "search") {
    await interaction.deferReply();

    const game = options.getString("game");
    const query = options.getString("query").toLowerCase();

    if (isFetching || !dataLoaded)
      return interaction.editReply("データ準備中です...");

    let songs = songsData[game] || [];

    // 曖昧検索ロジック（単語の境界を意識しつつ検索）
    const results = songs.filter((s) => {
      const title = (s.title || "").toLowerCase();
      const artist = (s.artist || "").toLowerCase();
      const genre = getSongGenre(s).toLowerCase();
      const searchRegex = new RegExp(`\\b${query}\\b`, "i");

      return (
        searchRegex.test(title) ||
        searchRegex.test(artist) ||
        searchRegex.test(genre) ||
        title.includes(query)
      );
    });

    if (results.length === 0)
      return interaction.editReply(`「${query}」に一致する楽曲はありません。`);

    // --- パターンA: 1件のみ、またはタイトル完全一致 (詳細表示) ---
    const exactMatch = results.find((s) => s.title.toLowerCase() === query);
    if (results.length === 1 || exactMatch) {
      const target = exactMatch || results[0];
      const songCharts = getSongCharts(game, target);
      const matchedCharts = formatChartsByPlaytype(songCharts, null, null);
      const firstVersion = getFirstVersion(songCharts);

      const embed = new EmbedBuilder()
        .setTitle(target.title)
        .setColor(0x00ae86)
        .setAuthor({ name: `${game.toUpperCase()} 楽曲詳細` })
        .addFields(
          { name: "Artist", value: target.artist || "Unknown", inline: true },
          { name: "Genre", value: getSongGenre(target), inline: true },
          { name: "First Version", value: firstVersion, inline: true },
          { name: "Charts", value: matchedCharts },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    // --- パターンB: ヒット数が多い場合 (リスト表示) ---
    // 30件以内ならすべて表示、それ以上なら20件に絞る
    const isTooMany = results.length > 30;
    const maxList = isTooMany ? 20 : results.length;

    const listString = results
      .slice(0, maxList)
      .map((s, i) => {
        const genre = getSongGenre(s);
        return `**${i + 1}.** ${s.title} [${genre}] / ${s.artist}`;
      })
      .join("\n");

    const footerText = isTooMany
      ? `上位 ${maxList} 件を表示中。目的の曲があればキーワードを絞ってください。`
      : `計 ${results.length} 件見つかりました。`;

    const embed = new EmbedBuilder()
      .setTitle(`「${query}」の検索結果 (${results.length} 件)`)
      .setColor(0x00ae86)
      .setDescription(listString)
      .setFooter({ text: footerText });

    await interaction.editReply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
