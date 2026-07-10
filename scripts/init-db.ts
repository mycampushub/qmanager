import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'db', 'queueflow.db');
const SCHEMA_PATH = path.join(process.cwd(), 'schema.sql');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('Removed existing database');
}

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

console.log('Creating database at:', DB_PATH);

const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');

// Smart SQL splitter that handles BEGIN...END blocks (triggers)
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let current = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    // Skip comments
    if (char === '-' && sql[i + 1] === '-') {
      const endIdx = sql.indexOf('\n', i);
      if (endIdx === -1) break;
      current += sql.substring(i, endIdx + 1);
      i = endIdx;
      continue;
    }

    if (char === 'B' && sql.substring(i, i + 5) === 'BEGIN') {
      depth++;
    }
    if (char === 'E' && sql.substring(i, i + 3) === 'END') {
      depth--;
    }

    current += char;

    if (char === ';' && depth <= 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    }
  }

  return statements;
}

const statements = splitSqlStatements(schema);
console.log(`Parsed ${statements.length} SQL statements`);

let executed = 0;
for (const stmt of statements) {
  try {
    db.exec(stmt);
    executed++;
  } catch (err) {
    console.error(`Error executing statement ${executed + 1}:`, err);
    console.error('Statement:', stmt.substring(0, 300) + '...');
    process.exit(1);
  }
}

console.log(`Executed ${executed} SQL statements`);

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
console.log(`\nCreated ${tables.length} tables:`);
tables.forEach(t => console.log(`  - ${t.name}`));

const planCount = db.prepare('SELECT COUNT(*) as cnt FROM plan_limits').get() as { cnt: number };
console.log(`\nSeed data: ${planCount.cnt} plan tiers`);

db.close();
console.log('\nDatabase initialized successfully!');