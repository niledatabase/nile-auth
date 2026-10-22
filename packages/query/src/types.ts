export type LogType = (
  message: string,
  meta?: Record<string, string | number | BodyInit | object | boolean>,
) => any;

export type LoggerType = {
  debug: LogType;
  info: LogType;
  error: LogType;
  warn: LogType;
};

export type ErrorResultSet = {
  cmd: string;
  code: string;
  file: string;
  length: number;
  line: string;
  message: string;
  name: "error";
  position: string;
  routine: string;
  severity: "ERROR";
  lineNumber: string;
};
