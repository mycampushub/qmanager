import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const ROOT = path.resolve(__dirname, '..')

function log(msg: string) {
  console.log(`[Setup] ${msg}`)
}

async function main() {
  const dbDir = path.join(ROOT, 'db', 'main')
  const templateDir = path.join(ROOT, 'db')
  const templatePath = path.join(templateDir, 'template.db')

  // Create directories
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
    log(`Created directory: ${dbDir}`)
  }

  const queueflowDbPath = path.join(dbDir, 'queueflow.db')

  // Push schema to main database
  log('Pushing schema to main database...')
  execSync(`npx prisma db push --skip-generate`, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:${queueflowDbPath}` },
    stdio: 'inherit',
  })
  log('Main database ready.')

  // Create template database (clean schema without data)
  log('Creating template database for new tenants...')
  if (fs.existsSync(templatePath)) {
    fs.unlinkSync(templatePath)
    log(`Removed old template: ${templatePath}`)
  }

  execSync(`npx prisma db push --skip-generate`, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:${templatePath}` },
    stdio: 'inherit',
  })

  // Verify the template was created
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template database was not created at ${templatePath}`)
  }
  const templateSize = fs.statSync(templatePath).size
  log(`Template database ready: ${templatePath} (${templateSize} bytes)`)

  log('')
  log('Setup complete!')
  log('  - Main database: db/main/queueflow.db')
  log('  - Template database: db/template.db')
  log('')
  log('Next step: Run `bun scripts/migrate-tenant-dbs.ts` to migrate existing data.')
  log('Or run `bun run dev` to start fresh (new tenants will auto-create databases).')
}

main().catch((err) => {
  console.error('[Setup] FAILED:', err)
  process.exit(1)
})
