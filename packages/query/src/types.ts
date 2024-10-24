export type LogType = (
  message: string,
  meta?: Record<string, string | number | BodyInit | object | boolean>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => any;

export type LoggerType = {
  debug: LogType;
  info: LogType;
  error: LogType;
};
