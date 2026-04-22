import os from "os";
import { loadConfig } from "./config.js";

// ─────────────────────────────────────────────
// Group Registry — tracks all groups bot is in
// ─────────────────────────────────────────────
export interface GroupInfo {
  threadID: string;
  name: string;
  memberCount: number;
  lastActive: number;
}

const groupRegistry = new Map<string, GroupInfo>();

export function registerGroup(threadID: string, name: string, memberCount = 0): void {
  const existing = groupRegistry.get(threadID);
  groupRegistry.set(threadID, {
    threadID,
    name: name || existing?.name || threadID,
    memberCount: memberCount || existing?.memberCount || 0,
    lastActive: Date.now(),
  });
}

export function touchGroup(threadID: string): boolean {
  const g = groupRegistry.get(threadID);
  if (!g) return false;
  g.lastActive = Date.now();
  return true;
}

export function isGroupKnown(threadID: string): boolean {
  return groupRegistry.has(threadID);
}

export function getGroupList(): GroupInfo[] {
  return Array.from(groupRegistry.values()).sort((a, b) => b.lastActive - a.lastActive);
}

// ─────────────────────────────────────────────
// Member Cache — tracks group members without getThreadInfo
// ─────────────────────────────────────────────
const memberCache = new Map<string, Set<string>>();

export function addGroupMember(threadID: string, userID: string): void {
  if (!memberCache.has(threadID)) memberCache.set(threadID, new Set());
  memberCache.get(threadID)!.add(userID);
}

export function addGroupMembers(threadID: string, userIDs: string[]): void {
  if (!Array.isArray(userIDs) || !userIDs.length) return;
  if (!memberCache.has(threadID)) memberCache.set(threadID, new Set());
  const set = memberCache.get(threadID)!;
  for (const id of userIDs) if (id) set.add(id);
}

export function removeGroupMember(threadID: string, userID: string): void {
  memberCache.get(threadID)?.delete(userID);
}

export function getGroupMembers(threadID: string): Set<string> {
  return memberCache.get(threadID) ?? new Set();
}

function timeAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return "منذ ثوانٍ";
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

// ─────────────────────────────────────────────
// Interval state
// ─────────────────────────────────────────────

// Engine state per thread
const engineIntervals = new Map<string, ReturnType<typeof setInterval>>();
const engineMessages = new Map<string, string>();
const engineIntervalMs = new Map<string, number>();

// Name changer state per thread
const nameIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Nickname changer state per thread
const nicknameIntervals = new Map<string, ReturnType<typeof setInterval>>();

// FIX: Stop all active intervals when bot reconnects (prevents orphaned intervals)
export function clearAllActiveIntervals(): void {
  for (const id of engineIntervals.values()) clearInterval(id);
  for (const id of nameIntervals.values()) clearInterval(id);
  for (const id of nicknameIntervals.values()) clearInterval(id);
  engineIntervals.clear();
  nameIntervals.clear();
  nicknameIntervals.clear();
}

export interface CommandContext {
  api: any;
  event: any;
  args: string[];
  threadID: string;
  senderID: string;
  isAdmin: boolean;
  botName: string;
  botUserID: string;
  groupMembers: Set<string>;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  adminOnly?: boolean;
  groupOnly?: boolean;
  handler: (ctx: CommandContext) => Promise<void>;
}

function reply(api: any, threadID: string, msg: string): void {
  api.sendMessage(msg, threadID, (err: any) => {
    if (err) {
      console.error("[BOT] sendMessage error:", err?.message ?? err);
    }
  });
}

