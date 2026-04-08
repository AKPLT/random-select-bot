require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// TachiのデータURL設定
// URLの共通部分
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

let songsData = {};

// 楽曲データを取得・更新する関数
async function fetchAllSongs() {
    console.log(`[${new Date().toLocaleString()}] 楽曲データの更新を開始します...`);
    
    const newData = {};
    for (const [game, url] of Object.entries(GAME_URLS)) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            newData[game] = data;
            console.log(`[${game}] ${data.length} 曲読み込み成功`);
        } catch (error) {
            console.log(`[${game}] データ取得失敗（スキップします）`);
        }
    }
    
    // 取得に成功したデータで上書き
    songsData = newData;
    console.log("全楽曲データの更新が完了しました。");
}

client.once('ready', async () => {
    console.log(`Botログイン: ${client.user.tag}`);
    
    // 初回起動時にデータを取得
    await fetchAllSongs();

    // --- 定期更新の設定 (24時間ごと) ---
    // 24時間 = 24 * 60 * 60 * 1000 ミリ秒
    const updateInterval = 24 * 60 * 60 * 1000;
    setInterval(async () => {
        await fetchAllSongs();
    }, updateInterval);
    
    console.log("24時間ごとの自動更新スケジュールを設定しました。");
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!random')) {
        const args = message.content.split(' ').slice(1);
        
        if (args.length > 0) {
            const subCommand = args[0].toLowerCase();

            // ヘルプ表示
            if (subCommand === 'help') {
                const availableGames = Object.keys(songsData).join(', ');
                return message.channel.send(
                    "**【ランダム選曲Botの使い方】**\n" +
                    "`!random [ゲーム名]` で選曲します。\n\n" +
                    "**対応ゲーム:**\n" + availableGames + "\n\n" +
                    "**コマンド例:**\n" +
                    "・`!random iidx` / `!random sdvx` など\n" +
                    "・`!random update` (手動データ更新)"
                );
            }

            // 手動更新コマンド (!random update)
            if (subCommand === 'update') {
                await message.channel.send("最新の楽曲データを取得しています...");
                await fetchAllSongs();
                return message.channel.send("データの更新が完了しました！");
            }

            // 選曲処理
            if (songsData[subCommand]) {
                const gameSongs = songsData[subCommand];
                const randomSong = gameSongs[Math.floor(Math.random() * gameSongs.length)];
                const title = randomSong.title || "不明なタイトル";
                const artist = randomSong.artist || "不明なアーティスト";
                return message.channel.send(`選曲 [${subCommand.toUpperCase()}]:\n**${title}** / ${artist}`);
            } else {
                return message.channel.send(`「${subCommand}」は未対応です。\`!random help\` を確認してください。`);
            }
        }
        
        // 引数なし
        return message.channel.send("ゲームを指定してください。使い方は `!random help` で確認できます。");
    }
});

client.login(process.env.DISCORD_TOKEN);