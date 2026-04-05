import { env } from "@my-better-t-app/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";
import * as queries from "./queries";

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();

export { queries };
