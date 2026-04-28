/**
 * cp.js — أمر التحكم (Bot Control Panel)
 * @debugger Djamel — Fixed handleEvent crash: senderID.toString() on undefined
 *   for log:* events. Added type guard and optional-chain safety on ADMINBOT.
 */
const { getLock, setLock, clearLock, getLocks } = require("../../includes/nameLocks");
const NickLocks = require("../../includes/nicknameLocks");

module.exports.config = {
  name: "التحكم",
  version: "1.2.0",
  hasPermssion: 2,
  credits: "Saint",
  description: "إدارة الغروبات وطلبات المراسلة",
  commandCategory: "إدارة البوت",
  usages: "",
  cooldowns: 5
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

module.exports.onLoad = () => {
  global.chatsSession = global.chatsSession || {};
  global.motorData = global.motorData || {};
  global.motorData2 = global.motorData2 || {};
  global.lastActivity = global.lastActivity || {};
};

function fmtMotorTime(d) {
  if (!d) return "—";
  if (d.randomTime && d.randomRange) {
    return `🎲 ${(d.randomRange.min || 12000) / 1000}s-${(d.randomRange.max || 50000) / 1000}s`;
  }
  return d.time ? d.time / 1000 + "s" : "—";
}

function buildGroupMenu(selected, tid, statusMsg) {
  const m1 = global.motorData[tid];
  const m2 = global.motorData2[tid];
  const lockedName = getLock(tid);
  const nickLock   = NickLocks.getLock(tid);
  return (
    (statusMsg ? statusMsg + "\n\n" : "")
    + `👥 ${selected.name}\n🆔 ${tid}\n`
    + (lockedName ? `🔒 اسم مقفول: "${lockedName}"\n` : "")
    + (nickLock   ? `🔒 كنية مقفولة (${nickLock.scope === "bot" ? "بوت" : "الجميع"}): "${nickLock.nickname}"\n` : "")
    + `━━━━━━━━━━━━━━━\n`
    + `📍 المحرك العادي: ${m1?.status ? "🟢 شغّال" : "⚫ متوقف"}\n`
    + `   📝 "${m1?.message || "لم تُضبط"}" · ⏱ ${fmtMotorTime(m1)}\n\n`
    + `📍 المحرك الذكي: ${m2?.status ? "🟢 شغّال" : "⚫ متوقف"}\n`
    + `   📝 "${m2?.message || "لم تُضبط"}" · ⏱ ${fmtMotorTime(m2)}\n`
    + `━━━━━━━━━━━━━━━\n`
    + "1 - تفعيل المحرك العادي\n"
    + "2 - إيقاف المحرك العادي\n"
    + "3 - ضبط رسالة المحرك العادي\n"
    + "4 - ضبط وقت المحرك العادي (s/m أو r للعشوائي)\n"
    + "5 - تفعيل المحرك الذكي\n"
    + "6 - إيقاف المحرك الذكي\n"
    + "7 - ضبط رسالة المحرك الذكي\n"
    + "8 - ضبط وقت المحرك الذكي (s/m أو r للعشوائي)\n"
    + "9 - إرسال رسالة للغروب\n"
    + "10 - إخراج البوت من الغروب\n"
    + `11 - ${lockedName ? "تغيير/إيقاف قفل اسم الغروب 🔒" : "قفل اسم الغروب 🔒"}\n`
    + `12 - ${nickLock?.scope === "bot" ? "تغيير/إيقاف قفل كنية البوت 🔒" : "قفل كنية البوت 🔒"}\n`
    + "13 - تغيير لقب عضو (بالرد/منشن) — مرة واحدة\n"
    + `14 - ${nickLock?.scope === "all" ? "تغيير/إيقاف قفل كنية الجميع 🔒" : "قفل كنية الجميع 🔒"}\n`
    + "━━━━━━━━━━━━━━━\n↩️ رد بالرقم (أو اكتب اغلاق للخروج)"
  );
}

function sendGroupMenu(api, threadID, senderID, selected, tid, statusMsg) {
  const msg = buildGroupMenu(selected, tid, statusMsg);
  api.sendMessage(msg, threadID, (err, info) => {
    if (!err) global.chatsSession[senderID] = { step: "group_action", selected, botMessageID: info.messageID };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startMotor(api, threadID) {
  const data = global.motorData[threadID];
  if (!data || !data.message || !data.time) return;
  try { clearInterval(data.interval); } catch (_) {}
  try { clearTimeout(data.interval); } catch (_) {}
  data.interval = null;
  data.status = true;
  try {
    const { scheduleMotorLoop } = require("../../includes/motorSafeSend");
    scheduleMotorLoop({
      api,
      threadID,
      getData: () => global.motorData[threadID],
      onDisable: () => {
        if (typeof global._saveMotorState === "function") {
          try { global._saveMotorState(); } catch (_) {}
        }
      }
    });
  } catch (_) {}
}

function startMotor2(api, threadID) {
  const data = global.motorData2[threadID];
  if (!data || !data.message || !data.time) return;
  try { clearInterval(data.interval); } catch (_) {}
  try { clearTimeout(data.interval); } catch (_) {}
  data.interval = null;
  data.status = true;
  data.shouldSend = function () {
    const lastActive = global.lastActivity[threadID];
    if (!lastActive) return false;
    return (Date.now() - lastActive) < (Number(data.time) || 0) * 2;
  };
  try {
    const { scheduleMotorLoop } = require("../../includes/motorSafeSend");
    scheduleMotorLoop({
      api,
      threadID,
      getData: () => global.motorData2[threadID],
      onDisable: () => {}
    });
  } catch (_) {}
}

function stopMotor(threadID) {
  const data = global.motorData[threadID];
  if (data?.interval) {
    try { clearInterval(data.interval); } catch (_) {}
    try { clearTimeout(data.interval); } catch (_) {}
    data.interval = null;
  }
  if (data) data.status = false;
}

function stopMotor2(threadID) {
  const data = global.motorData2[threadID];
  if (data?.interval) {
    try { clearInterval(data.interval); } catch (_) {}
    try { clearTimeout(data.interval); } catch (_) {}
    data.interval = null;
  }
  if (data) data.status = false;
}

async function getThreadList(api, tags) {
  try {
    const result = await api.getThreadList(60, null, tags);
    return Array.isArray(result) ? result : (result?.data || []);
  } catch (e) { return []; }
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}س`;
  return `${Math.floor(h / 24)}ي`;
}

function parseTime(input) {
  let ms = 0;
  if (input.endsWith("s")) ms = parseFloat(input) * 1000;
  else if (input.endsWith("m")) ms = parseFloat(input) * 60 * 1000;
  return ms;
}

// ─── handleEvent ──────────────────────────────────────────────────────────────

module.exports.handleEvent = async function ({ api, event }) {
  // [FIX Djamel] — senderID can be undefined for log:* events (group joins/leaves/etc.)
  // Always guard BEFORE calling .toString() to prevent the "[ERR] Cannot read properties of undefined" crash
  const { senderID, threadID, messageReply, body, isGroup, type } = event;

  // Only handle actual messages — ignore log:thread-name, log:subscribe, etc.
  if (type !== "message" && type !== "message_reply") return;
  if (!senderID || !threadID) return;

  // تسجيل النشاط
  if (isGroup && String(senderID) !== String(global.config?.BOTID || global.botUserID || "")) {
    global.lastActivity[threadID] = Date.now();
  }

  if (!global.config?.ADMINBOT?.includes(String(senderID))) return;
  if (!messageReply) return;
  if (!body || !body.trim()) return;

  const session = global.chatsSession[senderID];
  if (!session) return;
  if (messageReply.messageID !== session.botMessageID) return;

  const input = body.trim();
  const { step } = session;

  if (input === "اغلاق") {
    delete global.chatsSession[senderID];
    return api.sendMessage("✅ تم إغلاق التحكم.", threadID);
  }

  // ─── القائمة الرئيسية ──────────────────────────────────────────────────────
  if (step === "main") {

    if (input === "1") {
      api.sendMessage("⏳ جاري جلب طلبات المراسلة...", threadID);
      const pending = await getThreadList(api, ["PENDING"]);
      const other = await getThreadList(api, ["OTHER"]);
      const requests = [...pending, ...other].filter(r => r?.threadID);

      if (!requests.length)
        return api.sendMessage("📭 لا توجد طلبات مراسلة.", threadID);

      let msg = `📬 طلبات المراسلة (${requests.length})\n━━━━━━━━━━━━━━━\n`;
      const list = [];

      requests.slice(0, 20).forEach((r, i) => {
        const name = r.name || r.threadName || ("ID: " + r.threadID);
        const type = r.isGroup ? "👥" : "👤";
        msg += `${i + 1}. ${type} ${name}\n🆔 ${r.threadID}\n\n`;
        list.push({ threadID: r.threadID, name, isGroup: !!r.isGroup });
      });

      msg += "━━━━━━━━━━━━━━━\n↩️ رد برقم الطلب\n0 - قبول الكل";

      api.sendMessage(msg, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "request_list", list, botMessageID: info.messageID };
      });
    }

    else if (input === "2") {
      api.sendMessage("⏳ جاري جلب الغروبات...", threadID);
      const inbox = await getThreadList(api, ["INBOX"]);
      const groups = inbox.filter(t => t?.isGroup && t?.threadID);

      if (!groups.length)
        return api.sendMessage("📭 البوت ليس في أي غروب.", threadID);

      groups.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));

      let msg = `👥 الغروبات (${groups.length})\n━━━━━━━━━━━━━━━\n`;
      const list = [];

      groups.slice(0, 25).forEach((g, i) => {
        const name = (g.name || g.threadName || ("ID: " + g.threadID)).slice(0, 25);
        const m1 = global.motorData[g.threadID]?.status ? "🟢" : "⚫";
        const m2 = global.motorData2[g.threadID]?.status ? "🟢" : "⚫";
        const members = g.participantIDs?.length || "?";
        const last = timeAgo(g.timestamp);
        msg += `${i + 1}. ${name}\n👥${members} 🕐${last} M1:${m1} M2:${m2}\n🆔 ${g.threadID}\n\n`;
        list.push({ threadID: g.threadID, name });
      });

      msg += "━━━━━━━━━━━━━━━\nM1=محرك M2=محرك ذكي\n↩️ رد برقم الغروب";

      api.sendMessage(msg, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_list", list, botMessageID: info.messageID };
      });
    }

    else {
      api.sendMessage("⚠️ اختار 1 أو 2 فقط.", threadID);
    }
  }

  // ─── قائمة الطلبات ────────────────────────────────────────────────────────
  else if (step === "request_list") {
    const { list } = session;

    if (input === "0") {
      api.sendMessage(`⏳ جاري قبول ${list.length} طلب...`, threadID);
      let success = 0, failed = 0;
      for (const req of list) {
        try {
          await api.sendMessage("مرحباً 👋", req.threadID);
          success++;
          await new Promise(r => setTimeout(r, 500));
        } catch (_) { failed++; }
      }
      return api.sendMessage(`✅ تم قبول ${success} طلب${failed > 0 ? ` · فشل ${failed}` : ""}`, threadID);
    }

    const idx = parseInt(input) - 1;
    if (isNaN(idx) || idx < 0 || idx >= list.length)
      return api.sendMessage("❌ رقم غير صحيح.", threadID);

    const selected = list[idx];
    const msg =
      `📨 ${selected.name}\n🆔 ${selected.threadID}\n━━━━━━━━━━━━━━━\n`
      + "1 - قبول الطلب\n"
      + "2 - رفض وحذف الطلب\n"
      + "3 - إرسال رسالة ثم قبول\n"
      + "━━━━━━━━━━━━━━━\n↩️ رد بالرقم";

    api.sendMessage(msg, threadID, (err, info) => {
      if (!err) global.chatsSession[senderID] = { step: "request_action", selected, botMessageID: info.messageID };
    });
  }

  // ─── إجراء الطلب ─────────────────────────────────────────────────────────
  else if (step === "request_action") {
    const { selected } = session;

    if (input === "1") {
      try {
        await api.sendMessage("مرحباً! 👋", selected.threadID);
        api.sendMessage(`✅ تم قبول طلب "${selected.name}"`, threadID);
      } catch (e) {
        api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID);
      }

    } else if (input === "2") {
      try {
        await api.deleteThread(selected.threadID);
        api.sendMessage(`🗑️ تم حذف طلب "${selected.name}"`, threadID);
      } catch (e) {
        api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID);
      }

    } else if (input === "3") {
      api.sendMessage(`✏️ أرسل الرسالة التي تريد إرسالها لـ "${selected.name}":`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "request_accept_msg", selected, botMessageID: info.messageID };
      });

    } else {
      api.sendMessage("⚠️ اختار 1 أو 2 أو 3 فقط.", threadID);
    }
  }

  // ─── رسالة مخصصة عند قبول الطلب ─────────────────────────────────────────
  else if (step === "request_accept_msg") {
    const { selected } = session;
    try {
      await api.sendMessage(input || "مرحباً! 👋", selected.threadID);
      api.sendMessage(`✅ تم قبول طلب "${selected.name}" وإرسال الرسالة.`, threadID);
    } catch (e) {
      api.sendMessage(`❌ فشل: ${e.message?.slice(0, 100)}`, threadID);
    }
    delete global.chatsSession[senderID];
  }

  // ─── قائمة الغروبات ───────────────────────────────────────────────────────
  else if (step === "group_list") {
    const idx = parseInt(input) - 1;
    const { list } = session;

    if (isNaN(idx) || idx < 0 || idx >= list.length)
      return api.sendMessage("❌ رقم غير صحيح.", threadID);

    const selected = list[idx];
    const tid = selected.threadID;
    const m1 = global.motorData[tid];
    const m2 = global.motorData2[tid];

    const msg = buildGroupMenu(selected, tid);
    api.sendMessage(msg, threadID, (err, info) => {
      if (!err) global.chatsSession[senderID] = { step: "group_action", selected, botMessageID: info.messageID };
    });
  }

  // ─── إجراء الغروب ────────────────────────────────────────────────────────
  else if (step === "group_action") {
    const { selected } = session;
    const tid = selected.threadID;

    function _send(statusMsg) {
      return sendGroupMenu(api, threadID, senderID, selected, tid, statusMsg);
    }

    if (input === "1") {
      if (!global.motorData[tid]?.message)
        return _send("❌ لم تُضبط رسالة المحرك. اختار 3 أولاً.");
      if (!global.motorData[tid]?.time)
        return _send("❌ لم يُضبط الوقت. اختار 4 أولاً.");
      startMotor(api, tid);
      _send(`✅ تم تفعيل المحرك في "${selected.name}"`);

    } else if (input === "2") {
      if (!global.motorData[tid]?.status)
        return _send("⚠️ المحرك متوقف أصلاً.");
      stopMotor(tid);
      _send(`✅ تم إيقاف المحرك في "${selected.name}"`);

    } else if (input === "3") {
      api.sendMessage(`✏️ أرسل رسالة المحرك العادي في "${selected.name}":`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "motor_set_msg", selected, motorType: 1, botMessageID: info.messageID };
      });

    } else if (input === "4") {
      api.sendMessage(`⏱️ أرسل الوقت للمحرك العادي (مثال: 30s أو 2m)\n🎲 أو اكتب r لوقت عشوائي بين 12s و 50s:`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "motor_set_time", selected, motorType: 1, botMessageID: info.messageID };
      });

    } else if (input === "5") {
      if (!global.motorData2[tid]?.message)
        return _send("❌ لم تُضبط رسالة المحرك الذكي. اختار 7 أولاً.");
      if (!global.motorData2[tid]?.time)
        return _send("❌ لم يُضبط الوقت. اختار 8 أولاً.");
      startMotor2(api, tid);
      _send(`✅ تم تفعيل المحرك الذكي في "${selected.name}"\n🔔 يرسل فقط عند وجود نشاط`);

    } else if (input === "6") {
      if (!global.motorData2[tid]?.status)
        return _send("⚠️ المحرك الذكي متوقف أصلاً.");
      stopMotor2(tid);
      _send(`✅ تم إيقاف المحرك الذكي في "${selected.name}"`);

    } else if (input === "7") {
      api.sendMessage(`✏️ أرسل رسالة المحرك الذكي في "${selected.name}":`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "motor_set_msg", selected, motorType: 2, botMessageID: info.messageID };
      });

    } else if (input === "8") {
      api.sendMessage(`⏱️ أرسل الوقت للمحرك الذكي (مثال: 30s أو 2m)\n🎲 أو اكتب r لوقت عشوائي بين 12s و 50s:`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "motor_set_time", selected, motorType: 2, botMessageID: info.messageID };
      });

    } else if (input === "9") {
      api.sendMessage(`💬 أرسل الرسالة التي تريد إرسالها إلى "${selected.name}":`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_send_msg", selected, botMessageID: info.messageID };
      });

    } else if (input === "10") {
      api.sendMessage(`⚠️ هل تريد إخراج البوت من "${selected.name}"؟\nأرسل "نعم" للتأكيد:`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_leave_confirm", selected, botMessageID: info.messageID };
      });

    } else if (input === "11") {
      const cur = getLock(tid);
      const prompt = cur
        ? `🔒 الاسم مقفول حالياً على: "${cur}"\n\n✏️ أرسل اسماً جديداً لاستبدال القفل\n🛑 أو اكتب: ايقاف — لإلغاء القفل`
        : `🔒 سيتم قفل اسم الغروب وحمايته من التغيير.\n\n✏️ أرسل الاسم الجديد للغروب "${selected.name}":`;
      api.sendMessage(prompt, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_set_name", selected, botMessageID: info.messageID };
      });

    } else if (input === "12") {
      const cur = NickLocks.getLock(tid);
      const prompt = (cur && cur.scope === "bot")
        ? `🔒 كنية البوت مقفولة حالياً على: "${cur.nickname}"\n\n✏️ أرسل كنية جديدة لاستبدال القفل\n🛑 أو اكتب: ايقاف — لإلغاء القفل`
        : `🔒 سيتم قفل كنية البوت فقط وحمايتها.\n⚡ أي تغيير سيُعاد تلقائياً\n\n✏️ أرسل الكنية الجديدة للبوت في "${selected.name}":`;
      api.sendMessage(prompt, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_lock_bot_nick", selected, botMessageID: info.messageID };
      });

    } else if (input === "13") {
      api.sendMessage(`✏️ اعمل منشن للعضو أو رد على رسالته مع اللقب الجديد (تغيير لمرة واحدة):`, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_set_user_nick", selected, botMessageID: info.messageID };
      });

    } else if (input === "14") {
      const cur = NickLocks.getLock(tid);
      const prompt = (cur && cur.scope === "all")
        ? `🔒 كنية الجميع مقفولة حالياً على: "${cur.nickname}"\n\n✏️ أرسل كنية جديدة لاستبدال القفل\n🛑 أو اكتب: ايقاف — لإلغاء القفل`
        : `🔒 سيتم قفل كنيات جميع أعضاء الغروب وحمايتها.\n⏱ معدل التطبيق: كل 0.5s\n⚡ أي تغيير سيُعاد تلقائياً\n\n✏️ أرسل الكنية الجديدة لجميع الأعضاء في "${selected.name}":`;
      api.sendMessage(prompt, threadID, (err, info) => {
        if (!err) global.chatsSession[senderID] = { step: "group_lock_all_nick", selected, botMessageID: info.messageID };
      });

    } else {
      _send("⚠️ اختار رقماً من 1 إلى 14.");
    }
  }

  // ─── ضبط رسالة المحرك ────────────────────────────────────────────────────
  else if (step === "motor_set_msg") {
    const { selected, motorType } = session;
    if (!input) return api.sendMessage("❌ الرسالة فارغة.", threadID);
    const store = motorType === 1 ? global.motorData : global.motorData2;
    if (!store[selected.threadID]) store[selected.threadID] = { status: false, message: null, time: null, interval: null };
    store[selected.threadID].message = input;
    if (motorType === 1 && typeof global._saveMotorState === "function") { try { global._saveMotorState(); } catch (_) {} }
    api.sendMessage(`✅ تم ضبط رسالة المحرك في "${selected.name}":\n"${input}"`, threadID);
    return sendGroupMenu(api, threadID, senderID, selected, selected.threadID);
  }

  // ─── ضبط وقت المحرك ──────────────────────────────────────────────────────
  else if (step === "motor_set_time") {
    const { selected, motorType } = session;
    const store = motorType === 1 ? global.motorData : global.motorData2;
    if (!store[selected.threadID]) store[selected.threadID] = { status: false, message: null, time: null, randomTime: false, randomRange: null, interval: null };
    const target = store[selected.threadID];

    const isRandom = String(input).trim().toLowerCase() === "r";
    if (isRandom) {
      target.randomTime  = true;
      target.randomRange = { min: 12000, max: 50000 };
      target.time        = 31000;
      api.sendMessage(`🎲 تم تفعيل الوقت العشوائي في "${selected.name}"\nكل رسالة سترسل بفاصل عشوائي بين 12s و 50s`, threadID);
    } else {
      const ms = parseTime(input);
      if (!ms || ms < 5000) return api.sendMessage("❌ وقت غير صحيح. مثال: 30s أو 2m (الحد الأدنى 5s)\n🎲 أو اكتب r للعشوائي", threadID);
      target.time        = ms;
      target.randomTime  = false;
      target.randomRange = null;
      api.sendMessage(`✅ تم ضبط الوقت في "${selected.name}": ${input}`, threadID);
    }

    if (motorType === 2) {
      try { require("./motor2.js"); } catch (_) {}
      try {
        const fs   = require("fs-extra");
        const path = require("path");
        const f = path.join(process.cwd(), "data", "motor2-state.json");
        fs.ensureDirSync(path.dirname(f));
        const toSave = {};
        for (const [tid2, d] of Object.entries(global.motorData2 || {})) {
          toSave[tid2] = {
            status:      d.status,
            message:     d.message,
            time:        d.time,
            randomTime:  d.randomTime  || false,
            randomRange: d.randomRange || null
          };
        }
        fs.writeFileSync(f, JSON.stringify(toSave, null, 2), "utf8");
      } catch (_) {}
    } else if (typeof global._saveMotorState === "function") {
      try { global._saveMotorState(); } catch (_) {}
    }
    return sendGroupMenu(api, threadID, senderID, selected, selected.threadID);
  }

  // ─── إرسال رسالة للغروب ──────────────────────────────────────────────────
  else if (step === "group_send_msg") {
    const { selected } = session;
    if (!input) return api.sendMessage("❌ الرسالة فارغة.", threadID);
    try {
      await api.sendMessage(input, selected.threadID);
      api.sendMessage(`✅ تم إرسال الرسالة إلى "${selected.name}"`, threadID);
    } catch (e) {
      api.sendMessage(`❌ فشل الإرسال: ${e.message?.slice(0, 100)}`, threadID);
    }
    return sendGroupMenu(api, threadID, senderID, selected, selected.threadID);
  }

  // ─── تأكيد الخروج ────────────────────────────────────────────────────────
  else if (step === "group_leave_confirm") {
    const { selected } = session;
    if (input === "نعم") {
      try {
        const botId = String(global.botUserID || (api.getCurrentUserID ? api.getCurrentUserID() : ""));
        await api.removeUserFromGroup(botId, selected.threadID);
        api.sendMessage(`✅ خرج البوت من "${selected.name}"`, threadID);
      } catch (e) {
        api.sendMessage(`❌ فشل الخروج: ${e.message?.slice(0, 100)}`, threadID);
      }
    } else {
      api.sendMessage("❎ تم الإلغاء.", threadID);
    }
    return sendGroupMenu(api, threadID, senderID, selected, selected.threadID);
  }

  else if (step === "group_set_name") {
    const { selected } = session;
    if (!input) return api.sendMessage("❌ الاسم فارغ.", threadID);

    if (input === "ايقاف") {
      const had = clearLock(selected.threadID);
      return sendGroupMenu(
        api, threadID, senderID, selected, selected.threadID,
        had ? "🔓 تم إيقاف قفل الاسم." : "⚠️ لا يوجد قفل مفعل لهذا الغروب."
      );
    }

    try {
      await api.setTitle(input, selected.threadID);
      selected.name = input;
      setLock(selected.threadID, input);
      return sendGroupMenu(
        api, threadID, senderID, selected, selected.threadID,
        `🔒 تم قفل اسم الغروب على:\n"${input}"\n\n(لإيقاف القفل: اختار 11 ثم اكتب ايقاف)`
      );
    } catch (e) {
      const errMsg = String(e?.message || e).slice(0, 100);
      // Lock the desired name anyway — the polling loop in nm.js will keep retrying.
      setLock(selected.threadID, input);
      return sendGroupMenu(
        api, threadID, senderID, selected, selected.threadID,
        `⚠️ فشل التغيير الفوري (${errMsg})\n🔒 لكن تم تسجيل القفل وسيُعاد المحاولة تلقائياً.`
      );
    }
  }

  else if (step === "group_lock_bot_nick") {
    const { selected } = session;
    if (!input) return api.sendMessage("❌ الكنية فارغة.", threadID);

    if (input === "ايقاف") {
      const cur = NickLocks.getLock(selected.threadID);
      if (cur && cur.scope === "bot") {
        NickLocks.clearLock(selected.threadID);
        return sendGroupMenu(api, threadID, senderID, selected, selected.threadID, "🔓 تم إيقاف قفل كنية البوت.");
      }
      return sendGroupMenu(api, threadID, senderID, selected, selected.threadID, "⚠️ لا يوجد قفل لكنية البوت في هذا الغروب.");
    }

    try {
      const botId = String(global.botUserID || (api.getCurrentUserID ? api.getCurrentUserID() : ""));
      await api.changeNickname(input, selected.threadID, botId);
    } catch (_) {}
    NickLocks.setLock(selected.threadID, input, "bot");
    return sendGroupMenu(
      api, threadID, senderID, selected, selected.threadID,
      `🔒 تم قفل كنية البوت على:\n"${input}"\n\n⚡ أي تغيير سيُعاد تلقائياً\n(لإيقاف القفل: اختار 12 ثم اكتب ايقاف)`
    );
  }

  else if (step === "group_lock_all_nick") {
    const { selected } = session;
    if (!input) return api.sendMessage("❌ الكنية فارغة.", threadID);

    if (input === "ايقاف") {
      const cur = NickLocks.getLock(selected.threadID);
      if (cur && cur.scope === "all") {
        NickLocks.clearLock(selected.threadID);
        return sendGroupMenu(api, threadID, senderID, selected, selected.threadID, "🔓 تم إيقاف قفل كنية الجميع.");
      }
      return sendGroupMenu(api, threadID, senderID, selected, selected.threadID, "⚠️ لا يوجد قفل لكنية الجميع في هذا الغروب.");
    }

    NickLocks.setLock(selected.threadID, input, "all");
    return sendGroupMenu(
      api, threadID, senderID, selected, selected.threadID,
      `🔒 تم قفل كنية الجميع على:\n"${input}"\n\n⏱ سيبدأ تطبيقها على الأعضاء كل 0.5s\n⚡ أي تغيير سيُعاد تلقائياً\n(لإيقاف القفل: اختار 14 ثم اكتب ايقاف)`
    );
  }

  else if (step === "group_set_user_nick") {
    const { selected } = session;
    let targetId = null;
    if (messageReply?.senderID) targetId = String(messageReply.senderID);
    else if (event.mentions && Object.keys(event.mentions).length > 0) targetId = String(Object.keys(event.mentions)[0]);
    if (!targetId) return api.sendMessage("⚠️ لازم رد على رسالة العضو أو اعمل منشن.", threadID);
    try {
      await api.changeNickname(input, selected.threadID, targetId);
      return sendGroupMenu(api, threadID, senderID, selected, selected.threadID, `✅ تم تغيير لقب العضو.`);
    } catch (e) {
      return sendGroupMenu(api, threadID, senderID, selected, selected.threadID, `❌ فشل تغيير لقب العضو: ${e.message?.slice(0, 100)}`);
    }
  }
};

// ─── run ──────────────────────────────────────────────────────────────────────

module.exports.run = async function ({ api, event, permssion }) {
  const { threadID, messageID, senderID } = event;

  if (permssion < 2) return api.sendMessage("⛔ هذا الأمر خاص بأدمن البوت فقط.", threadID, messageID);

  global.chatsSession[senderID] = { step: "main", botMessageID: null };

  const menu =
    "💬 إدارة المحادثات\n"
    + "━━━━━━━━━━━━━━━\n"
    + "1 - طلبات المراسلة\n"
    + "2 - الغروبات الحالية\n"
    + "━━━━━━━━━━━━━━━\n"
    + "↩️ رد بالرقم لاختيار ما تريد";

  api.sendMessage(menu, threadID, (err, info) => {
    if (!err) global.chatsSession[senderID].botMessageID = info.messageID;
  }, messageID);
};
