# DJAMEL FIXES — سجل كل التعديلات والإصلاحات

**المُصلح:** Djamel  
**التاريخ:** 2026  

---

## ══════════════════════════════════════
## 📦 الملفات المُنشأة (جديدة)
## ══════════════════════════════════════

### `includes/user-agents.js` — **إنشاء جديد**
- **السبب:** `antiSuspension.js` يطلب `require('./user-agents')` لكن الملف لم يكن موجوداً → crash فوري عند كل رسالة
- **الحل:** إنشاء الملف من الصفر بـ 10 User Agents واقعية لـ Chrome/Firefox/Edge على Windows/Mac/Linux
- **الميزات:** `randomUserAgent()` تعيد fingerprint متكاملة: UA + secChUa + platform + locale

---

## ══════════════════════════════════════
## 🔧 الإصلاحات (Bugs Fixed)
## ══════════════════════════════════════

### BUG-001 — `ZAO.js`: GBAN Kill Switch الخارجي
- **الملف:** `ZAO.js` (سطر ~225)
- **المشكلة:** البوت يجلب JSON من GitHub خارجي (`i1nam/EMA-GBAN`) وإذا أرجع `true` ينفذ `process.exit(0)` → مفتاح إيقاف لا تملكه!
- **الإصلاح:** تحويل الـ kill switch إلى تحذير فقط — البوت يطبع warning ويكمل بدلاً من أن يتوقف
- **التأثير:** البوت لن يتوقف فجأة بسبب طرف خارجي

---

### BUG-002 — `ZAO.js`: Auto-Ping على Port خاطئ
- **الملف:** `ZAO.js` (دالة `autoPing`)
- **المشكلة:** البوت يحاول ping على `http://localhost:3000` لكن السيرفر (Main.js) يعمل على port 5000
- **الإصلاح:** تغيير default من 3000 إلى 5000 — `process.env.PORT || 5000`
- **التأثير:** كل ping ينجح والـ keep-alive يعمل بشكل صحيح

---

### BUG-003 — `includes/antiSuspension.js`: `_getUtils()` يطلب ملف غير موجود
- **الملف:** `includes/antiSuspension.js`
- **المشكلة:** `_getUtils()` ينفذ `require('./index')` الذي لا يوجد → crash صامت عند كل استدعاء للـ warning logger
- **الإصلاح:** إعادة كتابة `_getUtils()` لاستخدام `global.loggeryuki` (المتاح عالمياً) مع fallback لـ `console`
- **التأثير:** لا crash، تسجيل التحذيرات يعمل بشكل صحيح

---

### BUG-004 — `includes/handle/handleCommand.js`: `senderID.toString()` على `undefined`
- **الملف:** `includes/handle/handleCommand.js` (سطر 23)
- **المشكلة:** السطر `if (global.lockBot === true && !ADMINBOT.includes(senderID.toString()))` يُنفَّذ قبل التحقق من أن senderID موجود → crash: *"Cannot read properties of undefined (reading 'toString')"*
- **الإصلاح:** إضافة حارس مبكر: `if (!senderID || !threadID) return;` قبل أي استخدام لـ `.toString()`، وتغيير `senderID.toString()` إلى `String(senderID)`
- **التأثير:** لا crash عند أحداث بدون senderID

---

### BUG-005 — `includes/handle/handleCommand.js`: `commandCategory` قد يكون `undefined`
- **الملف:** `includes/handle/handleCommand.js` (سطر ~145)
- **المشكلة:** `command.config.commandCategory.toLowerCase()` يفشل إذا لم يُعرَّف `commandCategory` في الأمر
- **الإصلاح:** تغيير إلى `(command.config.commandCategory || "").toLowerCase()`
- **التأثير:** الأوامر التي لا تحدد `commandCategory` لن تتسبب في crash

---

### BUG-006 — `SCRIPTS/ZAO-CMDS/cp.js` (أمر التحكم): سبب الخطأ الرئيسي
- **الملف:** `SCRIPTS/ZAO-CMDS/cp.js` (دالة `handleEvent`)
- **المشكلة الجذرية:** الخطأ `[ERR] [handleEvent→cmd.handleEvent] Error in التحكم Cannot read properties of undefined (reading 'toString')` سببه سطر:
  ```javascript
  if (!global.config.ADMINBOT.includes(senderID.toString())) return;
  ```
  عندما تصل أحداث من نوع `log:thread-name` أو `log:subscribe` فإن `senderID` تكون `undefined` → crash
- **الإصلاح:**
  1. إضافة حارس نوع الحدث: `if (type !== "message" && type !== "message_reply") return;`
  2. إضافة null check: `if (!senderID || !threadID) return;`
  3. تأمين الـ ADMINBOT check: `global.config?.ADMINBOT?.includes(String(senderID))`
- **التأثير:** أمر `.التحكم` يعمل بدون أي أخطاء

---

### BUG-007 — `SCRIPTS/ZAO-CMDS/refresh.js`: events Map vs Array مختلطة
- **الملف:** `SCRIPTS/ZAO-CMDS/refresh.js`
- **المشكلة:** `global.client.events` هي Map، لكن refresh.js يتعامل معها كـ Array:
  - `global.client.events = []` → يدمر الـ Map!
  - `global.client.events.push(command)` → لا يعمل على Map
  - `global.client.events.filter(...)` → لا يعمل على Map
  هذا يتسبب في تعطل كل أوامر ZAO-EVTS عند تنفيذ ريفرش
