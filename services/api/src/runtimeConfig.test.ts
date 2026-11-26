import { describe, expect, it } from "vitest";
import { assertProductionDatabaseUrl } from "./runtimeConfig";

describe("production database boundary", () => {
  it.each([undefined, "", "file:./dev.db", "sqlite://local/demo", "https://db.example.test/carebridge", "postgresql://db.example.test/"])("rejects missing, local or invalid production database configuration", (value) => {
    expect(() => assertProductionDatabaseUrl(true, value)).toThrow("An explicit PostgreSQL DATABASE_URL is required in production");
  });
  it("does not echo credentials from rejected configuration", () => {
    expect(() => assertProductionDatabaseUrl(true, "https://operator:private-db-password@db.example.test/carebridge")).toThrow(/^An explicit PostgreSQL DATABASE_URL is required in production$/);
  });
  it.each(["postgresql://operator:password@db.example.test/carebridge?sslmode=require", "postgres://operator@127.0.0.1:5432/synthetic"])("permits an explicit PostgreSQL connection without contacting it", (value) => {
    expect(() => assertProductionDatabaseUrl(true, value)).not.toThrow();
  });
  it("preserves the local SQLite development path", () => {
    expect(() => assertProductionDatabaseUrl(false)).not.toThrow();
    expect(() => assertProductionDatabaseUrl(false, "file:./dev.db")).not.toThrow();
  });
});
