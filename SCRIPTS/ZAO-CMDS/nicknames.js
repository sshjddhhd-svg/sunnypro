module.exports.config = {
  name: "كنيات",
  version: "1.0.0",
  hasPermssion: 1, // يحتاج صلاحية أدمن مجموعة أو بوت
  credits: "Gemini",
  description: "تغيير كنيات جميع أعضاء المجموعة بشكل متتابع",
  commandCategory: "إدارة المجموعة",
  usages: "تشغيل [الكنية] / ايقاف",
  cooldowns: 5
};

// مخزن لتتبع الجلسات النشطة لكل مجموعة
if (!global.nickSessions) {
  global.nickSessions = new Map();
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const type = args[0];

  // --- حالة الإيقاف ---
  if (type === "ايقاف") {
    if (global.nickSessions.has(threadID)) {
      clearInterval(global.nickSessions.get(threadID));
      global.nickSessions.delete(threadID);
      return api.sendMessage("🛑 تم إيقاف عملية تغيير الكنيات بنجاح.", threadID, messageID);
    } else {
      return api.sendMessage("⚠️ لا توجد عملية تغيير كنيات جارية حالياً.", threadID, messageID);
    }
  }

  // --- حالة التشغيل ---
  if (type === "تشغيل") {
    const nickname = args.slice(1).join(" ");
    
    if (!nickname) {
      return api.sendMessage("📌 الاستخدام: كنيات تشغيل [الكنية المطلوبة]", threadID, messageID);
    }

    if (global.nickSessions.has(threadID)) {
      return api.sendMessage("⚠️ هناك عملية جارية بالفعل في هذه المجموعة. أوقفها أولاً.", threadID, messageID);
    }

    // جلب معلومات المجموعة والأعضاء
    try {
      const threadInfo = await api.getThreadInfo(threadID);
      const participantIDs = threadInfo.participantIDs;
      let index = 0;

      api.sendMessage(`🔄 جاري بدء تغيير كنيات ${participantIDs.length} عضو إلى "${nickname}"...\n⏱️ المعدل: عضو كل 3 ثوانٍ.`, threadID);

      const intervalId = setInterval(async () => {
        // التحقق مما إذا وصلنا لنهاية القائمة
        if (index >= participantIDs.length) {
          api.sendMessage("✅ اكتملت العملية: تم تغيير كنيات الجميع.", threadID);
          clearInterval(intervalId);
          global.nickSessions.delete(threadID);
          return;
        }

        const userID = participantIDs[index];
        
        // تنفيذ تغيير الكنية
        api.nickname(nickname, threadID, userID, (err) => {
          if (err) console.error(`[خطأ] فشل تغيير كنية المستخدم ${userID}`);
        });

        index++;
      }, 3000); // 3000ms = 3 ثوانٍ

      // حفظ الجلسة لإمكانية إيقافها
      global.nickSessions.set(threadID, intervalId);

    } catch (error) {
      console.error(error);
      return api.sendMessage("❌ حدث خطأ أثناء جلب بيانات الأعضاء.", threadID, messageID);
    }
  } 
  
  else {
    return api.sendMessage("📌 الاستخدام:\n- كنيات تشغيل [الاسم]\n- كنيات ايقاف", threadID, messageID);
  }
};