- **الإصلاح:** إعادة كتابة الملف بالكامل باستخدام عمليات Map الصحيحة (`.set`, `.delete`, `.has`) وإضافة `eventRegistered` Array sync
- **التأثير:** الـ refresh يعمل بشكل صحيح دون تدمير أحداث ZAO-EVTS

---

## ══════════════════════════════════════
## 🚀 التحسينات والتطوير
## ══════════════════════════════════════

### ENHANCE-001 — `includes/login/accountHealthMonitor.js`: كشف حجب الرسائل
- إضافة 15 pattern جديد لكشف حظر الرسائل من فيسبوك:
  - error codes: 100, 613, 2000, 10
  - نصوص: "action blocked", "you can't send", "messaging restricted", "send limit", etc.
- إضافة نظام بث دوري كل ساعة يُرسل تقرير صحة الحساب للمسؤولين تشمل:
  - الحساب النشط (Tier)، وقت التشغيل، آخر فحص كوكيز، عداد الأخطاء

---

### ENHANCE-002 — `includes/antiSuspension.js`: مناورات الاخفاء المتقدمة
الميزات الجديدة المُضافة:

| الدالة | الوصف |
|--------|-------|
| `getTimeBasedDelay()` | تأخير مبني على ساعة اليوم — ليلاً بطيء، مساءً سريع |
| `maybeSessionBreak()` | 5% استراحة 2-6 دقائق، 10% استراحة 20-60 ثانية (تقليد البشر) |
| `antiPatternJitter()` | ضوضاء عشوائية لكسر الأنماط الثابتة التي يكتشفها فيسبوك |
| `simulateReadDelay()` | تأخير قراءة الرسالة قبل الرد — البشر يقرأون قبل الرد، البوت لا |
| `simulateHumanCompose()` | تسلسل تفكير → كتابة → توقف → إرسال |
| `shouldEnterCooldown()` | إذا تجاوز 80 رسالة/ساعة → استراحة، 800 رسالة/يوم → استراحة طويلة |
| `fullEvasionSequence()` | تسلسل كامل لكل المناورات بترتيب مثلى قبل كل إرسال |

---

### ENHANCE-003 — `includes/handle/handleEvent.js`: توثيق وتمرير `type`
- إضافة comment رسمي بـ @debugger Djamel
- توضيح أن `event.type` متاح في Obj للأوامر لتصفية الأحداث

---

## ══════════════════════════════════════
## 🧠 تحليل سبب إيقاف البوت وتعليق الحسابات
## ══════════════════════════════════════

### السبب 1 — Crash متكرر بسبب `user-agents.js` المفقود
- كل رسالة تصل → `antiSuspension.js` يُستدعى → يطلب `require('./user-agents')` → crash
- WATCHDOG يعيد تشغيل ZAO.js بسرعة فائقة → فيسبوك يرى نشاطاً غير طبيعي → حجب

### السبب 2 — Kill Switch خارجي (GBAN)
- أي شخص يتحكم في ملف JSON على GitHub يستطيع إيقاف بوتك متى شاء
- مُعطَّل الآن

### السبب 3 — Auto-Ping الفاشل
- البوت يحاول ping port 3000 لكن الـ keep-alive server على 5000
- كل ping يفشل → Replit يعتبر التطبيق ميتاً → يوقفه
- مُصلح الآن

### السبب 4 — Crash في handleEvent من أمر التحكم
- أي حدث مجموعة (شخص انضم/غادر/غيّر الاسم) يُحفّز handleEvent في cp.js
- `senderID` تكون undefined → crash → WATCHDOG يعيد التشغيل → دورة لا تنتهي

### السبب 5 — نمط الإرسال المنتظم
- البوت كان يُرسل بتوقيتات ثابتة جداً
- الآن: جيتر عشوائي + تأخير زمني + استراحات عشوائية

---

## ══════════════════════════════════════
## 📋 قائمة الملفات المُعدَّلة
## ══════════════════════════════════════

| الملف | نوع التعديل | وصف |
|-------|------------|-----|
| `ZAO.js` | إصلاح | BUG-001 (GBAN) + BUG-002 (port) |
| `includes/antiSuspension.js` | إصلاح + تحسين | BUG-003 (_getUtils) + ENHANCE-002 (مناورات) |
| `includes/handle/handleCommand.js` | إصلاح | BUG-004 (senderID undefined) + BUG-005 (commandCategory) |
| `includes/handle/handleEvent.js` | توثيق | ENHANCE-003 |
| `includes/login/accountHealthMonitor.js` | تحسين | ENHANCE-001 (patterns + بث دوري) |
| `SCRIPTS/ZAO-CMDS/cp.js` | إصلاح | BUG-006 (الخطأ الرئيسي handleEvent) |
| `SCRIPTS/ZAO-CMDS/refresh.js` | إعادة كتابة | BUG-007 (Map vs Array) |
| `includes/user-agents.js` | إنشاء جديد | BUG حرج (module not found) |

---

*@debugger Djamel — كل حق محفوظ*
