require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const cron = require("node-cron");

const CACHE_DIR = path.join(__dirname, "cache");
const DATA_DIR = path.join(__dirname, "data");

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

const CHECKER_BASE = "https://iidx-difficulty-table-checker.nomadblacky.dev";

const TIER_NAMES = {
  0: "未定", 1: "地力S+", 2: "個人差S+", 3: "地力S", 4: "個人差S",
  5: "地力A+", 6: "個人差A+", 7: "地力A", 8: "個人差A",
  9: "地力B+", 10: "個人差B+", 11: "地力B", 12: "個人差B",
  13: "地力C", 14: "個人差C", 15: "地力D", 16: "個人差D",
  17: "地力E", 18: "個人差E", 19: "地力F", 20: "個人差F",
  21: "超個人差",
};

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
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("【IIDXのみ】地力表の種類を選択")
        .addChoices(
          { name: "クリア地力表", value: "clear" },
          { name: "ハード地力表", value: "hard" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("rank")
        .setDescription("【IIDXのみ】地力表のランク (例: 地力S, 地力A+)"),
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
async function fetchAndSave(label, urls) {
  console.log(`[${new Date().toLocaleString()}] ${label}の更新を開始します...`);
  let saved = 0;
  for (const [game, url] of Object.entries(urls)) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      fs.writeFileSync(
        path.join(CACHE_DIR, `${label}-${game}.json`),
        JSON.stringify(data),
      );
      console.log(`[${game}] ${data.length} 件の${label}を保存しました`);
      saved++;
    } catch (error) {
      console.error(`[${game}] ${label}の取得に失敗しました:`, error.message);
    }
  }
  return saved;
}

