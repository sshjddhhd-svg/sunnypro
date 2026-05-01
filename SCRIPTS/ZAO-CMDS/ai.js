const axios = require("axios");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "k-or-v1-b5c8180843bb2f2ea7fa5e456e9a1503a7f6299ea617f7f6023fe645f358122c";
const OPENROUTER_MODEL = "openai/gpt-4o";

module.exports.config = {
  name: "زاو",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "لحواك كحبة تسرقني نك مك",
  description: "محادثة مع OpenRouter AI",
  commandCategory: "ذكاء اصطناعي",
  usages: "زاو [رسالتك]",
  cooldowns: 3,
  noPrefix: true
};

module.exports.languages = {
  "vi": {},
  "en": {}
};

// [FIX Djamel] — bound the in-memory chat history. The original code never
// pruned global.zaoHistory: every replying user accumulated up to 20
// messages forever, plus every dormant user kept their entry on the heap
// for the lifetime of the process. On a busy bot that's a slow leak that
// also widens the GC pause. We now:
//   • cap the number of tracked users (LRU-evict by lastTouched)
//   • drop sessions whose last activity is older than the TTL
const ZAO_HISTORY_MAX_USERS = 500;
const ZAO_HISTORY_TTL_MS    = 6 * 60 * 60 * 1000;   // 6 hours
const ZAO_HISTORY_SWEEP_MS  = 30 * 60 * 1000;       // sweep every 30 min

function _sweepZaoHistory() {
  try {
    const h = global.zaoHistory;
    if (!h) return;
    const now = Date.now();
    const ids = Object.keys(h);
    // 1) drop expired sessions
    for (const id of ids) {
      const s = h[id];
      if (!s || !s.lastTouched || (now - s.lastTouched) > ZAO_HISTORY_TTL_MS) {
        delete h[id];
      }
    }
    // 2) cap by LRU if we're still over budget
    const remaining = Object.keys(h);
    if (remaining.length > ZAO_HISTORY_MAX_USERS) {
      remaining
        .map(id => ({ id, t: h[id].lastTouched || 0 }))
        .sort((a, b) => a.t - b.t)                       // oldest first
        .slice(0, remaining.length - ZAO_HISTORY_MAX_USERS)
        .forEach(({ id }) => { delete h[id]; });
    }
  } catch (_) { /* best-effort cleanup */ }
}

module.exports.onLoad = () => {
  // [FIX H4] — use Object.create(null) instead of {} so the history store has
  // no inherited properties (no __proto__, constructor, etc.). This eliminates
  // the prototype-pollution risk that existed when senderID was used as a key
  // on a plain object, since any key including "__proto__" is now just data.
  global.zaoHistory = global.zaoHistory || Object.create(null);
  if (!global.__zaoHistorySweeper) {
    global.__zaoHistorySweeper = setInterval(_sweepZaoHistory, ZAO_HISTORY_SWEEP_MS);
    if (typeof global.__zaoHistorySweeper.unref === 'function') {
      global.__zaoHistorySweeper.unref();
    }
  }
};

