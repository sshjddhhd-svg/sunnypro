const fs    = require("fs-extra");
const path  = require("path");
const axios = require("axios");
const yts   = require("yt-search");

const CACHE_DIR        = path.join(__dirname, "cache");
const APIS_URL         = "https://raw.githubusercontent.com/aryannix/stuffs/master/raw/apis.json";
const APIS_TTL_MS      = 30 * 60 * 1000;
const MAX_BYTES        = 25 * 1024 * 1024;
const MAX_DURATION_SEC = 20 * 60;
const REQUEST_TIMEOUT  = 60_000;
const DOWNLOAD_TIMEOUT = 180_000;
const BROWSER_UA       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let _apisCache = { data: null, ts: 0 };

async function getApiBase() {
  const now = Date.now();
  if (_apisCache.data && (now - _apisCache.ts) < APIS_TTL_MS) return _apisCache.data;
  const r = await axios.get(APIS_URL, { timeout: 15_000, headers: { "User-Agent": BROWSER_UA } });
  const base = r.data && r.data.api;
  if (!base || typeof base !== "string") throw new Error("API base غير متاح");
  _apisCache = { data: base, ts: now };
  return base;
}

function extractVideoId(url) {
  const m = String(url).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function searchYouTube(query) {
  const r = await yts(query);
  const v = r && r.videos && r.videos[0];
  if (!v || !v.url) throw new Error("لم يتم إيجاد النتيجة");
  return { url: v.url, title: v.title || query, seconds: v.seconds || 0 };
}

async function fetchDownloadInfo(videoUrl) {
  const base = await getApiBase();
  const r = await axios.get(`${base}/ytdl`, {
    params: { url: videoUrl, type: "audio" },
    timeout: REQUEST_TIMEOUT,
    headers: { "User-Agent": BROWSER_UA }
  });
  if (!r.data || !r.data.status || !r.data.downloadUrl) throw new Error("API لم يُرجع رابط تحميل");
  return { downloadUrl: r.data.downloadUrl, title: r.data.title || null };
}

async function streamToFile(downloadUrl, outPath) {
  const res = await axios.get(downloadUrl, {
    responseType: "stream",
    timeout: DOWNLOAD_TIMEOUT,
    maxRedirects: 5,
    headers: { "User-Agent": BROWSER_UA }
  });

  const len = parseInt(res.headers["content-length"] || "0", 10);
  if (len && len > MAX_BYTES) {
    res.data.destroy();
    throw new Error("file too large");
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outPath);
    let total = 0;
    let aborted = false;

    const timer = setTimeout(() => {
      aborted = true;
      try { res.data.destroy(); } catch (_) {}
      try { out.destroy(new Error("download timeout")); } catch (_) {}
    }, DOWNLOAD_TIMEOUT);

    res.data.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        aborted = true;
        try { res.data.destroy(); } catch (_) {}
        try { out.destroy(new Error("file too large")); } catch (_) {}
      }
    });

    res.data.on("error", (e) => {
      clearTimeout(timer);
      try { out.destroy(e); } catch (_) {}
      reject(e);
    });

    out.on("finish", () => {
      clearTimeout(timer);
      if (aborted) return reject(new Error("aborted"));
      resolve();
    });
    out.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    res.data.pipe(out);
  });
}

module.exports.config = {
  name: "song",
  aliases: ["sing", "music", "play"],
  version: "6.0.0",
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

  const outPath = path.join(CACHE_DIR, `song_${Date.now()}.mp3`);

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
    } else {
      const id = extractVideoId(videoUrl);
      if (id) videoUrl = `https://www.youtube.com/watch?v=${id}`;
    }

    if (seconds && seconds > MAX_DURATION_SEC) {
      throw new Error("الأغنية طويلة جداً (أكثر من 20 دقيقة)");
    }

    api.sendMessage(`🔍 جاري تحميل: ${title}`, threadID, messageID);

    const info = await fetchDownloadInfo(videoUrl);
    if (info.title) title = info.title;

    await streamToFile(info.downloadUrl, outPath);

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
      /sign[- ]?in|login required|age|confirm your age|محظور بالعمر/i.test(msg) ? "❌ هذا الفيديو يتطلب تسجيل دخول أو محظور بالعمر." :
      /unavailable|private|removed|This video is not available/i.test(msg) ? "❌ الفيديو غير متاح." :
      /API لم يُرجع|API base|API Error|status code 5\d\d|status code 4\d\d/i.test(msg) ? "❌ خدمة التحميل غير متاحة حالياً. جرب مرة أخرى بعد قليل." :
      `❌ خطأ: ${msg}`;
    return api.sendMessage(friendly, threadID, messageID);
  }
};
