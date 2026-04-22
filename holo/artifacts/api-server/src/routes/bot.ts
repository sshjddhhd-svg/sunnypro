import { Router, type Request, type Response } from "express";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadConfig, saveConfig, loadCredentials, saveCredentials, clearCredentials, saveAppState } from "../bot/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPSTATE_PATH = path.resolve(__dirname, "../../appstate.json");

const router = Router();

declare global {
  var messengerBot: any;
}

router.get("/status", (_req: Request, res: Response) => {
  if (!global.messengerBot) {
    return res.json({ running: false, connected: false, message: "البوت لم يبدأ بعد" });
  }
  return res.json(global.messengerBot.getStatus());
});

router.post("/start", async (_req: Request, res: Response) => {
  if (global.messengerBot?.running) {
    return res.json({ success: false, message: "البوت يعمل بالفعل" });
  }

  try {
    const { MessengerBot } = await import("../bot/bot.js");
    const bot = new MessengerBot();

    bot.on("connected", () => {
      global.messengerBot = bot;
    });

    bot.on("error", (err: Error) => {
      console.error("Bot error:", err.message);
    });

    global.messengerBot = bot;
    bot.start();

    return res.json({ success: true, message: "تم بدء البوت" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/stop", (_req: Request, res: Response) => {
  if (!global.messengerBot) {
    return res.json({ success: false, message: "البوت لا يعمل" });
  }
  global.messengerBot.stop();
  global.messengerBot = null;
  return res.json({ success: true, message: "تم إيقاف البوت" });
});

router.post("/appstate", async (req: Request, res: Response) => {
  const { appstate } = req.body;

  if (!appstate) {
    return res.status(400).json({ success: false, message: "بيانات AppState مفقودة" });
  }

  let parsed: object;
  try {
    parsed = typeof appstate === "string" ? JSON.parse(appstate) : appstate;
  } catch {
    return res.status(400).json({ success: false, message: "صيغة AppState غير صحيحة" });
  }

  // Try to persist to file (may fail on read-only filesystems like Railway — that's OK)
  try {
    writeFileSync(APPSTATE_PATH, JSON.stringify(parsed, null, 2), "utf-8");
  } catch {
    // File write failed (read-only fs) — keep going, bot will use in-memory state
  }

  // Always update in-memory env var so the bot can read it if it restarts
  process.env["APPSTATE_JSON"] = JSON.stringify(parsed);

  if (global.messengerBot?.running) {
    // Bot is running — hot-update its appstate
    global.messengerBot.updateAppState(parsed);
    return res.json({ success: true, message: "تم تحديث AppState وإعادة الاتصال" });
  }

  // Bot is not running — start it now with the new appstate
  try {
    const { MessengerBot } = await import("../bot/bot.js");
    const bot = new MessengerBot();
    global.messengerBot = bot;
    bot.start().catch(() => {});
    return res.json({ success: true, message: "تم رفع AppState وبدء تشغيل البوت" });
  } catch (err: any) {
    return res.json({ success: true, message: "تم رفع AppState — أعد تشغيل البوت يدوياً" });
  }
});

router.get("/config", (_req: Request, res: Response) => {
  const config = loadConfig();
  return res.json({ success: true, config });
});

router.post("/config", (req: Request, res: Response) => {
  const updates = req.body;
  const allowed = [
    "prefix",
    "adminIDs",
    "botName",
    "autoReconnect",
    "reconnectDelay",
    "maxReconnectAttempts",
    "antiSpam",
    "antiSpamCooldown",
    "welcomeMessage",
    "enableGroupCommands",
    "enableAutoReply",
  ];

  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) {
      filtered[key] = updates[key];
    }
  }

  const updated = saveConfig(filtered);
  return res.json({ success: true, message: "تم تحديث الإعدادات", config: updated });
});

// GET /groups — return all registered groups from the in-memory registry
router.get("/groups", async (_req: Request, res: Response) => {
  try {
    const { getGroupList } = await import("../bot/commands.js");
    const groups = getGroupList();
    return res.json({ success: true, groups });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message, groups: [] });
  }
});

