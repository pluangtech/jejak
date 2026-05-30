import pino from "pino";

export function createLogger(name = "jejak") {
  return pino({
    name,
    level: process.env.JEJAK_LOG_LEVEL ?? "info",
  });
}
