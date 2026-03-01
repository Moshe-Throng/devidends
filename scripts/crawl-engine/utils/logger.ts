/**
 * Structured logger for the crawl engine.
 * Prefixes all output with source ID for easy filtering.
 */

export function createLogger(sourceId: string) {
  const tag = `[${sourceId}]`;
  return {
    info: (...args: unknown[]) => console.log(tag, ...args),
    warn: (...args: unknown[]) => console.warn(tag, "WARN:", ...args),
    error: (...args: unknown[]) => console.error(tag, "ERROR:", ...args),
    debug: (...args: unknown[]) => {
      if (process.env.DEBUG) console.log(tag, "DEBUG:", ...args);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
