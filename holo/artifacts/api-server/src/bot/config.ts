import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// After bundling into dist/index.mjs, __dirname = .../artifacts/api-server/dist
// "../" goes up one level → .../artifacts/api-server/ (correct)
const CONFIG_PATH = path.resolve(__dirname, "../bot-config.json");
const APPSTATE_PATH = path.resolve(__dirname, "../appstate.json");
const CREDENTIALS_PATH = path.resolve(__dirname, "../bot-credentials.json");

export interface BotCredentials {
  identifier: string;
  password: string;
}

export function loadCredentials(): BotCredentials | null {
  if (!existsSync(CREDENTIALS_PATH)) return null;
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.identifier || !parsed.password) return null;
    return parsed as BotCredentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: BotCredentials): void {
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), "utf-8");
}

export function clearCredentials(): void {
  if (existsSync(CREDENTIALS_PATH)) {
    writeFileSync(CREDENTIALS_PATH, JSON.stringify({ identifier: "", password: "" }, null, 2), "utf-8");
  }
}

export interface BotConfig {
  prefix: string;
  adminIDs: string[];
  botName: string;
  language: string;
  autoReconnect: boolean;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  appstatePath: string;
  logLevel: string;
  enableGroupCommands: boolean;
  enableAutoReply: boolean;
  welcomeMessage: boolean;
  antiSpam: boolean;
  antiSpamCooldown: number;
  locked: boolean;
}

const DEFAULT_CONFIG: BotConfig = {
  prefix: "/",
  adminIDs: [],
  botName: "مساعد المجموعات",
  language: "ar",
  autoReconnect: true,
  reconnectDelay: 5000,
  maxReconnectAttempts: 10,
  appstatePath: APPSTATE_PATH,
  logLevel: "info",
  enableGroupCommands: true,
  enableAutoReply: true,
  welcomeMessage: true,
  antiSpam: true,
  antiSpamCooldown: 3000,
  locked: false,
};

export function loadConfig(): BotConfig {
  if (!existsSync(CONFIG_PATH)) {
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    } catch {
      // read-only filesystem — that's fine
    }
    return DEFAULT_CONFIG;
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const fromFile = JSON.parse(raw);
  // Always use computed APPSTATE_PATH — never trust a hardcoded path from the file
  return { ...DEFAULT_CONFIG, ...fromFile, appstatePath: APPSTATE_PATH };
}

export function saveConfig(config: Partial<BotConfig>): BotConfig {
  const current = loadConfig();
  const updated = { ...current, ...config };
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch {
    // read-only filesystem
  }
  return updated;
}

export function loadAppState(): object | null {
  // Always use the dynamically computed path — never rely on config file's path
  const appstatePath = APPSTATE_PATH;

  // 1. Try loading from file
  if (existsSync(appstatePath)) {
    try {
      const raw = readFileSync(appstatePath, "utf-8");
      const parsed = JSON.parse(raw.trim());
      return parsed;
    } catch (e) {
      console.error("[config] appstate.json found but failed to parse:", e);
    }
  }

  // 2. Fall back to APPSTATE_JSON environment variable
  const envAppstate = process.env["APPSTATE_JSON"];
  if (envAppstate) {
    try {
      const parsed = JSON.parse(envAppstate.trim());
      return parsed;
    } catch (e) {
      console.error("[config] APPSTATE_JSON env var set but failed to parse:", e);
      return null;
    }
  }

  return null;
}

export function saveAppState(appstate: object): void {
  try {
    writeFileSync(APPSTATE_PATH, JSON.stringify(appstate, null, 2), "utf-8");
  } catch {
    // read-only filesystem (e.g. Railway) — that's OK
  }
}
