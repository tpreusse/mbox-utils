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

const split = require('split')
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

let messageParser
let emlWriteStream
let emptyLine = true
let messageId
let emlTmpFile

const endMessage = () => {
  if (messageParser) {
    messageParser.end()
  }
  if (emlWriteStream) {
    if (!messageId) {
      console.error('no message id', messageId)
    }
    let rename = [
      emlTmpFile,
      `${messageId}.eml`
    ]
    emlWriteStream.on('close', () => {
      process.stdout.write(',')
      fs.rename(
        path.join(outDir, rename[0]),
        path.join(outDir, rename[1]),
        fsErrorHandler
      )
    })
    emlWriteStream.end()
  }
}

fsStream
  .pipe(split())
  .on('data', line => {
    const newMessage = line.startsWith('From ') && emptyLine
    if (newMessage) {
      endMessage()

      messageParser = new MailParser()
      messageParser.on('headers', data => {
        messageId = (
          data.get('message-id') ||
          crypto.createHash('md5')
            .update(JSON.stringify([...data]))
            .digest('hex')
        ).replace(/\//g, '-').replace(/^<|>$/g, '')
      })

      emlTmpFile = `${uuidv4()}.tmp.eml`
      emlWriteStream = fs.createWriteStream(path.join(outDir, emlTmpFile))
      emlWriteStream.on('error', fsErrorHandler)
      messageId = undefined
    }

    const chunk = newMessage
      ? line
      : `\n${line}`

    messageParser.write(chunk, 'utf8')
    emlWriteStream && emlWriteStream.write(chunk,  'utf8')

    if (!line.length) {
      emptyLine = true
    } else {
      emptyLine = false
    }
  })
  .on('end', () => {
    endMessage()
  })

process.on('exit', () => {
  console.log('\n')
})
