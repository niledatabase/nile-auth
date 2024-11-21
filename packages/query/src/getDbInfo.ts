import { Logger } from "@nile-auth/logger";

const { debug } = Logger("[getDbInfo]");

export type DbCreds = {
  port: number;
  user: string;
  password: string;
  host: string;
  database: string;
};

const getUser = (config?: Partial<DbCreds>) => {
  if (process.env.NILEDB_USER) {
    return process.env.NILEDB_USER;
  }
  return config?.user;
};

const getPassword = (config?: Partial<DbCreds>) => {
  if (process.env.NILEDB_PASSWORD) {
    return process.env.NILEDB_PASSWORD;
  }
  return config?.password;
};

const getHost = (config?: Partial<DbCreds>) => {
  if (process.env.NILEDB_HOST) {
    return process.env.NILEDB_HOST;
  }
  return config?.host;
};

const getDatabase = (config?: Partial<DbCreds>, req?: Request) => {
  if (process.env.NILEDB_NAME) {
    return process.env.NILEDB_NAME;
  }
  if (config?.database) {
    return config.database;
  }
  if (req) {
    const _url = new URL(req.url);
    // /v2/databases/[database]
    return _url.pathname.split("/")[2];
  }
};

const getPort = (config?: Partial<DbCreds>) => {
  if (process.env.NILEDB_PORT) {
    return Number(process.env.NILEDB_PORT);
  }

  return config?.port ?? 5432;
};

export default function getDbInfo(
  config?: Partial<DbCreds>,
  req?: Request,
): DbCreds {
  const user = getUser(config);
  const password = getPassword(config);
  const host = getHost(config);
  const database = getDatabase(config, req);
  const port = getPort(config);

  if (!user) {
    throw new Error("Server is missing process.env.NILEDB_USER");
  }

  if (!password) {
    throw new Error("Server is missing process.env.NILEDB_PASSWORD");
  }

  if (!host) {
    throw new Error("Server is missing process.env.NILEDB_HOST");
  }

  if (!database) {
    throw new Error("Server is missing process.env.NILEDB_NAME");
  }

  const dbInfo = {
    port,
    user,
    password,
    database,
    host,
  };
  debug(`connecting using ${JSON.stringify(dbInfo)}`);

  return dbInfo;
}
