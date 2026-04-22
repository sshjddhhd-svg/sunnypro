import { login, type NkxfcaAPI } from "@neoaz07/nkxfca";
import { EventEmitter } from "events";
import { loadConfig, loadAppState, saveAppState, saveConfig, loadCredentials } from "./config.js";
import { getCommandByName, clearAllActiveIntervals, registerGroup, touchGroup, isGroupKnown, addGroupMember, addGroupMembers, removeGroupMember, getGroupMembers } from "./commands.js";
import { logger } from "../lib/logger.js";

export class MessengerBot extends EventEmitter {
  private api: NkxfcaAPI | null = null;
  private reconnectCount: number = 0;
  private reconnecting: boolean = false;
  private spamMap: Map<string, number> = new Map();
  private running: boolean = false;
  private appstate: object | null = null;
  private currentUserID: string | null = null;
  private spamCleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    // FIX: Clean spamMap every 10 minutes to prevent memory leak
    this.spamCleanupTimer = setInterval(() => {
      const config = loadConfig();
      const cutoff = Date.now() - config.antiSpamCooldown * 10;
      for (const [uid, ts] of this.spamMap.entries()) {
        if (ts < cutoff) this.spamMap.delete(uid);
      }
      if (this.spamMap.size > 0) {
        logger.info({ size: this.spamMap.size }, "spamMap cleanup done");
      }
    }, 10 * 60 * 1000);
  }

  async start(): Promise<void> {
    this.running = true;
    this.reconnectCount = 0;
    await this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.spamCleanupTimer) {
      clearInterval(this.spamCleanupTimer);
      this.spamCleanupTimer = null;
    }
    // FIX: Clear all command intervals before stopping
    clearAllActiveIntervals();
    if (this.api) {
      try {
        this.api.stopListening();
      } catch {}
    }
    this.api = null;
    logger.info("Bot stopped.");
  }

  private buildLoginOptions() {
    return {
      online: true,
      selfListen: false,
      listenEvents: true,
      autoMarkDelivery: false,
      autoMarkRead: false,
      autoReconnect: true,
      simulateTyping: true,
      randomUserAgent: false,
      persona: "desktop" as const,
      maxConcurrentRequests: 5,
      maxRequestsPerMinute: 50,
      logging: false,
    };
  }

  private onApiReady(api: NkxfcaAPI): void {
    this.api = api;
    this.currentUserID = api.getCurrentUserID();
    try { saveAppState(api.getAppState()); } catch {}
    logger.info({ userID: this.currentUserID }, "Connected to Messenger via nkxfca!");
    this.emit("connected", this.currentUserID);
    this.reconnectCount = 0;
    this.syncAllGroups();
    this.startListening();
  }

  /** جلب كل الغروبات التي البوت فيها فور الاتصال وتسجيلها دفعةً واحدة */
  private async syncAllGroups(): Promise<void> {
    if (!this.api) return;
    logger.info("Starting group sync from thread list...");

    let timestamp: number | null = null;
    let totalRegistered = 0;

    try {
      while (true) {
        // getThreadList returns a Promise (async API in nkxfca)
        const threads: any[] = await (this.api as any).getThreadList(30, timestamp, ["INBOX"]);

        if (!Array.isArray(threads) || threads.length === 0) break;

        let oldest: number | null = null;
        for (const t of threads) {
          if (t.isGroup && t.threadID) {
            registerGroup(
              t.threadID,
              t.name ?? t.threadName ?? t.threadID,
              t.participantIDs?.length ?? 0,
            );
            // Populate member cache from thread list (reliable — no getThreadInfo needed)
            if (Array.isArray(t.participantIDs)) {
              addGroupMembers(t.threadID, t.participantIDs);
            }
            totalRegistered++;
          }
          const ts = Number(t.timestamp ?? t.lastMessageTimestamp ?? 0);
          if (ts && (oldest === null || ts < oldest)) oldest = ts;
        }

        logger.info({ page: threads.length, registered: totalRegistered }, "Group sync page fetched");

        if (threads.length < 30 || !oldest) break;
        timestamp = oldest;
      }

      logger.info({ registered: totalRegistered }, "Group sync complete");
    } catch (err: any) {
      logger.error({ err: err?.message ?? String(err) }, "Group sync failed");
    }
  }

  private async connect(): Promise<void> {
    this.appstate = loadAppState();
    const credentials = loadCredentials();

    // If no appstate but credentials available → try password login directly
    if (!this.appstate && credentials) {
      logger.info("No appstate found — trying login with saved credentials...");
      await this.loginWithCredentials(credentials.identifier, credentials.password);
      return;
    }

    if (!this.appstate) {
      logger.error(
        "No appstate found. " +
        "On Railway: set the APPSTATE_JSON environment variable to your cookies JSON (minified, single line). " +
        "Or POST to /api/bot/appstate with {appstate: [...]} to upload cookies at runtime."
      );
      this.emit("error", new Error("No appstate.json found"));
      return;
    }

    logger.info("Connecting to Messenger using @neoaz07/nkxfca...");

    try {
      await new Promise<void>((resolve, reject) => {
        login({ appState: this.appstate as object }, this.buildLoginOptions(), (err: any, api: NkxfcaAPI) => {
          if (err) { reject(err); return; }
          this.onApiReady(api);
          resolve();
        });
      });
    } catch (err: any) {
      const isCheckpoint = err.message?.includes("checkpoint") || err.error === "checkpoint_956";
      logger.error({ err: err.message }, "Failed to connect to Messenger");

      // Auto-relogin with credentials if checkpoint detected
      if (isCheckpoint && credentials) {
        logger.warn("Checkpoint detected — attempting auto-relogin with saved credentials...");
        this.emit("checkpoint", err);
        await this.loginWithCredentials(credentials.identifier, credentials.password);
        return;
      }

      this.emit("error", err);
      await this.tryReconnect();
    }
  }

  async loginWithCredentials(identifier: string, password: string): Promise<boolean> {
    logger.info({ identifier: identifier.replace(/./g, "*").slice(0, 6) + "***" }, "Logging in with credentials...");
    try {
      await new Promise<void>((resolve, reject) => {
        login({ email: identifier, password }, this.buildLoginOptions(), (err: any, api: NkxfcaAPI) => {
          if (err) { reject(err); return; }
          this.onApiReady(api);
          resolve();
        });
      });
      logger.info("Credentials login successful — new appstate saved.");
      return true;
    } catch (err: any) {
      logger.error({ err: err.message }, "Credentials login failed");
      this.emit("error", err);
      await this.tryReconnect();
      return false;
    }
  }

  private startListening(): void {
    if (!this.api) return;

    this.api.listenMqtt((err: any, event: any) => {
      if (err) {
        logger.error({ err: err.message ?? err }, "MQTT listener error");
        this.emit("mqttError", err);
        if (!this.reconnecting) {
          this.tryReconnect();
        }
        return;
      }

      if (!event) return;

      const type: string = event.type ?? "";

      logger.info({ type, threadID: event.threadID, body: event.body?.substring?.(0, 50) }, "MQTT event received");

      if (type === "message" || type === "message_reply") {
        this.handleMessage(event);
      } else if (type === "event") {
        this.handleGroupEvent(event);
      }
    });
  }

  private isSpamming(senderID: string): boolean {
    const config = loadConfig();
    if (!config.antiSpam) return false;
    const last = this.spamMap.get(senderID);
    const now = Date.now();
    if (last && now - last < config.antiSpamCooldown) return true;
    this.spamMap.set(senderID, now);
    return false;
  }

  private async handleMessage(event: any): Promise<void> {
    const config = loadConfig();
    const { threadID, senderID, body, isGroup } = event;
    const text: string = (body ?? "").trim();

    logger.info({ text, prefix: config.prefix, threadID, senderID, isGroup }, "handleMessage called");

    // Auto-register groups and track members from every incoming message
    if (isGroup && this.api) {
      if (!touchGroup(threadID)) {
        registerGroup(threadID, threadID, 0);
      }
      // Track sender in member cache (builds organically without getThreadInfo)
      addGroupMember(threadID, senderID);
    }

    if (!text) return;
    if (!text.startsWith(config.prefix)) return;

    logger.info({ text }, "Command detected, processing...");

    const isAdmin = config.adminIDs.includes(senderID);

    if (config.locked && !isAdmin) {
      logger.info({ senderID }, "Bot is locked, ignoring non-admin user");
      return;
    }

    if (this.isSpamming(senderID)) {
      this.api!.sendMessage("⏳ يرجى الانتظار قبل إرسال أمر آخر", threadID, (err: any) => {
        if (err) logger.error({ err: err.message ?? err }, "sendMessage error (spam)");
      });
      return;
    }

    const parts = text.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = parts[0]?.toLowerCase() ?? "";
    const args = parts.slice(1);

    const command = getCommandByName(commandName);
    if (!command) {
      logger.info({ commandName }, "Unknown command");
      this.api!.sendMessage(
        `❓ الأمر "${commandName}" غير معروف.\nاكتب ${config.prefix}help لعرض الأوامر`,
        threadID,
        (err: any) => { if (err) logger.error({ err: err.message ?? err }, "sendMessage error (unknown cmd)"); }
      );
      return;
    }

    if (command.groupOnly && !isGroup) {
      this.api!.sendMessage("⛔ هذا الأمر يعمل في المجموعات فقط", threadID);
      return;
    }

    if (command.adminOnly && !isAdmin) {
      this.api!.sendMessage("⛔ هذا الأمر للمشرفين فقط", threadID);
      return;
    }

    try {
      logger.info({ commandName, threadID }, "Executing command");
      await command.handler({
        api: this.api,
        event,
        args,
        threadID,
        senderID,
        isAdmin,
        botName: config.botName,
        botUserID: this.currentUserID ?? "",
        groupMembers: getGroupMembers(threadID),
      });
      logger.info({ commandName }, "Command executed successfully");
    } catch (err: any) {
      logger.error({ err: err.message, command: commandName }, "Command error");
      this.api!.sendMessage(
        `❌ حدث خطأ أثناء تنفيذ الأمر: ${err.message ?? "خطأ غير معروف"}`,
        threadID
      );
    }
  }

  private handleGroupEvent(event: any): void {
    const config = loadConfig();
    if (config.locked) return;

    if (event.logMessageType === "log:subscribe") {
      const addedParticipants: any[] = event.logMessageData?.addedParticipants ?? [];
      for (const p of addedParticipants) {
        const id: string = p.userFbId ?? p.id ?? "";
        if (!id) continue;

        // Track new member in cache
        addGroupMember(event.threadID, id);

        // If the bot itself was added → register group + set nickname
        if (id === this.currentUserID && this.api) {
          registerGroup(event.threadID, event.threadID, 0);

          const botNickname = "⋡ 𝖑͟𝐞͟𝖌͟𝐞͟𝖓͟𝐝͟𝖗͟𝐲 ⩙ 𝖍𝖔𝖑̮𝖔 ‹🇵🇬›";
          (this.api as any).nickname(botNickname, event.threadID, this.currentUserID, (err: any) => {
            if (err) logger.error({ err: err?.message ?? err }, "Failed to set bot nickname");
            else logger.info({ threadID: event.threadID }, "Bot nickname set successfully");
          });
        }
      }

      if (config.welcomeMessage) {
        for (const p of addedParticipants) {
          const id: string = p.userFbId ?? p.id ?? "";
          if (!id || id === this.currentUserID) continue;
          this.api?.sendMessage(
            `👋 مرحباً بك في المجموعة!\n🤖 أنا ${config.botName}\nاكتب ${config.prefix}help لعرض الأوامر`,
            event.threadID
          );
        }
      }
    }

    if (event.logMessageType === "log:unsubscribe") {
      // Remove departed member from cache
      const leftParticipants: any[] = event.logMessageData?.leftParticipants ?? [];
      for (const p of leftParticipants) {
        const id: string = p.userFbId ?? p.id ?? "";
        if (id) removeGroupMember(event.threadID, id);
      }
      if (config.welcomeMessage) {
        this.api?.sendMessage("👋 وداعاً! نتمنى أن نراك مجدداً", event.threadID);
      }
    }
  }

  private async tryReconnect(): Promise<void> {
    if (!this.running) return;
    const config = loadConfig();
    if (!config.autoReconnect) return;
    if (this.reconnecting) return;

    this.reconnecting = true;
    this.reconnectCount++;

    // FIX: Clear orphaned intervals on every disconnect
    clearAllActiveIntervals();

    // FIX: Infinite reconnect — reset counter after max attempts instead of stopping
    if (this.reconnectCount > config.maxReconnectAttempts) {
      logger.warn({ attempt: this.reconnectCount }, "Max reconnect attempts reached — resetting counter and retrying indefinitely");
      this.reconnectCount = 1;
      this.emit("max_reconnect_reached");
    }

    const delay = Math.min(config.reconnectDelay * this.reconnectCount, 60000);
    logger.info({ attempt: this.reconnectCount, delayMs: delay }, "Reconnecting...");
    this.emit("reconnecting", this.reconnectCount);

    await new Promise((res) => setTimeout(res, delay));
    this.reconnecting = false;
    await this.connect();
  }

  updateAppState(newAppState: object): void {
    saveAppState(newAppState);
    this.appstate = newAppState;
    logger.info("AppState updated. Restart bot to apply new session.");
  }

  getStatus(): object {
    const config = loadConfig();
    let healthStatus: object | null = null;
    try {
      healthStatus = this.api?.getHealthStatus() ?? null;
    } catch {}

    return {
      running: this.running,
      connected: this.api !== null,
      userID: this.currentUserID,
      reconnectCount: this.reconnectCount,
      hasAppState: this.appstate !== null,
      health: healthStatus,
      config: {
        prefix: config.prefix,
        botName: config.botName,
        adminIDs: config.adminIDs,
        autoReconnect: config.autoReconnect,
        antiSpam: config.antiSpam,
        welcomeMessage: config.welcomeMessage,
        locked: config.locked,
      },
    };
  }
}
