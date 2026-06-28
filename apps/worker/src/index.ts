import 'dotenv/config'

// TODO: bullmq worker + the 3-step pipeline
async function main() {
  console.log('worker booting...')
}

main().catch((err) => {
  console.error('worker crashed on startup', err)
  process.exit(1)
})