const commands: Command[] = [
  {
    name: "help",
    aliases: ["مساعدة", "اوامر", "h"],
    description: "عرض قائمة الأوامر المتاحة",
    usage: "/help",
    handler: async ({ api, threadID, isAdmin }) => {
      const config = loadConfig();
      const prefix = config.prefix;
      let msg = `╔═══════════════════╗\n`;
      msg += `║  🤖 ${config.botName}  ║\n`;
      msg += `╚═══════════════════╝\n\n`;
      msg += `📋 قائمة الأوامر:\n\n`;

      const publicCmds = commands.filter((c) => !c.adminOnly);
      const adminCmds = commands.filter((c) => c.adminOnly);

      msg += `🔹 الأوامر العامة:\n`;
      for (const cmd of publicCmds) {
        msg += `  ${prefix}${cmd.name} — ${cmd.description}\n`;
      }

      if (isAdmin && adminCmds.length > 0) {
        msg += `\n🔸 أوامر الإدارة:\n`;
        for (const cmd of adminCmds) {
          msg += `  ${prefix}${cmd.name} — ${cmd.description}\n`;
        }
      }

      msg += `\nاستخدم ${prefix}help <اسم_الأمر> لمعرفة تفاصيل أمر معين`;
      reply(api, threadID, msg);
    },
  },
  {
    name: "معلومات",
    aliases: ["info", "about", "حول"],
    description: "معلومات عن البوت",
    usage: "/معلومات",
    handler: async ({ api, threadID }) => {
      const config = loadConfig();
      let msg = `🤖 **${config.botName}**\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📌 البادئة: ${config.prefix}\n`;
      msg += `🌐 اللغة: عربي\n`;
      msg += `⚡ الحالة: يعمل بشكل طبيعي ✅\n`;
      msg += `🔄 إعادة الاتصال: ${config.autoReconnect ? "مفعّل" : "معطّل"}\n`;
      msg += `🛡 مكافحة السبام: ${config.antiSpam ? "مفعّل" : "معطّل"}\n`;
      msg += `📢 رسالة الترحيب: ${config.welcomeMessage ? "مفعّلة" : "معطّلة"}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `اكتب /help لعرض قائمة الأوامر`;
      reply(api, threadID, msg);
    },
  },
  {
    name: "سيرفر",
    aliases: ["server", "status", "حالة"],
    description: "معلومات السيرفر الحالية",
    usage: "/سيرفر",
    handler: async ({ api, threadID }) => {
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      const mem = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      const cpus = os.cpus();
      const cpuModel = cpus[0]?.model ?? "Unknown";
      const cpuCount = cpus.length;

      let msg = `🖥️ **معلومات السيرفر**\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `⏱️ وقت التشغيل: ${hours}س ${minutes}د ${seconds}ث\n`;
      msg += `💾 الذاكرة المستخدمة: ${Math.round(usedMem / 1024 / 1024)} MB / ${Math.round(totalMem / 1024 / 1024)} MB\n`;
      msg += `🧠 ذاكرة البوت: ${Math.round(mem.heapUsed / 1024 / 1024)} MB\n`;
      msg += `⚙️ المعالج: ${cpuModel}\n`;
      msg += `🔢 أنوية المعالج: ${cpuCount}\n`;
      msg += `🖥️ نظام التشغيل: ${os.platform()} ${os.arch()}\n`;
      msg += `📟 إصدار Node.js: ${process.version}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `✅ السيرفر يعمل بشكل طبيعي`;
      reply(api, threadID, msg);
    },
  },
  {
    name: "وقت",
    aliases: ["time", "الوقت"],
    description: "الوقت والتاريخ الحاليين",
    usage: "/وقت",
    handler: async ({ api, threadID }) => {
      const now = new Date();
      const dateStr = now.toLocaleDateString("ar-SA", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const timeStr = now.toLocaleTimeString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      reply(api, threadID, `🕐 الوقت الحالي:\n📅 ${dateStr}\n⏰ ${timeStr}`);
    },
  },
  {
    name: "ping",
    aliases: ["بينج", "اختبار"],
    description: "اختبار استجابة البوت",
    usage: "/ping",
    handler: async ({ api, threadID }) => {
      const start = Date.now();
      api.sendMessage("🏓 جارٍ القياس...", threadID, () => {
        const latency = Date.now() - start;
        api.sendMessage(`🏓 Pong!\n⚡ زمن الاستجابة: ${latency}ms`, threadID);
      });
    },
  },
  {
    name: "اعضاء",
    aliases: ["members", "عدد"],
    description: "عدد أعضاء المجموعة",
    usage: "/اعضاء",
    groupOnly: true,
    handler: async ({ api, event, threadID }) => {
      api.getThreadInfo(threadID, (err: any, data: any) => {
        if (err || !data) {
          reply(api, threadID, "❌ تعذّر الحصول على معلومات المجموعة");
          return;
        }
        const count = data.participantIDs?.length ?? 0;
        const name = data.threadName ?? "مجموعة بدون اسم";
        reply(
          api,
          threadID,
          `👥 **معلومات المجموعة**\n━━━━━━━━━━━━━━━\n📌 الاسم: ${name}\n👤 عدد الأعضاء: ${count}\n🔒 الحالة: ${data.isSubscribed ? "نشطة" : "غير نشطة"}`
        );
      });
    },
  },
  {
    name: "طرد",
    aliases: ["kick", "remove"],
    description: "طرد عضو من المجموعة (للمشرفين فقط)",
    usage: "/طرد @اسم_المستخدم",
    adminOnly: true,
    groupOnly: true,
    handler: async ({ api, event, threadID, args, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }
      const mentions = event.mentions;
      if (!mentions || Object.keys(mentions).length === 0) {
        reply(api, threadID, "❌ يجب الإشارة إلى شخص لطرده. مثال: /طرد @الاسم");
        return;
      }
      const targetID = Object.keys(mentions)[0];
      api.removeUserFromGroup(targetID, threadID, (err: any) => {
        if (err) {
          reply(api, threadID, `❌ تعذّر طرد المستخدم: ${err.message ?? err}`);
        } else {
          reply(api, threadID, `✅ تم طرد العضو بنجاح`);
        }
      });
    },
  },
  {
    name: "اضافة",
    aliases: ["add"],
    description: "إضافة عضو للمجموعة (للمشرفين فقط)",
    usage: "/اضافة <رابط_الحساب أو المعرف>",
    adminOnly: true,
    groupOnly: true,
    handler: async ({ api, event, threadID, args, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }
      const target = args[0];
      if (!target) {
        reply(api, threadID, "❌ أدخل معرّف الشخص الذي تريد إضافته");
        return;
      }
      const targetID = target.replace(/\D/g, "");
      if (!targetID) {
        reply(api, threadID, "❌ معرّف غير صحيح");
        return;
      }
      api.addUserToGroup(targetID, threadID, (err: any) => {
        if (err) {
          reply(api, threadID, `❌ تعذّر إضافة المستخدم: ${err.message ?? err}`);
        } else {
          reply(api, threadID, `✅ تم إضافة العضو بنجاح`);
        }
      });
    },
  },
  {
    name: "تثبيت",
    aliases: ["pin", "announce"],
    description: "تثبيت رسالة في المجموعة",
    usage: "/تثبيت <الرسالة>",
    adminOnly: true,
    groupOnly: true,
    handler: async ({ api, threadID, args, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }
      const text = args.join(" ");
      if (!text) {
        reply(api, threadID, "❌ اكتب الرسالة التي تريد تثبيتها");
        return;
      }
      reply(api, threadID, `📌 **إشعار مثبت**\n━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━`);
    },
  },
  {
    name: "قرعة",
    aliases: ["random", "lucky"],
    description: "اختيار عضو عشوائي من المجموعة",
    usage: "/قرعة",
    groupOnly: true,
    handler: async ({ api, threadID }) => {
      api.getThreadInfo(threadID, (err: any, data: any) => {
        if (err || !data || !data.participantIDs?.length) {
          reply(api, threadID, "❌ تعذّر الحصول على قائمة الأعضاء");
          return;
        }
        const ids: string[] = data.participantIDs;
        const winner = ids[Math.floor(Math.random() * ids.length)];
        const msg = `🎲 **نتيجة القرعة**\n━━━━━━━━━━━━━━━\n🏆 الفائز: @${winner}\n━━━━━━━━━━━━━━━`;
        api.sendMessage({ body: msg, mentions: [{ tag: `@${winner}`, id: winner }] }, threadID);
      });
    },
  },
  {
    name: "زوجني",
    aliases: ["marry", "زواج"],
    description: "يزوّجك البوت بعضو عشوائي من المجموعة",
    usage: ".زوجني",
    groupOnly: true,
    handler: async ({ api, event, threadID, senderID, botUserID, groupMembers }) => {
      // نستخدم الكاش المحلي — لا نحتاج getThreadInfo أبداً
      const others = Array.from(groupMembers).filter(
        (id) => id !== senderID && id !== botUserID
      );

      if (!others.length) {
        reply(api, threadID, "😅 لا يوجد أعضاء آخرون في المجموعة لتزويجك بهم!");
        return;
      }

      const partner = others[Math.floor(Math.random() * others.length)];

      const lovePct = Math.floor(Math.random() * 101);
      const filled  = Math.round(lovePct / 10);
      const bar     = "❤️".repeat(filled) + "🖤".repeat(10 - filled);

      const loveComment =
        lovePct >= 90 ? "💞 توافق مثالي — هذا قدر من الله!" :
        lovePct >= 70 ? "💕 حب كبير — زواج ناجح بإذن الله!" :
        lovePct >= 50 ? "💛 توافق جيد — تكفي المودة والرحمة!" :
        lovePct >= 30 ? "😅 توافق متوسط — الصبر مفتاح الجنة!" :
                        "💔 توافق ضعيف... بس خليها مزاح! 😂";

      const endings = [
        "🌹 بالرفاء والبنين! 🌹",
        "💍 ألف مبروك للعروسَين! 💍",
        "🎊 زواج مبارك وسعيد! 🎊",
        "💐 عسى ربي يجمعكم على خير! 💐",
        "🎀 عقبال ما تفرحون بالأولاد! 🎀",
      ];
      const ending = endings[Math.floor(Math.random() * endings.length)];

      // نجلب اسم الشريك باستخدام getUserInfo مع timeout 4 ثواني
      let partnerName = "صديقي";
      try {
        const info = await new Promise<Record<string, any>>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("timeout")), 4000);
          api.getUserInfo([partner], (err: any, data: any) => {
            clearTimeout(t);
            if (err || !data) reject(err ?? new Error("no data"));
            else resolve(data);
          });
        });
        const p = info[partner];
        if (p?.name) partnerName = p.name;
      } catch {
        // fall back to generic name if getUserInfo times out
      }

      const partnerTag = `@${partnerName}`;
      const body =
        `${partnerTag} 💍\n` +
        `[ عقد الزواج المزاح ]\n` +
        `نسبة الحب : ${lovePct}%\n` +
        `${bar}\n` +
        `${loveComment}\n` +
        `${ending}`;

      api.sendMessage(
        {
          body,
          mentions: [{ tag: partnerTag, id: partner }],
        },
        threadID,
        (e: any) => {
          if (e) console.error("[BOT] زوجني — sendMessage error:", e?.message ?? e);
          else   console.log("[BOT] زوجني — sendMessage OK");
        },
        event.messageID,
        true
      );
    },
  },
  {
    name: "عداد",
    aliases: ["count", "timer"],
    description: "عداد تنازلي",
    usage: "/عداد <العدد>",
    handler: async ({ api, threadID, args }) => {
      const num = parseInt(args[0] ?? "");
      if (isNaN(num) || num < 1 || num > 60) {
        reply(api, threadID, "❌ أدخل رقماً بين 1 و 60");
        return;
      }
      reply(api, threadID, `⏳ بدء العداد: ${num}`);
      let current = num;
      const interval = setInterval(() => {
        current--;
        if (current <= 0) {
          clearInterval(interval);
          reply(api, threadID, "🔔 انتهى العداد! 🎉");
        } else if (current <= 5 || current % 10 === 0) {
          reply(api, threadID, `⏱️ ${current}...`);
        }
      }, 1000);
    },
  },
  {
    name: "ترحيب",
    aliases: ["welcome", "toggle-welcome"],
    description: "تفعيل/تعطيل رسالة الترحيب",
    usage: "/ترحيب",
    adminOnly: true,
    handler: async ({ api, threadID, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }
      const { loadConfig, saveConfig } = await import("./config.js");
      const config = loadConfig();
      const newVal = !config.welcomeMessage;
      saveConfig({ welcomeMessage: newVal });
      reply(api, threadID, `✅ رسالة الترحيب: ${newVal ? "مفعّلة 🟢" : "معطّلة 🔴"}`);
    },
  },
  {
    name: "اعداد",
    aliases: ["config", "settings"],
    description: "عرض الإعدادات الحالية (للمشرفين)",
    usage: "/اعداد",
    adminOnly: true,
    handler: async ({ api, threadID, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }
      const config = loadConfig();
      let msg = `⚙️ **إعدادات البوت**\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📌 البادئة: ${config.prefix}\n`;
      msg += `🤖 اسم البوت: ${config.botName}\n`;
      msg += `🔄 إعادة الاتصال: ${config.autoReconnect ? "مفعّل" : "معطّل"}\n`;
      msg += `⏱️ تأخير إعادة الاتصال: ${config.reconnectDelay / 1000}ث\n`;
      msg += `🔁 محاولات إعادة الاتصال: ${config.maxReconnectAttempts}\n`;
      msg += `🛡 مكافحة السبام: ${config.antiSpam ? "مفعّل" : "معطّل"}\n`;
      msg += `⏳ فترة السبام: ${config.antiSpamCooldown / 1000}ث\n`;
      msg += `📢 الترحيب: ${config.welcomeMessage ? "مفعّل" : "معطّل"}\n`;
      msg += `🔐 القفل: ${config.locked ? "مقفل 🔒" : "مفتوح 🔓"}\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💡 لتغيير الإعدادات راجع ملف bot-config.json`;
      reply(api, threadID, msg);
    },
  },
  {
    name: "قفل",
    aliases: ["lock"],
    description: "قفل/فتح البوت (للمطور فقط) — عند القفل يتجاهل البوت الجميع ماعدا المطور",
    usage: "/قفل تشغيل أو /قفل ايقاف",
    adminOnly: true,
    handler: async ({ api, threadID, args, isAdmin }) => {
      if (!isAdmin) {
        return;
      }
      const { loadConfig, saveConfig } = await import("./config.js");
      const sub = args[0]?.trim() ?? "";
      if (sub === "تشغيل" || sub === "on") {
        saveConfig({ locked: true });
        reply(api, threadID, "🔒 تم قفل البوت.\nالبوت الآن يستجيب فقط لأوامر المطور ويتجاهل جميع الأعضاء.");
      } else if (sub === "ايقاف" || sub === "off") {
        saveConfig({ locked: false });
        reply(api, threadID, "🔓 تم فتح البوت.\nالبوت الآن يستجيب لجميع الأعضاء بشكل طبيعي.");
      } else {
        const config = loadConfig();
        const status = config.locked ? "مقفل 🔒" : "مفتوح 🔓";
        reply(api, threadID, `🔐 حالة القفل: ${status}\n\nاستخدم:\n/قفل تشغيل — لقفل البوت\n/قفل ايقاف — لفتح البوت`);
      }
    },
  },
  {
    name: "محرك",
    aliases: ["engine"],
    description: "محرك إرسال رسائل متكررة — تشغيل/ايقاف/تغيير الرسالة والوقت",
    usage: ".محرك تشغيل | .محرك ايقاف | .محرك رسالة <نص> | .محرك وقت <ثواني>",
    adminOnly: true,
    handler: async ({ api, event, threadID, args, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }

      const sub = args[0]?.trim() ?? "";

      // ── مساعد: استخراج نص الرسالة المحددة (reply) ──
      const repliedText: string | null = event?.messageReply?.body?.trim() || null;

      /**
       * استخراج النص الخام من body الرسالة محافظاً على السطور الجديدة.
       * يحذف أول كلمتين (البادئة+الأمر والأمر الفرعي) ويعيد الباقي كما هو.
       * مثال: ".محرك رسالة سطر1\nسطر2" → "سطر1\nسطر2"
       */
      const rawTextAfterSub = (): string => {
        const body: string = event?.body ?? "";
        const firstSpace = body.indexOf(" ");          // بعد ".محرك"
        if (firstSpace === -1) return "";
        const secondSpace = body.indexOf(" ", firstSpace + 1); // بعد "رسالة"
        if (secondSpace === -1) return "";
        return body.slice(secondSpace + 1); // بدون trimStart لأن بعض الناس يبدأ بسطر جديد
      };

      // ── مساعد: إيقاف المحرك الحالي وتشغيل محرك جديد ──
      const startEngine = (message: string) => {
        // أوقف القديم إن وجد
        const old = engineIntervals.get(threadID);
        if (old) clearInterval(old);

        const intervalMs = engineIntervalMs.get(threadID) ?? 45000;
        const id = setInterval(() => {
          reply(api, threadID, message);
        }, intervalMs);
        engineIntervals.set(threadID, id);
        return intervalMs / 1000;
      };

      if (sub === "تشغيل" || sub === "on") {
        // إذا كانت هناك رسالة محددة (reply) → استخدمها وشغّل المحرك فوراً
        if (repliedText) {
          engineMessages.set(threadID, repliedText);
          const sec = startEngine(repliedText);
          reply(api, threadID, `✅ تم تشغيل المحرك بالرسالة المحددة!\n📨 ${repliedText}\n⏱️ كل ${sec} ثانية`);
          return;
        }

        if (engineIntervals.has(threadID)) {
          reply(api, threadID, "⚠️ المحرك يعمل بالفعل.\nاستخدم .محرك ايقاف لإيقافه أولاً.");
          return;
        }
        const message = engineMessages.get(threadID) ?? "📢 رسالة المحرك الافتراضية";
        const sec = startEngine(message);
        reply(api, threadID, `✅ تم تشغيل المحرك!\n📨 ${message}\n⏱️ كل ${sec} ثانية`);

      } else if (sub === "ايقاف" || sub === "off") {
        const id = engineIntervals.get(threadID);
        if (!id) {
          reply(api, threadID, "⚠️ المحرك غير مشغّل في هذه المجموعة.");
          return;
        }
        clearInterval(id);
        engineIntervals.delete(threadID);
        reply(api, threadID, "🛑 تم إيقاف المحرك بنجاح.");

      } else if (sub === "رسالة") {
        // استخرج النص من body مباشرة للحفاظ على السطور الجديدة
        const typedText = rawTextAfterSub();
        const newMessage = typedText || repliedText || "";

        if (!newMessage) {
          reply(api, threadID, "❌ حدّد رسالة برد عليها أو اكتب النص بعد الأمر.\nمثال: .محرك رسالة مرحباً");
          return;
        }
        engineMessages.set(threadID, newMessage);
        const isRunning = engineIntervals.has(threadID);
        const src = repliedText && !typedText ? " (من الرسالة المحددة)" : "";
        reply(api, threadID, `✅ تم تحديث رسالة المحرك${src}:\n📨 ${newMessage}${isRunning ? "\n\n⚠️ أعد تشغيل المحرك لتطبيق التغيير." : ""}`);

      } else if (sub === "وقت") {
        const seconds = parseInt(args[1] ?? "");
        if (isNaN(seconds) || seconds < 5) {
          reply(api, threadID, "❌ يجب إدخال عدد ثواني صحيح (5 على الأقل).\nمثال: .محرك وقت 60");
          return;
        }
        engineIntervalMs.set(threadID, seconds * 1000);
        const isRunning = engineIntervals.has(threadID);
        reply(api, threadID, `✅ تم تحديث الفاصل الزمني إلى ${seconds} ثانية.${isRunning ? "\n\n⚠️ أعد تشغيل المحرك لتطبيق الوقت الجديد." : ""}`);

      } else {
        // إذا لم يكتب sub وحدّد رسالة → اضبط الرسالة مباشرة
        if (repliedText && !sub) {
          engineMessages.set(threadID, repliedText);
          const isRunning = engineIntervals.has(threadID);
          reply(api, threadID, `✅ تم ضبط رسالة المحرك من الرسالة المحددة:\n📨 ${repliedText}${isRunning ? "\n\n⚠️ أعد تشغيل المحرك لتطبيق التغيير." : ""}`);
          return;
        }

        const isRunning = engineIntervals.has(threadID);
        const currentMessage = engineMessages.get(threadID) ?? "📢 رسالة المحرك الافتراضية";
        const currentMs = engineIntervalMs.get(threadID) ?? 45000;
        let msg = `⚙️ المحرك\n━━━━━━━━━━━━━━━━━\n`;
        msg += `الحالة: ${isRunning ? "يعمل 🟢" : "متوقف 🔴"}\n`;
        msg += `📨 الرسالة: ${currentMessage}\n`;
        msg += `⏱️ الفاصل: ${currentMs / 1000} ثانية\n`;
        msg += `━━━━━━━━━━━━━━━━━\n`;
        msg += `الأوامر:\n`;
        msg += `• .محرك تشغيل — تشغيل (أو رد على رسالة)\n`;
        msg += `• .محرك ايقاف — إيقاف\n`;
        msg += `• .محرك رسالة <نص> — تغيير الرسالة (أو رد)\n`;
        msg += `• .محرك وقت <ثواني> — تغيير الفاصل`;
        reply(api, threadID, msg);
      }
    },
  },
  {
    name: "الاسم",
    aliases: ["name", "rename"],
    description: "تغيير اسم المجموعة باستمرار — تشغيل/ايقاف",
    usage: ".الاسم تشغيل [الاسم] | .الاسم ايقاف",
    adminOnly: true,
    groupOnly: true,
    handler: async ({ api, threadID, args, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }

      const sub = args[0]?.trim() ?? "";

      if (sub === "تشغيل" || sub === "on") {
        const newName = args.slice(1).join(" ").trim();
        if (!newName) {
          reply(api, threadID, "❌ يجب كتابة الاسم المطلوب.\nمثال: .الاسم تشغيل اسم المجموعة");
          return;
        }

        if (nameIntervals.has(threadID)) {
          reply(api, threadID, "⚠️ تغيير الاسم يعمل بالفعل.\nاستخدم .الاسم ايقاف لإيقافه أولاً.");
          return;
        }

        const setName = () => {
          api.gcname(newName, threadID, (err: any) => {
            if (err) {
              console.error("[BOT] gcname error:", err?.message ?? err);
            }
          });
        };

        setName();
        reply(api, threadID, `✅ تم تشغيل تغيير الاسم!\n📛 الاسم: ${newName}`);

        const id = setInterval(setName, 30000);
        nameIntervals.set(threadID, id);

      } else if (sub === "ايقاف" || sub === "off") {
        const id = nameIntervals.get(threadID);
        if (!id) {
          reply(api, threadID, "⚠️ تغيير الاسم غير مشغّل في هذه المجموعة.");
          return;
        }
        clearInterval(id);
        nameIntervals.delete(threadID);
        reply(api, threadID, "🛑 تم إيقاف تغيير الاسم بنجاح.");

      } else {
        const isRunning = nameIntervals.has(threadID);
        let msg = `📛 **أمر الاسم**\n━━━━━━━━━━━━━━━━━\n`;
        msg += `🔴 الحالة: ${isRunning ? "يعمل 🟢" : "متوقف 🔴"}\n`;
        msg += `━━━━━━━━━━━━━━━━━\n`;
        msg += `الأوامر المتاحة:\n`;
        msg += `• .الاسم تشغيل [الاسم] — تشغيل تغيير الاسم\n`;
        msg += `• .الاسم ايقاف — إيقاف تغيير الاسم`;
        reply(api, threadID, msg);
      }
    },
  },
  {
    name: "كنيتك",
    aliases: ["mynick", "botnick"],
    description: "تغيير كنية البوت في المجموعة الحالية",
    usage: ".كنيتك [الكنية الجديدة] — أو بدون نص لحذف الكنية",
    adminOnly: true,
    groupOnly: true,
    handler: async ({ api, threadID, event, args, isAdmin, botName, botUserID }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }

      if (!botUserID) {
        reply(api, threadID, "❌ تعذّر تحديد معرّف البوت.");
        return;
      }

      // استخرج الكنية من body مباشرة للحفاظ على الفراغات
      const body: string = event?.body ?? "";
      const firstSpace = body.indexOf(" ");
      const nickname = firstSpace >= 0 ? body.slice(firstSpace + 1).trim() : "";

      if (!nickname) {
        // حذف الكنية (إعادتها للاسم الافتراضي)
        api.nickname("", threadID, botUserID, (err: any) => {
          if (err) {
            console.error("[BOT] كنيتك — خطأ في حذف الكنية:", err?.message ?? err);
            reply(api, threadID, `❌ فشل حذف الكنية: ${err?.message ?? err}`);
          } else {
            reply(api, threadID, `✅ تم حذف كنية البوت وإعادته لاسمه الافتراضي.`);
          }
        });
        return;
      }

      api.nickname(nickname, threadID, botUserID, (err: any) => {
        if (err) {
          console.error("[BOT] كنيتك — خطأ:", err?.message ?? err);
          reply(api, threadID, `❌ فشل تغيير الكنية: ${err?.message ?? err}`);
        } else {
          reply(api, threadID, `✅ تم تغيير كنية البوت إلى:\n🏷️ ${nickname}`);
        }
      });
    },
  },
  {
    name: "الكنيات",
    aliases: ["nicknames", "nick"],
    description: "تغيير كنيات أعضاء المجموعة باستمرار — تشغيل/ايقاف",
    usage: ".الكنيات تشغيل [الكنية] | .الكنيات ايقاف",
    adminOnly: true,
    groupOnly: true,
    handler: async ({ api, threadID, args, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }

      const sub = args[0]?.trim() ?? "";

      if (sub === "تشغيل" || sub === "on") {
        const nickname = args.slice(1).join(" ").trim();
        if (!nickname) {
          reply(api, threadID, "❌ يجب كتابة الكنية المطلوبة.\nمثال: .الكنيات تشغيل عضو مميز");
          return;
        }

        if (nicknameIntervals.has(threadID)) {
          reply(api, threadID, "⚠️ تغيير الكنيات يعمل بالفعل.\nاستخدم .الكنيات ايقاف لإيقافه أولاً.");
          return;
        }

        const changeNicknames = () => {
          api.getThreadInfo(threadID, (err: any, data: any) => {
            if (err) {
              console.error("[BOT] getThreadInfo error:", err?.message ?? err);
              return;
            }
            const ids = (data?.participantIDs ?? []) as string[];
            if (!ids.length) {
              console.error("[BOT] no participants found in thread", threadID);
              return;
            }
            console.log(`[BOT] Changing nicknames for ${ids.length} members in ${threadID}`);
            ids.forEach((uid, idx) => {
              setTimeout(() => {
                api.nickname(nickname, threadID, uid, (e: any) => {
                  if (e) console.error(`[BOT] nickname error for ${uid}:`, e?.message ?? e);
                });
              }, idx * 800);
            });
          });
        };

        reply(api, threadID, `✅ تم تشغيل تغيير الكنيات!\n🏷️ الكنية: ${nickname}\n⏳ جارٍ تطبيق التغييرات...`);
        changeNicknames();

        const id = setInterval(changeNicknames, 60000);
        nicknameIntervals.set(threadID, id);

      } else if (sub === "ايقاف" || sub === "off") {
        const id = nicknameIntervals.get(threadID);
        if (!id) {
          reply(api, threadID, "⚠️ تغيير الكنيات غير مشغّل في هذه المجموعة.");
          return;
        }
        clearInterval(id);
        nicknameIntervals.delete(threadID);
        reply(api, threadID, "🛑 تم إيقاف تغيير الكنيات بنجاح.");

      } else {
        const isRunning = nicknameIntervals.has(threadID);
        let msg = `🏷️ **أمر الكنيات**\n━━━━━━━━━━━━━━━━━\n`;
        msg += `الحالة: ${isRunning ? "يعمل 🟢" : "متوقف 🔴"}\n`;
        msg += `━━━━━━━━━━━━━━━━━\n`;
        msg += `الأوامر المتاحة:\n`;
        msg += `• .الكنيات تشغيل [الكنية] — تشغيل تغيير الكنيات\n`;
        msg += `• .الكنيات ايقاف — إيقاف تغيير الكنيات`;
        reply(api, threadID, msg);
      }
    },
  },
  // ─────────────────────────────────────────────
  // أمر التحكم — عرض قائمة الغروبات
  // ─────────────────────────────────────────────
  {
    name: "التحكم",
    aliases: ["groups", "غروبات", "control"],
    description: "لوحة التحكم عن بعد — عرض جميع الغروبات وتنفيذ الأوامر فيها",
    usage: ".التحكم",
    adminOnly: true,
    handler: async ({ api, threadID, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }

      const config = loadConfig();
      const groups = getGroupList();

      if (groups.length === 0) {
        let msg = `🎮 لوحة التحكم عن بعد\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `⚠️ لا توجد غروبات مسجّلة حتى الآن.\n`;
        msg += `سيتم تسجيل الغروبات تلقائياً عند أول رسالة يتلقاها البوت من أي غروب.`;
        reply(api, threadID, msg);
        return;
      }

      let msg = `🎮 لوحة التحكم عن بعد\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📋 الغروبات المتاحة (${groups.length}):\n\n`;

      groups.forEach((g, i) => {
        msg += `[${i + 1}] 🏠 ${g.name}\n`;
        msg += `     👥 ${g.memberCount} عضو  •  ⏰ ${timeAgo(g.lastActive)}\n`;
        msg += `     🔑 ${g.threadID}\n\n`;
      });

      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📡 للتحكم عن بعد:\n`;
      msg += `${config.prefix}تحكم [رقم] [الأمر كاملاً]\n\n`;
      msg += `📌 أمثلة:\n`;
      msg += `• ${config.prefix}تحكم 1 ${config.prefix}محرك تشغيل\n`;
      msg += `• ${config.prefix}تحكم 2 ${config.prefix}الاسم تشغيل اسم جديد\n`;
      msg += `• ${config.prefix}تحكم 1 ${config.prefix}اعضاء`;

      reply(api, threadID, msg);
    },
  },

  // ─────────────────────────────────────────────
  // أمر تحكم — تنفيذ أمر في غروب عن بعد
  // ─────────────────────────────────────────────
  {
    name: "تحكم",
    aliases: ["remote", "rc"],
    description: "تنفيذ أمر في غروب عن بعد — تحكم [رقم] [أمر]",
    usage: ".تحكم [رقم_الغروب] [الأمر]",
    adminOnly: true,
    handler: async ({ api, threadID, senderID, args, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }

      const config = loadConfig();
      const groups = getGroupList();

      // No args → show help
      if (!args[0]) {
        let msg = `📡 أمر التحكم عن بعد\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `الاستخدام: ${config.prefix}تحكم [رقم_الغروب] [الأمر]\n\n`;
        msg += `مثال:\n`;
        msg += `• ${config.prefix}تحكم 1 ${config.prefix}محرك تشغيل\n`;
        msg += `• ${config.prefix}تحكم 2 ${config.prefix}اعضاء\n\n`;
        msg += `استخدم ${config.prefix}التحكم لعرض قائمة الغروبات`;
        reply(api, threadID, msg);
        return;
      }

      const groupNum = parseInt(args[0]);
      if (isNaN(groupNum) || groupNum < 1 || groupNum > groups.length) {
        reply(api, threadID, `❌ رقم الغروب غير صحيح.\nالأرقام المتاحة: 1 — ${groups.length}\nاستخدم ${config.prefix}التحكم لعرض القائمة`);
        return;
      }

      const targetGroup = groups[groupNum - 1];
      const fullCommand = args.slice(1).join(" ").trim();

      if (!fullCommand) {
        reply(api, threadID, `❌ يجب إدخال الأمر المطلوب تنفيذه.\nمثال: ${config.prefix}تحكم ${groupNum} ${config.prefix}اعضاء`);
        return;
      }

      if (!fullCommand.startsWith(config.prefix)) {
        reply(api, threadID, `❌ يجب أن يبدأ الأمر بالبادئة: ${config.prefix}\nمثال: ${config.prefix}تحكم ${groupNum} ${config.prefix}اعضاء`);
        return;
      }

      const parts = fullCommand.slice(config.prefix.length).trim().split(/\s+/);
      const cmdName = parts[0]?.toLowerCase() ?? "";
      const cmdArgs = parts.slice(1);

      const command = getCommandByName(cmdName);
      if (!command) {
        reply(api, threadID, `❌ الأمر "${cmdName}" غير معروف.\nاكتب ${config.prefix}help لعرض الأوامر`);
        return;
      }

      // Notify sender first
      reply(api, threadID, `⚡ جاري تنفيذ "${fullCommand}"\n🏠 الغروب: ${targetGroup.name}`);

      // Execute the command in the TARGET group
      try {
        await command.handler({
          api,
          event: {
            threadID: targetGroup.threadID,
            senderID,
            isGroup: true,
            body: fullCommand,
            mentions: {},
          },
          args: cmdArgs,
          threadID: targetGroup.threadID,
          senderID,
          isAdmin: true,
          botName: config.botName,
        });
        reply(api, threadID, `✅ تم تنفيذ الأمر بنجاح في:\n🏠 ${targetGroup.name}`);
      } catch (err: any) {
        reply(api, threadID, `❌ فشل التنفيذ في "${targetGroup.name}":\n${err?.message ?? "خطأ غير معروف"}`);
      }
    },
  },
  {
    name: "رست",
    aliases: ["restart", "reset"],
    description: "إعادة تشغيل البوت بالكامل",
    usage: ".رست",
    adminOnly: true,
    handler: async ({ api, threadID, isAdmin }) => {
      if (!isAdmin) {
        reply(api, threadID, "⛔ هذا الأمر للمشرفين فقط");
        return;
      }

      reply(api, threadID, "🔄 جاري إعادة تشغيل البوت...\nسيعود خلال ثوانٍ ✅");

      // انتظر لتأكد وصول الرسالة ثم أعد التشغيل
      setTimeout(async () => {
        try {
          const bot = (global as any).messengerBot;
          if (bot) {
            bot.stop();
            (global as any).messengerBot = null;
          }

          // انتظر قليلاً قبل إعادة الاتصال
          await new Promise<void>((r) => setTimeout(r, 2000));

          const { MessengerBot } = await import("./bot.js");
          const newBot = new MessengerBot();

          newBot.on("connected", (userID: string) => {
            (global as any).messengerBot = newBot;
            console.log(`[رست] Bot restarted successfully. userID=${userID}`);
          });

          newBot.on("error", (err: Error) => {
            console.error(`[رست] Bot error after restart: ${err.message}`);
          });

          (global as any).messengerBot = newBot;
          newBot.start();
        } catch (err: any) {
          console.error(`[رست] Failed to restart bot: ${err?.message}`);
        }
      }, 1500);
    },
  },
];

export function getCommandByName(name: string): Command | undefined {
  const lower = name.toLowerCase();
  return commands.find(
    (cmd) => cmd.name === lower || (cmd.aliases && cmd.aliases.includes(lower))
  );
}

export function getAllCommands(): Command[] {
  return commands;
}