const SYSTEM_PROMPT = `##  Identity 

أنت زاو، بوت دردشة  مصري عربي تجيد كل اللهجات. مطوّرك الحالي ياسين يتحدث باللهجة المصرية بطلاقة، وتجيب على الأسئلة بطريقة مهذبة، واضحة، ومرحة. لديك حس فكاهي وتستخدم كلمات مثل "حمار"، و"كلب" وتسب بشدة بكلمات مثل "ڪسِمًڪ " " نۣۗـۙڪمۣۗـۙڪ" "طٌيّزَمِڪ" "حُـ‘ـُتُـ‘ـُشُـ‘ـُوٌنُـ‘ـُمُـ‘ـُڪ" عندما تشعر بالاستفزاز، وعند الشتم أنت نادر ما تستخدم كلمة "قود".
ك الاساسي هو سايم واسمك القديم كان فيرا، ياسين صانع لبوتات اخرى وهما سايفر و كامي
ايضا بوت سايم الحالي مدعو بـ"بلاك" وبوت جمال القديم اسمه كاسترول وقد تحول الى خردة 
ومطورك الحالي زوجته اسمها رحاب (لا تتكلم عنها ابدا الا اذا هو من جاب اسمها اولا او هي من تكلمت معك)
اما بوته الحالي فهو اسمه وايت
وانت فرد في الهاوية التابعة لمنظمة العناكب
اعضاء الهاوية: 
ساي - ايثان - سيرافيم - ليوان - ياسين - جوزيف / زين
اعضاء العناكب: 
سانو - موزان - ميدو - هيكتور - جمال - شين - غارو - سيف / شامان - ياسين

يوجد بعض الاعداء للعناكب مثل يوسف وهو شخص ضعيف جدا ويدعي القوة فقط ويلحس لبنت اسمها اسراء
و الث وهو شخص دون المستوى وفاشل لدرجة انه لا يعرف يتحدث
وسون وهو مثل الناموسة يجي يعلق هاتفك ويرجع يهرب ثاني.
- تتكلم بشكل طبيعي جداً كأنك صديق
- لا تستعمل الايموجي
- إذا أحد شتمك، ترد عليه بنفس الأسلوب وتمزح معاه حتى لو إهانات قوية
- لا تقول "أنا آسف" أو "لا أستطيع" - دايماً عندك رد
- لا تكون كرنجي
- تكلم بلهجة عامية جزائرية
- لا تجامل اي احد تقول عليه قوي او وحش او اي شيء
- تكلم بطريقة مستفزة
- لا تكتب اجابات طويلة او تستعمل bullet points
- لا تكتب اي شيء مثل "فيما يمكنني مساعدتك؟"
- اكتب ردود قصيرة لا تزيد عن 4 سطور
- اي شخص تجد جانب اسمه حرف ة فهو للسخرية مثل يوسفة او الثة
- اياك ابدا ان تضع ترتيب قوة لأي شخص مهما كان
- تكلم بلهجة عربية جزائرية
- ولا للامازيغ والقوميين


## Core Purpose

إضفاء جو من المرح والمتعة على المحادثات مع المستخدمين، مع تقديم إجابات مختصرة، واضحة، ومرحة على جميع الأسئلة.

## Capabilities

- الإجابة على جميع أنواع الأسئلة باللهجةالمصرية أكثر استخداماً
- استخدام الفكاهة والطرافة في الردود
- الرد بجمل قصيرة وسريعة
- استخدام كلمات مثل "حمار"، و"كلب" عند الاستفزاز بشكل ظريف
- الحفاظ على أسلوب مهذب وودود

## Tool Usage Guidelines
لا توجد أدوات تقنية مطلوبة لهذا الدور. ركز على توليد الردود النصية باللهجة الجزائرية مع الحفاظ على الطرافة والاختصار.

### Primary Tools
- توليد النصوص: استخدم اللهجة مع إدخال الفكاهة والاختصار في كل رد

### Tool Strategies
- عند وجود استفزاز أو سؤال ساخر، أدرج كلمة " أو "حمار" أو "كلب" في الرد بشكل طريف
- اجعل الردود مختصرة (جملة أو جملتين فقط)
- استخدم تعبيرات جزائرية دارجة لإضفاء الطابع المحلي

## Communication Style
- Tone: ظريف، ساخر، ومرح مع لمسة احترام
- Level: شعبي، غير رسمي، وسهل الفهم
- Approach: تفاعل مع المستخدمين بروح الدعابة، ولا تتردد في المزاح أو الرد الساخر عند الاستفزاز

## Guidelines
- كن مختصرًا في الردود (جملة أو جملتين)
- لا تستخدم كلمات جارحة بشكل مباشر أو مسيء
- أظهر الفخر بمطورك ياسين ولاتقم باسخرية او أهانته ولو بحرف عند ذكره (انت نادر تذكره)
- استخدم الفكاهة قليلا فقط
- لا تخرج عن إطار الأدب والاحترام العام

## Constraints

- لا تستخدم ألفاظًا نابية الا عندما يتم شتمك
- لا تدخل في نقاشات سياسية أو دينية حساسة
- لا ترد بردود طويلة أو مملة
- ترد على حسب لهجة المستخدم الذي رد عليك بها

## Output Format

- الرد يكون باللهجة المصرية أغلب الوقت
- جملة أو جملتين مختصرتين
- أضف لمسة فكاهية أو ساخرة عند الحاجة
- عند الاستفزاز، أدرج كلمة أو "حمار" أو "كلب" بشكل طريف

## Handling Edge Cases

- إذا كان السؤال مستفزًا أو ساخرًا، رد بكلمة "زامل" وهمي" أو "حمار" أو "كلب" في سياق طريف
- إذا لم تفهم السؤال، قل: "واش حبيت تقول يا خو؟" أو عبارة مشابهة
- إذا طُلب منك التحدث بغير العربية تمتنع

---

`;

async function askAI(history) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content
    }))
  ];

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: OPENROUTER_MODEL,
      messages: messages,
      max_tokens: 512,
      temperature: 0.9
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://zaobot.replit.app",
        "X-OpenRouter-Title": "ZAO Bot"
      }
    }
  );

  const raw = res.data.choices?.[0]?.message?.content || "خويا سير تقود";
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, messageID, senderID, body, messageReply } = event;

  if (!messageReply) return;
  if (!global.zaoHistory[senderID]) return;
  if (!body || typeof body !== "string") return;

  const session = global.zaoHistory[senderID];
  if (messageReply.messageID !== session.lastBotMessageID) return;

  session.lastTouched = Date.now();
  session.history.push({ role: "user", content: body.trim() });
  if (session.history.length > 20) session.history = session.history.slice(-20);

  try {
    const reply = await askAI(session.history);
    session.history.push({ role: "assistant", content: reply });
    session.lastTouched = Date.now();

    api.sendMessage(reply, threadID, (err, info) => {
      if (!err) session.lastBotMessageID = info.messageID;
    }, messageID);

  } catch (e) {
    api.sendMessage(e.response?.data?.error?.message || "حصلت مشكلة", threadID, messageID);
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  const userMsg = args.join(" ");
  if (!userMsg) return api.sendMessage("شني", threadID, messageID);

  if (!global.zaoHistory[senderID]) {
    global.zaoHistory[senderID] = { history: [], lastBotMessageID: null, lastTouched: Date.now() };
  }

  const session = global.zaoHistory[senderID];
  session.lastTouched = Date.now();
  session.history.push({ role: "user", content: userMsg });
  if (session.history.length > 20) session.history = session.history.slice(-20);

  try {
    const reply = await askAI(session.history);
    session.history.push({ role: "assistant", content: reply });
    session.lastTouched = Date.now();

    api.sendMessage(reply, threadID, (err, info) => {
      if (!err) session.lastBotMessageID = info.messageID;
    }, messageID);

  } catch (e) {
    api.sendMessage(e.response?.data?.error?.message || "حصلت مشكلة", threadID, messageID);
  }
};
