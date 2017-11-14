// node defaults to max 1GB memory
// if you see
//   FATAL ERROR: JS Allocation failed - process out of memory
// use
//   node --max-old-space-size=8000
// to increase, measured in mb

const fs = require('fs')
const path = require('path')

const program = require('commander')

const { version } = require('./package.json')

program
  .version(version)
  .usage('[options] <file>')
  .option('-s, --slave', 'silent mode, only report to master')
  .option('-o, --out [value]', 'out dir')
  .parse(process.argv)

if (program.args.length !== 1) {
  console.error('need exactly one file to extract')
  process.exit(1)
}

const Mbox = require('node-mbox')
const digestStream = require('digest-stream')
const uuidv4 = require('uuid/v4')

const outDir = program.out || __dirname

const fsErrorHandler = err => {
  if (err) {
    console.error('fs error', err)
    process.exit(1)
  }
}

const mbox = program.args[0]

!program.slave && console.log(
`Processed Legend:
  , file written

Mbox: ${mbox}
`)


const fsStream = fs.createReadStream(mbox)

fsStream.on('error', fsErrorHandler)

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir)
}

const mboxSplit = new Mbox({
  stream: true
})

fsStream
  .pipe(mboxSplit)
  .on('message', stream => {
    let sha
    const emlTmpFile = `${uuidv4()}.tmp.eml`
    const emlWriteStream = fs.createWriteStream(path.join(outDir, emlTmpFile))
    emlWriteStream.on('error', fsErrorHandler)
    emlWriteStream.on('close', () => {
      process.stdout.write(',')
      if (!sha) {
        console.error('no sha', sha)
      }
      fs.rename(
        path.join(outDir, emlTmpFile),
        path.join(outDir, `${sha}.eml`),
        fsErrorHandler
      )
    })
    stream
      .pipe(digestStream('sha256', 'hex', digest => {
        sha = digest
      }))
      .pipe(emlWriteStream)
  })

process.on('exit', () => {
  console.log('\n')
})
