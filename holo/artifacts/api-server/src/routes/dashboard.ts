import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة تحكم بوت مسنجر</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: #0f0f1a;
      color: #e0e0ff;
      min-height: 100vh;
      padding: 20px;
    }
    h1 { color: #7c6cfc; font-size: 2rem; text-align: center; margin-bottom: 5px; }
    .subtitle { text-align: center; color: #888; margin-bottom: 30px; font-size: 0.9rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; max-width: 1100px; margin: 0 auto; }
    .card {
      background: #1a1a2e;
      border: 1px solid #2a2a4a;
      border-radius: 12px;
      padding: 20px;
    }
    .card h2 { color: #a89cff; margin-bottom: 15px; font-size: 1.1rem; border-bottom: 1px solid #2a2a4a; padding-bottom: 8px; }
    .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-left: 8px; }
    .dot-green { background: #4caf50; box-shadow: 0 0 6px #4caf50; }
    .dot-red { background: #f44336; box-shadow: 0 0 6px #f44336; }
    .dot-yellow { background: #ffc107; box-shadow: 0 0 6px #ffc107; }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;
      font-family: inherit;
      transition: opacity 0.2s;
      margin: 4px;
    }
    button:hover { opacity: 0.85; }
    .btn-green { background: #2e7d32; color: #fff; }
    .btn-red { background: #c62828; color: #fff; }
    .btn-blue { background: #1565c0; color: #fff; }
    .btn-purple { background: #4a148c; color: #fff; }
    textarea, input {
      width: 100%;
      background: #0f0f1a;
      border: 1px solid #3a3a5a;
      border-radius: 8px;
      color: #e0e0ff;
      padding: 10px;
      font-family: monospace;
      font-size: 0.85rem;
      margin-bottom: 10px;
      resize: vertical;
    }
    input { resize: none; }
    .msg { padding: 10px; border-radius: 8px; margin-top: 10px; font-size: 0.85rem; }
    .msg-success { background: #1b5e20; color: #a5d6a7; }
    .msg-error { background: #b71c1c; color: #ef9a9a; }
    .status-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #1a1a30; font-size: 0.9rem; }
    .status-row:last-child { border-bottom: none; }
    .commands-list { font-size: 0.85rem; line-height: 2; }
    .cmd { color: #7c6cfc; }
    label { display: block; margin-bottom: 5px; color: #aaa; font-size: 0.85rem; }
    .badge { padding: 2px 8px; border-radius: 20px; font-size: 0.75rem; }
    .badge-green { background: #1b5e20; color: #a5d6a7; }
    .badge-red { background: #b71c1c; color: #ef9a9a; }
  </style>
</head>
<body>
  <h1>🤖 بوت مسنجر للمجموعات</h1>
  <p class="subtitle">لوحة التحكم — مدعوم بـ @neoaz07/nkxfca</p>

  <div class="grid">
    <!-- حالة البوت -->
    <div class="card">
      <h2>📊 حالة البوت</h2>
      <div id="status-container">
        <div class="status-row">
          <span>جارٍ التحميل...</span>
        </div>
      </div>
      <div style="margin-top:15px;">
        <button class="btn-green" onclick="startBot()">▶ تشغيل البوت</button>
        <button class="btn-red" onclick="stopBot()">⏹ إيقاف البوت</button>
        <button class="btn-blue" onclick="refreshStatus()">🔄 تحديث</button>
      </div>
      <div id="bot-msg"></div>
    </div>

    <!-- رفع AppState -->
    <div class="card">
      <h2>🔑 تحديث AppState (الكوكيز)</h2>
      <p style="color:#888;font-size:0.82rem;margin-bottom:12px;">
        الصق محتوى ملف <strong>appstate.json</strong> هنا لإعادة تسجيل الدخول
      </p>
      <label>محتوى AppState (JSON):</label>
      <textarea id="appstate-input" rows="6" placeholder='[{"key":"...","value":"..."}]'></textarea>
      <button class="btn-purple" onclick="uploadAppState()">⬆ رفع AppState</button>
      <div id="appstate-msg"></div>
    </div>

    <!-- الإعدادات -->
    <div class="card">
      <h2>⚙️ الإعدادات</h2>
      <div id="config-container">
        <div class="status-row"><span>جارٍ التحميل...</span></div>
      </div>
      <div style="margin-top:12px;">
        <label>البادئة:</label>
        <input id="cfg-prefix" type="text" value="/" maxlength="5" style="margin-bottom:8px;">
        <label>اسم البوت:</label>
        <input id="cfg-name" type="text" value="مساعد المجموعات" style="margin-bottom:8px;">
        <label>معرّفات المشرفين (مفصولة بفاصلة):</label>
        <input id="cfg-admins" type="text" placeholder="100000001,100000002" style="margin-bottom:8px;">
        <button class="btn-blue" onclick="saveConfig()">💾 حفظ الإعدادات</button>
      </div>
      <div id="config-msg"></div>
    </div>

    <!-- الأوامر المتاحة -->
    <div class="card">
      <h2>📋 الأوامر المتاحة</h2>
      <div class="commands-list">
        <div><span class="cmd">/help</span> — قائمة الأوامر</div>
        <div><span class="cmd">/سيرفر</span> — معلومات السيرفر</div>
        <div><span class="cmd">/اعضاء</span> — أعضاء المجموعة</div>
        <div><span class="cmd">/ping</span> — اختبار الاستجابة</div>
        <div><span class="cmd">/وقت</span> — الوقت الحالي</div>
        <div><span class="cmd">/قرعة</span> — اختيار عضو عشوائي</div>
        <div><span class="cmd">/عداد &lt;رقم&gt;</span> — عداد تنازلي</div>
        <div><span class="cmd">/معلومات</span> — معلومات البوت</div>
        <div><span class="cmd">/طرد @شخص</span> — طرد عضو (مشرف)</div>
        <div><span class="cmd">/اضافة &lt;id&gt;</span> — إضافة عضو (مشرف)</div>
        <div><span class="cmd">/تثبيت &lt;رسالة&gt;</span> — تثبيت رسالة (مشرف)</div>
        <div><span class="cmd">/ترحيب</span> — تفعيل/تعطيل الترحيب (مشرف)</div>
        <div><span class="cmd">/اعداد</span> — عرض الإعدادات (مشرف)</div>
      </div>
    </div>

    <!-- دليل الاستخدام -->
    <div class="card">
      <h2>📖 كيفية الاستخدام</h2>
      <div style="font-size:0.85rem;line-height:1.8;color:#ccc;">
        <p><strong style="color:#a89cff;">1. الحصول على AppState:</strong></p>
        <p>استخدم أداة مثل c3c-fbstate أو كروم للحصول على ملف appstate.json لحسابك</p>
        <br>
        <p><strong style="color:#a89cff;">2. رفع AppState:</strong></p>
        <p>الصق محتوى الملف في خانة "تحديث AppState" ثم اضغط رفع</p>
        <br>
        <p><strong style="color:#a89cff;">3. إضافة معرّفك كمشرف:</strong></p>
        <p>في الإعدادات، أضف معرّف حسابك في "معرّفات المشرفين"</p>
        <br>
        <p><strong style="color:#a89cff;">4. تشغيل البوت:</strong></p>
        <p>اضغط "تشغيل البوت" وانتظر حتى تظهر حالة "متصل"</p>
        <br>
        <p><strong style="color:#a89cff;">5. الأوامر في المجموعة:</strong></p>
        <p>أرسل /help في أي مجموعة يكون فيها حسابك</p>
      </div>
    </div>
  </div>

  <script>
    const BASE = window.location.origin;

    async function refreshStatus() {
      try {
        const res = await fetch(BASE + '/api/bot/status');
        const data = await res.json();
        const cont = document.getElementById('status-container');
        cont.innerHTML = \`
          <div class="status-row">
            <span>حالة البوت</span>
            <span>
              <span class="status-dot \${data.running ? 'dot-green' : 'dot-red'}"></span>
              <span class="badge \${data.running ? 'badge-green' : 'badge-red'}">\${data.running ? 'يعمل' : 'متوقف'}</span>
            </span>
          </div>
          <div class="status-row">
            <span>الاتصال بمسنجر</span>
            <span>
              <span class="status-dot \${data.connected ? 'dot-green' : 'dot-red'}"></span>
              <span class="badge \${data.connected ? 'badge-green' : 'badge-red'}">\${data.connected ? 'متصل' : 'غير متصل'}</span>
            </span>
          </div>
          <div class="status-row">
            <span>AppState</span>
            <span>
              <span class="status-dot \${data.hasAppState ? 'dot-green' : 'dot-yellow'}"></span>
              <span>\${data.hasAppState ? 'موجود ✅' : 'غير موجود ⚠️'}</span>
            </span>
          </div>
          <div class="status-row">
            <span>محاولات إعادة الاتصال</span>
            <span>\${data.reconnectCount ?? 0}</span>
          </div>
          \${data.config ? \`
          <div class="status-row">
            <span>البادئة</span>
            <span style="color:#7c6cfc;">\${data.config.prefix}</span>
          </div>
          <div class="status-row">
            <span>اسم البوت</span>
            <span>\${data.config.botName}</span>
          </div>
          \` : ''}
        \`;
      } catch (e) {
        document.getElementById('status-container').innerHTML = '<div style="color:#f44336">خطأ في الاتصال بالخادم</div>';
      }
    }

    async function loadConfig() {
      try {
        const res = await fetch(BASE + '/api/bot/config');
        const data = await res.json();
        if (!data.config) return;
        document.getElementById('cfg-prefix').value = data.config.prefix ?? '/';
        document.getElementById('cfg-name').value = data.config.botName ?? '';
        document.getElementById('cfg-admins').value = (data.config.adminIDs ?? []).join(',');

        const cont = document.getElementById('config-container');
        cont.innerHTML = \`
          <div class="status-row"><span>البادئة الحالية</span><span style="color:#7c6cfc;">\${data.config.prefix}</span></div>
          <div class="status-row"><span>مكافحة السبام</span><span>\${data.config.antiSpam ? '✅ مفعّل' : '❌ معطّل'}</span></div>
          <div class="status-row"><span>رسالة الترحيب</span><span>\${data.config.welcomeMessage ? '✅ مفعّلة' : '❌ معطّلة'}</span></div>
          <div class="status-row"><span>إعادة الاتصال</span><span>\${data.config.autoReconnect ? '✅ مفعّل' : '❌ معطّل'}</span></div>
        \`;
      } catch (e) {}
    }

    async function startBot() {
      const res = await fetch(BASE + '/api/bot/start', { method: 'POST' });
      const data = await res.json();
      showMsg('bot-msg', data.message, data.success);
      setTimeout(refreshStatus, 3000);
    }

    async function stopBot() {
      const res = await fetch(BASE + '/api/bot/stop', { method: 'POST' });
      const data = await res.json();
      showMsg('bot-msg', data.message, data.success);
      setTimeout(refreshStatus, 1000);
    }

    async function uploadAppState() {
      const val = document.getElementById('appstate-input').value.trim();
      if (!val) { showMsg('appstate-msg', 'يرجى إدخال AppState', false); return; }
      let parsed;
      try { parsed = JSON.parse(val); } catch { showMsg('appstate-msg', 'صيغة JSON غير صحيحة', false); return; }
      const res = await fetch(BASE + '/api/bot/appstate', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ appstate: parsed })
      });
      const data = await res.json();
      showMsg('appstate-msg', data.message, data.success);
      if (data.success) refreshStatus();
    }

    async function saveConfig() {
      const prefix = document.getElementById('cfg-prefix').value.trim() || '/';
      const botName = document.getElementById('cfg-name').value.trim() || 'مساعد المجموعات';
      const adminsRaw = document.getElementById('cfg-admins').value.trim();
      const adminIDs = adminsRaw ? adminsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      const res = await fetch(BASE + '/api/bot/config', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ prefix, botName, adminIDs })
      });
      const data = await res.json();
      showMsg('config-msg', data.message, data.success);
      if (data.success) { loadConfig(); refreshStatus(); }
    }

    function showMsg(id, text, success) {
      const el = document.getElementById(id);
      el.innerHTML = \`<div class="msg \${success ? 'msg-success' : 'msg-error'}">\${text}</div>\`;
      setTimeout(() => { el.innerHTML = ''; }, 5000);
    }

    refreshStatus();
    loadConfig();
    setInterval(refreshStatus, 10000);
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

export default router;