// POST /groups/command — execute a command remotely in a specific group
router.post("/groups/command", async (req: Request, res: Response) => {
  const { groupIndex, command } = req.body as { groupIndex: number; command: string };

  if (groupIndex === undefined || !command) {
    return res.status(400).json({ success: false, message: "groupIndex و command مطلوبان" });
  }

  if (!global.messengerBot) {
    return res.status(400).json({ success: false, message: "البوت غير مشغّل" });
  }

  try {
    const { getGroupList, getCommandByName } = await import("../bot/commands.js");
    const config = loadConfig();
    const groups = getGroupList();

    const group = groups[groupIndex];
    if (!group) {
      return res.status(400).json({ success: false, message: `لا يوجد غروب برقم ${groupIndex + 1}` });
    }

    const fullCmd = command.startsWith(config.prefix) ? command : `${config.prefix}${command}`;
    const parts = fullCmd.slice(config.prefix.length).trim().split(/\s+/);
    const cmdName = parts[0]?.toLowerCase() ?? "";
    const cmdArgs = parts.slice(1);

    const cmd = getCommandByName(cmdName);
    if (!cmd) {
      return res.status(400).json({ success: false, message: `الأمر "${cmdName}" غير معروف` });
    }

    const api = (global.messengerBot as any).api;
    if (!api) {
      return res.status(400).json({ success: false, message: "البوت غير متصل بعد" });
    }

    const { getGroupMembers } = await import("../bot/commands.js");
    const botUserID: string = (global.messengerBot as any).currentUserID ?? "";
    const groupMembers = getGroupMembers(group.threadID);

    await cmd.handler({
      api,
      event: { threadID: group.threadID, senderID: "dashboard", isGroup: true, body: fullCmd, mentions: {}, messageID: undefined },
      args: cmdArgs,
      threadID: group.threadID,
      senderID: "dashboard",
      isAdmin: true,
      botName: config.botName,
      botUserID,
      groupMembers,
    });

    return res.json({ success: true, message: `تم تنفيذ "${fullCmd}" في "${group.name}"` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /extract-cookies — login with email+pass, save resulting appstate (no bot required)
router.post("/extract-cookies", async (req: Request, res: Response) => {
  const body = req.body as { identifier?: string; password?: string };
  let identifier = body.identifier?.trim();
  let password = body.password;

  // Fall back to saved credentials if not supplied in request
  if (!identifier || !password) {
    const saved = loadCredentials();
    if (!saved) {
      return res.status(400).json({ success: false, message: "لا توجد بيانات دخول — أدخل الإيميل/الرقم وكلمة المرور" });
    }
    identifier = saved.identifier;
    password = saved.password;
  }

  try {
    const { login } = await import("@neoaz07/nkxfca");

    const appstate = await new Promise<object>((resolve, reject) => {
      login(
        { email: identifier, password },
        {
          online: false,
          selfListen: false,
          listenEvents: false,
          logging: false,
          autoReconnect: false,
        } as any,
        (err: any, api: any) => {
          if (err) return reject(err);
          try {
            const state = api.getAppState();
            resolve(state);
          } catch (e) {
            reject(e);
          }
        }
      );
    });

    saveAppState(appstate);

    // Also update live bot appstate if running
    if (global.messengerBot) {
      global.messengerBot.updateAppState(appstate);
    }

    return res.json({
      success: true,
      message: "✅ تم استخراج الكوكيز بنجاح وحفظها",
      cookieCount: Array.isArray(appstate) ? (appstate as any[]).length : Object.keys(appstate).length
    });
  } catch (err: any) {
    const msg = err?.message || "فشل تسجيل الدخول";
    const isCheckpoint = msg.includes("checkpoint") || msg.includes("Checkpoint");
    return res.status(500).json({
      success: false,
      message: isCheckpoint
        ? "🔒 الحساب محظور بـ Checkpoint — تحقق من حسابك عبر المتصفح أولاً"
        : `❌ ${msg}`
    });
  }
});

// GET /credentials - returns masked credentials (no password revealed)
router.get("/credentials", (_req: Request, res: Response) => {
  const creds = loadCredentials();
  if (!creds) {
    return res.json({ success: true, hasCredentials: false, identifier: "" });
  }
  return res.json({
    success: true,
    hasCredentials: true,
    identifier: creds.identifier,
  });
});

// POST /credentials - save email/phone + password
router.post("/credentials", (req: Request, res: Response) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ success: false, message: "الرجاء إدخال المعرّف وكلمة المرور" });
  }
  try {
    saveCredentials({ identifier: identifier.trim(), password });
    return res.json({ success: true, message: "تم حفظ بيانات الدخول بنجاح" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /credentials - clear saved credentials
router.delete("/credentials", (_req: Request, res: Response) => {
  try {
    clearCredentials();
    return res.json({ success: true, message: "تم مسح بيانات الدخول" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /credentials/login - manually trigger login with saved credentials
router.post("/credentials/login", async (_req: Request, res: Response) => {
  const creds = loadCredentials();
  if (!creds) {
    return res.status(400).json({ success: false, message: "لا توجد بيانات دخول محفوظة" });
  }
  if (!global.messengerBot) {
    return res.status(400).json({ success: false, message: "البوت غير مشغّل، ابدأ البوت أولاً" });
  }
  try {
    const ok = await global.messengerBot.loginWithCredentials(creds.identifier, creds.password);
    if (ok) {
      return res.json({ success: true, message: "تم تسجيل الدخول بنجاح وتجديد الـ AppState" });
    } else {
      return res.status(500).json({ success: false, message: "فشل تسجيل الدخول — تحقق من بيانات الحساب" });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
