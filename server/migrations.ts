import fs from "node:fs";
import path from "node:path";

import { db } from "./db/index.js";

await migrate();

async function migrate() {
  const user_version = db.pragma("user_version", { simple: true }) as number;

  const migrationsPath = path.resolve(process.cwd(), "migrations");
  const migrations = fs
    .readdirSync(migrationsPath)
    .filter((f) => f.match(/^\d+.+\.sql/))
    .map((f) => ({ file: f, version: extractMigrationVersion(f) }))
    .filter((m): m is typeof m & { version: number } => !!m.version)
    .filter((m) => m.version > user_version)
    .toSorted((a, b) => a.version - b.version);

  if (migrations.length) {
    if (user_version > 0 && !db.memory) {
      const backupPath =
        db.name + `.${new Date().toISOString().replace(/[^0-9TZ.]/g, "-")}.bkp`;

      await db.backup(backupPath);
      console.log("database backup: %s", backupPath);
    }

    for (const migration of migrations) {
      console.log("running migration: %s", migration.file);
      db.exec(
        fs.readFileSync(path.join(migrationsPath, migration.file), "utf8"),
      );
      db.pragma(`user_version = ${migration.version}`);
    }
  }
}

function extractMigrationVersion(name: string) {
  const [paddedVersion] = name.match(/^\d+/) ?? [];

  if (!paddedVersion) {
    return null;
  }

  return parseInt(paddedVersion, 10);
}
