const fs   = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const yts  = require("yt-search");

const CACHE_DIR = path.join(__dirname, "cache");
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_SEC = 20 * 60;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const YTDLP = process.env.YTDLP_BIN || "yt-dlp";

function extractVideoId(url) {
  const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function searchYouTube(query) {
  const r = await yts(query);
  const v = r?.videos?.[0];
  if (!v || !v.url) throw new Error("لم يتم إيجاد النتيجة");
  return { url: v.url, title: v.title || query, seconds: v.seconds || 0 };
}

function runYtDlp(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch (_) {}
    }, opts.timeout || DOWNLOAD_TIMEOUT_MS);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) return reject(new Error("download timeout"));
      if (code !== 0) return reject(new Error(stderr.trim().split("\n").pop() || `yt-dlp exited ${code}`));
      resolve({ stdout, stderr });
    });
  });
}

async function getMetadata(videoUrl) {
  const { stdout } = await runYtDlp([
    "-J",
    "--no-warnings",
    "--no-playlist",
    "--skip-download",
    videoUrl
  ], { timeout: 30_000 });
  return JSON.parse(stdout);
}

async function downloadAudio(videoUrl, outPath) {
  await runYtDlp([
    "-f", "bestaudio[ext=m4a]/bestaudio/best",
    "--no-playlist",
    "--no-warnings",
    "--no-part",
    "--no-mtime",
    "--max-filesize", String(MAX_BYTES),
    "--retries", "3",
    "--fragment-retries", "3",
    "--socket-timeout", "30",
    "-o", outPath,
    videoUrl
  ]);
}

module.exports.config = {
  name: "song",
  aliases: ["sing", "music", "play"],
  version: "5.0.0",
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

    const videoId = extractVideoId(videoUrl);
    if (!videoId) throw new Error("لم يتم التعرف على رابط يوتيوب");
    videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    if (seconds && seconds > MAX_DURATION_SEC) {
      throw new Error("الأغنية طويلة جداً (أكثر من 20 دقيقة)");
    }

    // Verify duration / availability before downloading
    try {
      const meta = await getMetadata(videoUrl);
      if (meta?.title)    title   = meta.title;
      if (meta?.duration) seconds = Math.round(meta.duration);
      if (seconds > MAX_DURATION_SEC) throw new Error("الأغنية طويلة جداً (أكثر من 20 دقيقة)");
    } catch (e) {
      if (/طويلة/.test(e.message)) throw e;
      // ignore other metadata errors and try the download anyway
    }

    api.sendMessage(`🔍 جاري تحميل: ${title}`, threadID, messageID);

    await downloadAudio(videoUrl, outPath);

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 10_000) {
      throw new Error("الملف الصوتي فارغ أو تالف");
    }
    if (fs.statSync(outPath).size > MAX_BYTES) {
      throw new Error("file too large");
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
    const friendly =
      msg.includes("file too large")    ? "❌ الملف كبير جداً. جرب أغنية أقصر." :
      msg.includes("download timeout")  ? "❌ التحميل أخذ وقت طويل. جرب مرة أخرى." :
      /sign[- ]?in|login required|age|confirm your age/i.test(msg) ? "❌ هذا الفيديو يتطلب تسجيل دخول أو محظور بالعمر." :
      /unavailable|private|removed|متاح|This video is not available/i.test(msg) ? "❌ الفيديو غير متاح." :
      /HTTP Error 4\d\d|HTTP Error 5\d\d/i.test(msg) ? "❌ يوتيوب رفض الطلب — جرب مرة أخرى بعد قليل." :
      `❌ خطأ: ${msg}`;
    return api.sendMessage(friendly, threadID, messageID);
  }
};
