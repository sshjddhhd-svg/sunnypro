const fs    = require("fs-extra");
const path  = require("path");
const yts   = require("yt-search");
const ytdl  = require("ytdl-core");

const CACHE_DIR = path.join(__dirname, "cache");

async function searchYouTube(query) {
  const r = await yts(query);
  const v = r?.videos?.[0];
  if (!v || !v.url) throw new Error("لم يتم إيجاد النتيجة");
  return { url: v.url, title: v.title || query, seconds: v.seconds || 0 };
}

function pickAudioFormat(formats) {
  const audioOnly = formats.filter(f => f.hasAudio && !f.hasVideo);
  const mp4a = audioOnly
    .filter(f => String(f.mimeType || "").includes("audio/mp4"))
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  if (mp4a[0]) return mp4a[0];
  const any = audioOnly.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  return any[0] || null;
}

module.exports.config = {
  name: "song",
  aliases: ["sing", "music", "play"],
  version: "2.0.0",
  hasPermssion: 0,
  credits: "ZAO Team",
  description: "تحميل أغنية من يوتيوب وإرسالها كملف صوتي",
  commandCategory: "ميديا",
  usages: "song [اسم الأغنية أو رابط يوتيوب]",
  cooldowns: 15
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const query = args.join(" ").trim();

  if (!query) {
    return api.sendMessage(
      "🎵 أرسل اسم الأغنية أو رابط يوتيوب\nمثال: .song faded alan walker",
      threadID,
      messageID
    );
  }

  api.setMessageReaction("⏳", messageID, () => {}, true);
  await fs.ensureDir(CACHE_DIR);

  const outPath = path.join(CACHE_DIR, `song_${Date.now()}.m4a`);

  try {
    let videoUrl = query;
    let title    = query;
    let seconds  = 0;

    const isYtLink = /youtu(be\.com|\.be)\//i.test(query);
    if (!isYtLink) {
      const result = await searchYouTube(query);
      videoUrl = result.url;
      title    = result.title;
      seconds  = result.seconds || 0;
    }

    if (seconds && seconds > 20 * 60) {
      throw new Error("الأغنية طويلة جداً (أكثر من 20 دقيقة)");
    }

    api.sendMessage(`🔍 جاري تحميل: ${title}`, threadID, messageID);

    const info = await ytdl.getInfo(videoUrl);
    const format = pickAudioFormat(info.formats);
    if (!format) throw new Error("لم يتم العثور على صيغة صوت مناسبة");

    await new Promise((resolve, reject) => {
      let bytes = 0;
      const MAX_BYTES = 25 * 1024 * 1024;
      const stream = ytdl.downloadFromInfo(info, {
        quality: format.itag,
        filter: "audioonly",
        highWaterMark: 1 << 25,
        requestOptions: { headers: { "User-Agent": "Mozilla/5.0" } }
      });
      const file = fs.createWriteStream(outPath);
      const timeout = setTimeout(() => {
        try { stream.destroy(new Error("download timeout")); } catch (_) {}
      }, 180000);

      stream.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          try { stream.destroy(new Error("file too large")); } catch (_) {}
        }
      });
      stream.on("error", (e) => {
        clearTimeout(timeout);
        try { file.close(); } catch (_) {}
        reject(e);
      });
      file.on("error", (e) => {
        clearTimeout(timeout);
        try { stream.destroy(e); } catch (_) {}
        reject(e);
      });
      file.on("finish", () => {
        clearTimeout(timeout);
        resolve();
      });

      stream.pipe(file);
    });

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 10000) {
      throw new Error("الملف الصوتي فارغ أو تالف");
    }

    api.setMessageReaction("✅", messageID, () => {}, true);

    return api.sendMessage(
      {
        body: `🎵 ${title}\n🔗 ${videoUrl}`,
        attachment: fs.createReadStream(outPath)
      },
      threadID,
      () => {
        try { fs.unlinkSync(outPath); } catch (_) {}
      },
      messageID
    );

  } catch (e) {
    api.setMessageReaction("❌", messageID, () => {}, true);
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    const msg = String(e && (e.message || e));
    const friendly = msg.includes("file too large")
      ? "❌ الملف كبير جداً. جرب أغنية أقصر."
      : msg.includes("download timeout")
        ? "❌ التحميل أخذ وقت طويل. جرب مرة أخرى."
        : `❌ خطأ: ${msg}`;
    return api.sendMessage(friendly, threadID, messageID);
  }
};