async function fetchIIDXDifficultyTables() {
  console.log(`[${new Date().toLocaleString()}] IIDX地力表データの更新を開始します...`);
  try {
    const indexRes = await fetch(CHECKER_BASE + "/");
    if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status}`);
    const html = await indexRes.text();
    const buildMatch = html.match(/_next\/static\/([a-f0-9]+)\/_buildManifest\.js/);
    if (!buildMatch) throw new Error("Build ID not found");
    const buildId = buildMatch[1];

    const dataRes = await fetch(`${CHECKER_BASE}/_next/data/${buildId}/table/11_hard.json`);
    if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
    const raw = await dataRes.json();
    const tables = raw.pageProps.tables.tables;

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    for (const t of tables) {
      const groups = {};
      for (const song of t.table.data) {
        const tierName = TIER_NAMES[song.tier] ?? `Tier${song.tier}`;
        if (!groups[song.tier]) groups[song.tier] = { title: tierName, songs: [] };
        groups[song.tier].songs.push(song.name.replace(/_/g, " "));
      }
      const result = Object.entries(groups)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, v]) => v);
      fs.writeFileSync(
        path.join(DATA_DIR, `iidx-table-${t.id}.json`),
        JSON.stringify(result, null, 2),
      );
      console.log(`[iidx-table-${t.id}] ${t.table.data.length} 曲を保存しました`);
    }
  } catch (error) {
    console.error("IIDX地力表の取得に失敗しました:", error.message);
  }
}

async function fetchAllData() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);
  isFetching = true;
  try {
    const [songs] = await Promise.all([
      fetchAndSave("songs", GAME_URLS),
      fetchAndSave("charts", CHARTS_URLS),
      fetchIIDXDifficultyTables(),
    ]);
    if (songs > 0) dataLoaded = true;
  } finally {
    isFetching = false;
  }
}

function loadGameData(game) {
  const songsPath = path.join(CACHE_DIR, `songs-${game}.json`);
  const chartsPath = path.join(CACHE_DIR, `charts-${game}.json`);
  const songs = fs.existsSync(songsPath)
    ? JSON.parse(fs.readFileSync(songsPath, "utf8"))
    : null;
  const charts = fs.existsSync(chartsPath)
    ? JSON.parse(fs.readFileSync(chartsPath, "utf8"))
    : [];
  return { songs, charts };
}

function makeYoutubeUrl(title, artist, game) {
  const query = `${game.toUpperCase()} ${title} ${artist || ""}`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function normalizeTitle(title) {
  return (title || "")
    .toLowerCase()
    .replace(/[♥♪♦★☆]/g, "")   // 末尾の装飾記号
    .replace(/feat\.\s*/gi, "feat. ") // feat. 表記を統一
    .replace(/\s+/g, " ")            // 連続スペースを1つに
    .trim();
}

function loadTableFolders(tableType, level) {
  // type: "clear" → "normal", "hard" → "hard"
  const tableId = `${level}_${tableType === "clear" ? "normal" : "hard"}`;
  const filePath = path.join(DATA_DIR, `iidx-table-${tableId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function filterSongsByTableRank(allSongs, tableType, level, rank) {
  const folders = loadTableFolders(tableType, level);
  if (!folders) return { songs: null, error: `地力表データ（☆${level} ${tableType === "clear" ? "クリア" : "ハード"}）が見つかりません。/update_data を実行してください。` };

  const folder = folders.find((f) => f.title === rank);
  if (!folder) {
    const available = folders.map((f) => f.title).join(", ");
    return { songs: null, error: `ランク「${rank}」が見つかりません。利用可能なランク: ${available}` };
  }

  const songTitles = new Set(folder.songs.map(normalizeTitle));
  return {
    songs: allSongs.filter((s) => songTitles.has(normalizeTitle(s.title))),
    error: null,
  };
}

function getSongGenre(song) {
  if (song.data?.songPack) return song.data.songPack;
  return song.genre || song.data?.genre || "N/A";
}

function getSongCharts(song, charts) {
  return charts.filter((chart) => chart.songID === song.id);
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

const DEBUG_GUILD_IDS = [
  "1282326198558396416",
  "1420401813429026988",
];

// --- 3. Discord Bot 起動イベント ---
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    if (DEBUG_GUILD_IDS.length > 0) {
      await Promise.all(
        DEBUG_GUILD_IDS.map((guildId) =>
          rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
            body: commands,
          }),
        ),
      );
      console.log(`コマンドの登録完了 (ギルド: ${DEBUG_GUILD_IDS.join(", ")})`);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands,
      });
      console.log("コマンドの登録完了 (グローバル)");
    }
  } catch (error) {
    console.error(error);
  }

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);
  // キャッシュが存在すればすぐにコマンドを受け付ける
  const cacheReady = Object.keys(GAME_URLS).some((game) =>
    fs.existsSync(path.join(CACHE_DIR, `songs-${game}.json`)),
  );
  if (cacheReady) dataLoaded = true;

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
    const tableType = options.getString("type");
    const rank = options.getString("rank");

    // 地力表オプションはIIDXのみ
    if ((tableType || rank) && game !== "iidx") {
      return interaction.editReply("type / rank オプションはIIDXのみ使用できます。");
    }
    if (rank && (!tableType || !level)) {
      return interaction.editReply("rank を指定する場合は level (11 または 12) と type (clear/hard) も必須です。");
    }
    if (rank && level !== "11" && level !== "12") {
      return interaction.editReply("地力表は level:11 または level:12 のみ対応しています。");
    }

    const { songs: allSongs, charts: allCharts } = loadGameData(game);
    if (!allSongs)
      return interaction.editReply("ゲームデータが見つかりません。");

    let filtered = allSongs;
    let tableLabel = null;

    if (rank) {
      const { songs: tableSongs, error } = filterSongsByTableRank(allSongs, tableType, level, rank);
      if (error) return interaction.editReply(error);
      filtered = tableSongs;
      tableLabel = `☆${level} ${tableType === "clear" ? "クリア" : "ハード"}地力表 | ${rank}`;
    } else {
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
        const charts = getSongCharts(s, allCharts);
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
    }

    if (filtered.length === 0)
      return interaction.editReply("一致する楽曲が見つかりませんでした。");

    const song = filtered[Math.floor(Math.random() * filtered.length)];
    const songCharts = getSongCharts(song, allCharts);
    const matchedCharts = formatChartsByPlaytype(
      game,
      songCharts,
      level,
      playtype,
    );
    const firstVersion = getFirstVersion(game, songCharts);
    const ytUrl = makeYoutubeUrl(song.title, song.artist, game);

    const footerParts = [`全 ${filtered.length} 曲から選出されました`];
    if (tableLabel) footerParts.unshift(tableLabel);

    const resultEmbed = new EmbedBuilder()
      .setTitle(song.title)
      .setURL(ytUrl)
      .setColor(0x5865f2)
      .setAuthor({ name: `${game.toUpperCase()} ランダム選曲結果` })
      .addFields(
        { name: "Artist", value: song.artist || "Unknown", inline: true },
        { name: "Genre", value: getSongGenre(song), inline: true },
        { name: "First Version", value: firstVersion, inline: true },
        { name: "Result Charts", value: matchedCharts },
      )
      .setFooter({ text: footerParts.join(" | ") })
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });
  }

  if (commandName === "search") {
    await interaction.deferReply();

    const game = options.getString("game");
    const query = options.getString("query").toLowerCase();

    if (isFetching || !dataLoaded)
      return interaction.editReply("データ準備中です...");

    const { songs: allSongs, charts: allCharts } = loadGameData(game);
    if (!allSongs)
      return interaction.editReply("ゲームデータが見つかりません。");

    const uniqueResults = new Map();
    allSongs.forEach((s) => {
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
      const songCharts = getSongCharts(target, allCharts);
      const matchedCharts = formatChartsByPlaytype(
        game,
        songCharts,
        null,
        null,
      );
      const firstVersion = getFirstVersion(game, songCharts);

      const ytUrl = makeYoutubeUrl(target.title, target.artist, game);
      const embed = new EmbedBuilder()
        .setTitle(target.title)
        .setURL(ytUrl)
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
        const ytUrl = makeYoutubeUrl(s.title, s.artist, game);
        return `**${i + 1}.** [${s.title}](${ytUrl}) [${genre}] / ${s.artist}`;
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
