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
  bms: BASE_URL + "songs-bms.json",
  chunithm: BASE_URL + "songs-chunithm.json",
  ddr: BASE_URL + "songs-ddr.json",
  gitadora: BASE_URL + "songs-gitadora.json",
  iidx: BASE_URL + "songs-iidx.json", // IIDX songs contain charts data directly
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
  arcaea: BASE_URL + "charts-arcaea.json",
  bms: BASE_URL + "charts-bms.json",
  chunithm: BASE_URL + "charts-chunithm.json",
  ddr: BASE_URL + "charts-ddr.json",
  gitadora: BASE_URL + "charts-gitadora.json",
  iidx: BASE_URL + "charts-iidx.json",
  itg: BASE_URL + "charts-itg.json",
  jubeat: BASE_URL + "charts-jubeat.json",
  maimai: BASE_URL + "charts-maimai.json",
  maimaidx: BASE_URL + "charts-maimaidx.json",
  museca: BASE_URL + "charts-museca.json",
  ongeki: BASE_URL + "charts-ongeki.json",
  pms: BASE_URL + "charts-pms.json",
  popn: BASE_URL + "charts-popn.json",
  sdvx: BASE_URL + "charts-sdvx.json",
  usc: BASE_URL + "charts-usc.json",
  wacca: BASE_URL + "charts-wacca.json",
};

let songsData = {};
let chartsData = {};

const GAMES_WITH_INLINE_CHARTS = new Set([]);
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
        .setDescription("プレイスタイルを選択")
        .addChoices(
          { name: "Single / SP / Touch", value: "SP" },
          { name: "Double / DP", value: "DP" },
        ),
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
  if (song.data?.songPack) return song.data.songPack;
  return song.genre || song.data?.genre || "N/A";
}

function getSongCharts(game, song) {
  if (GAMES_WITH_INLINE_CHARTS.has(game) && Array.isArray(song.charts)) {
    return song.charts;
  }
  const extra = chartsData[game] || [];
  return extra.filter((chart) => chart.songID === song.id);
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
  33: "Sparkle Shower",
  substream: "substream",
  inf: "INFINITAS",
  bmus: "beatmania US",
};

// 各ゲームのバージョン文字列 → 表示名・順序のマッピング（数値バージョンを持たないゲーム用）
const GAME_VERSION_ORDER = {
  sdvx: ["booth", "inf", "gw", "heaven", "vivid", "exceed", "konaste"],
  chunithm: [
    "chunithm",
    "air",
    "star",
    "amazon",
    "crystal",
    "paradise",
    "paradiselost",
    "new",
    "newplus",
    "sun",
    "sunplus",
    "luminous",
    "luminousplus",
    "verse",
    "xverse",
  ],
  maimaidx: [
    "universe",
    "universeplus",
    "festival",
    "festivalplus",
    "buddies",
    "buddiesplus",
    "prism",
    "prismplus",
    "circle",
  ],
  ddr: [
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
    "7th",
    "extreme",
    "supernova",
    "supernova2",
    "x",
    "x2",
    "x3",
    "2013",
    "2014",
    "a",
    "a20",
    "a20plus",
    "a3",
    "world",
  ],
  gitadora: [
    "gitadora",
    "overdrive",
    "triboost",
    "triboostreplus",
    "nexage",
    "nexageplus",
    "ggreats",
    "ggreatsplus",
    "highvoltage",
    "fuzzup",
    "galaxywave",
  ],
  wacca: ["wacca", "waccar", "waccas", "waccarelily", "lily", "lilyr"],
};

const MAIN_IIDX_DIFFICULTIES = new Set([
  "NORMAL",
  "HYPER",
  "ANOTHER",
  "BASIC",
  "BEGINNER",
  "LEGGENDARIA",
]);

function getFirstVersion(game, songCharts) {
  const versionOrder = GAME_VERSION_ORDER[game];
  const allVersions = new Set();

  let minVerNum = Infinity;
  let numericVersion = "";
  let stringVersion = "";

  for (const chart of songCharts) {
    if (!chart.versions || chart.versions.length === 0) continue;
    chart.versions.forEach((v) => {
      const cleanV = String(v).replace(/-(omni|cs|2dxtra|bmus|substream)$/, "");
      allVersions.add(cleanV);
      const numPart = parseInt(cleanV, 10);
      if (!isNaN(numPart) && numPart < minVerNum) {
        minVerNum = numPart;
        numericVersion = cleanV;
      }
    });
  }

  // 数値バージョンを持つゲーム（IIDXなど）
  if (numericVersion) {
    if (game === "iidx") {
      const name =
        IIDX_VERSION_NAMES[minVerNum] ||
        IIDX_VERSION_NAMES[numericVersion] ||
        "Unknown Style";
      return `${numericVersion} ${name}`;
    }
    return numericVersion;
  }

  // バージョン順序テーブルがある場合、最も古いバージョンを特定する
  if (versionOrder) {
    for (const ver of versionOrder) {
      if (allVersions.has(ver)) {
        return ver;
      }
    }
  }

  // substreamなどIIDX固有の文字列バージョン
  if (game === "iidx") {
    for (const ver of allVersions) {
      if (IIDX_VERSION_NAMES[ver]) {
        stringVersion = ver;
        break;
      }
    }
    if (stringVersion) return IIDX_VERSION_NAMES[stringVersion];
  }

  return allVersions.size > 0 ? [...allVersions][0] : "不明";
}

