// node defaults to max 1GB memory
// if you see
//   FATAL ERROR: JS Allocation failed - process out of memory
// use
//   node --max-old-space-size=8000
// to increase, measured in mb

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const program = require('commander')

const { version } = require('./package.json')

program
  .version(version)
  .usage('[options] <file>')
  .option('-e, --eml', 'dump eml files')
  .option('-s, --slave', 'silent mode, only report to master')
  .option('-o, --out [value]', 'out dir')
  .parse(process.argv)

if (program.args.length !== 1) {
  console.error('need exactly one file to extract')
  process.exit(1)
}

const Mbox = require('node-mbox')
const { MailParser } = require('mailparser')
const uuidv4 = require('uuid/v4')

const {
  eml: dumpEml = false,
} = program

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
  , eml dump

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
    const messageParser = new MailParser()
    let messageId
    messageParser.on('headers', data => {
      messageId = (
        data.get('message-id') ||
        crypto.createHash('md5')
          .update(JSON.stringify([...data]))
          .digest('hex')
      ).replace(/\//g, '-').replace(/^<|>$/g, '')
    })

    const emlTmpFile = `${uuidv4()}.tmp.eml`
    const emlWriteStream = fs.createWriteStream(path.join(outDir, emlTmpFile))
    emlWriteStream.on('error', fsErrorHandler)
    emlWriteStream.on('close', () => {
      process.stdout.write(',')
      if (!messageId) {
        console.error('no message id', messageId)
      }
      fs.rename(
        path.join(outDir, emlTmpFile),
        path.join(outDir, `${messageId}.eml`),
        fsErrorHandler
      )
    })
    stream.on('data', chunk => {
      messageParser.write(chunk, 'utf8')
      emlWriteStream.write(chunk,  'utf8')
    })
    stream.on('end', () => {
      messageParser.end()
      emlWriteStream.end()
    })
  })

process.on('exit', () => {
  console.log('\n')
})
