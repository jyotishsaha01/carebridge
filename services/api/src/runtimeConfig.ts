/** Fail before listening when a production process is given a local/demo database. */
export function assertProductionDatabaseUrl(production: boolean, configuredUrl?: string) {
  if (!production) return;
  try {
    const url = new URL(configuredUrl ?? "");
    if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  } catch {
    // Never include the supplied URL: it may contain database credentials.
    throw new Error("An explicit PostgreSQL DATABASE_URL is required in production");
  }
}