function formatChartEntry(chart) {
  const difficulty = chart.difficulty || chart.name || "Unknown";
  const level = chart.level || chart.levelNum || "?";
  return `**${difficulty}** ${level}`;
}

const DIFFICULTY_ORDER = new Map([
  ["LEGGENDARIA", 0],
  ["ANOTHER", 1],
  ["HYPER", 2],
  ["NORMAL", 3],
  ["BASIC", 4],
  ["BEGINNER", 5],
]);

function formatChartsByPlaytype(game, charts, levelFilter, typeFilter) {
  const filtered = charts.filter((c) => {
    const difficulty = (c.difficulty || c.name || "").toUpperCase();
    // IIDXの場合のみ、主要な難易度以外を除外する（古い譜面などのノイズ除去のため）
    if (game === "iidx" && !MAIN_IIDX_DIFFICULTIES.has(difficulty))
      return false;

    const levelMatch = levelFilter
      ? String(c.level) === levelFilter || String(c.levelNum) === levelFilter
      : true;

    let typeMatch = true;
    if (typeFilter === "SP") {
      typeMatch = ["SP", "Single", "Touch"].includes(c.playtype);
    } else if (typeFilter === "DP") {
      typeMatch = ["DP", "Double"].includes(c.playtype);
    } else if (typeFilter) {
      typeMatch = c.playtype === typeFilter;
    }

    return levelMatch && typeMatch;
  });

  const groups = {};
  for (const chart of filtered) {
    const pt = chart.playtype || "Single";
    if (!groups[pt]) groups[pt] = [];
    groups[pt].push(chart);
  }

  const results = [];
  for (const [pt, entries] of Object.entries(groups)) {
    // ソート順序を適用
    entries.sort((a, b) => {
      const diffA = (a.difficulty || a.name || "").toUpperCase();
      const diffB = (b.difficulty || b.name || "").toUpperCase();
      const orderA = DIFFICULTY_ORDER.has(diffA)
        ? DIFFICULTY_ORDER.get(diffA)
        : Infinity;
      const orderB = DIFFICULTY_ORDER.has(diffB)
        ? DIFFICULTY_ORDER.get(diffB)
        : Infinity;

      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // 同じ難易度順位の場合はレベルでソート
      const levelA = parseInt(a.level || a.levelNum, 10) || 0;
      const levelB = parseInt(b.level || b.levelNum, 10) || 0;
      return levelB - levelA; // 降順
    });
    results.push(`**${pt}:** ${entries.map(formatChartEntry).join(", ")}`);
  }
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

  // 毎日午前3時に楽曲データを自動更新
  cron.schedule("0 3 * * *", async () => {
    if (!isFetching) await fetchAllData();
  });
});

// --- 5. インタラクション処理 ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options } = interaction;

  if (commandName === "update_data") {
    await interaction.deferReply();
    if (isFetching)
      return interaction.editReply(
        "現在データを更新中です。完了後に再度お試しください。",
      );
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
    const playtype = options.getString("playtype");
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

        let typeMatch = true;
        if (playtype === "SP") {
          typeMatch = ["SP", "Single", "Touch"].includes(c.playtype);
        } else if (playtype === "DP") {
          typeMatch = ["DP", "Double"].includes(c.playtype);
        }

        return levelMatch && typeMatch;
      });
    });

    if (filtered.length === 0)
      return interaction.editReply("一致する楽曲が見つかりませんでした。");

    const song = filtered[Math.floor(Math.random() * filtered.length)];
    const songCharts = getSongCharts(game, song);
    const matchedCharts = formatChartsByPlaytype(
      game,
      songCharts,
      level,
      playtype,
    );
    const firstVersion = getFirstVersion(game, songCharts);

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

    const uniqueResults = new Map();
    songs.forEach((s) => {
      const title = (s.title || "").toLowerCase();
      const artist = (s.artist || "").toLowerCase();
      const genre = getSongGenre(s).toLowerCase();
      // Make the regex less strict for general searching, allow partial matches anywhere
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escaped, "i");

      if (
        searchRegex.test(title) ||
        searchRegex.test(artist) ||
        searchRegex.test(genre) ||
        title.includes(query)
      ) {
        uniqueResults.set(s.id, s); // Use song ID to ensure uniqueness
      }
    });
    const results = Array.from(uniqueResults.values());

    if (results.length === 0)
      return interaction.editReply(`「${query}」に一致する楽曲はありません。`);

    // --- パターンA: 1件のみ、またはタイトル完全一致 (詳細表示) ---
    const exactMatch = results.find((s) => s.title.toLowerCase() === query);
    if (results.length === 1 || exactMatch) {
      const target = exactMatch || results[0];
      const songCharts = getSongCharts(game, target);
      const matchedCharts = formatChartsByPlaytype(
        game,
        songCharts,
        null,
        null,
      );
      const firstVersion = getFirstVersion(game, songCharts);

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
    const isTooMany = results.length > 10;
    const maxList = isTooMany ? 10 : results.length;

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
