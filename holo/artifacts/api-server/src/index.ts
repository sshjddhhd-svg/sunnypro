import app from "./app";
import { logger } from "./lib/logger";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.mjs → __dirname = .../api-server/dist → "../" = .../api-server/
  const expectedAppstatePath = path.resolve(__dirname, "../appstate.json");
  const hasFile = existsSync(expectedAppstatePath);
  const hasEnvVar = !!process.env["APPSTATE_JSON"];

  logger.info(
    {
      expectedAppstatePath,
      fileExists: hasFile,
      envVarSet: hasEnvVar,
      envVarLength: process.env["APPSTATE_JSON"]?.length ?? 0,
      nodeEnv: process.env["NODE_ENV"] ?? "unknown",
    },
    "AppState diagnostic"
  );

  const { loadAppState } = await import("./bot/config.js");
  const appstate = loadAppState();

  if (appstate) {
    logger.info("AppState found — auto-starting Messenger bot...");
    try {
      const { MessengerBot } = await import("./bot/bot.js");
      const bot = new MessengerBot();
      bot.on("connected", () => {
        logger.info("Messenger bot connected!");
      });
      bot.on("error", (err: Error) => {
        logger.error({ err: err.message }, "Messenger bot error");
      });
      bot.on("reconnecting", (count: number) => {
        logger.warn({ count }, "Messenger bot reconnecting...");
      });
      bot.on("max_reconnect_reached", () => {
        logger.error("Messenger bot: max reconnect attempts reached");
      });
      (global as any).messengerBot = bot;
      await bot.start();
    } catch (botErr: any) {
      logger.warn({ err: botErr.message }, "Could not start Messenger bot");
    }
  } else {
    logger.error(
      {
        checkedPath: expectedAppstatePath,
        fileFound: hasFile,
        envVarFound: hasEnvVar,
        hint: !hasEnvVar
          ? "Set APPSTATE_JSON environment variable in Railway"
          : "APPSTATE_JSON is set but JSON.parse failed — check for invalid JSON",
      },
      "No AppState found — bot not started"
    );
  }
});
