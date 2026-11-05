/**
 * Minimal logging seam: library code reports progress and warnings here instead of calling
 * `console` directly, so tests can silence or capture output and a future CLI can add levels.
 */
export type LogSink = {
  info(message: string): void;
  warn(message: string): void;
};

const consoleSink: LogSink = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

let sink: LogSink = consoleSink;

export const log: LogSink = {
  info: (message) => sink.info(message),
  warn: (message) => sink.warn(message),
};

/** Replace the sink (tests); returns a function that restores the previous one. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}
