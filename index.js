const fs = require('fs')
const path = require('path')
const program = require('commander')
const mkdirp = require('mkdirp')
const { queue } = require('d3-queue')
const os = require('os')
const { spawn } = require('child_process')
const throttle = require('lodash.throttle')
const { version } = require('./package.json')

program
  .version(version)
  .usage('[options] <file ...>')
  .option('-c, --concurrency <n>', 'number of readpst cmds', parseInt)
  .option('-r, --recursive', 'recursive extract')
  .option('-o, --out [value]', 'out dir')
  .parse(process.argv)

const cores = os.cpus().length

console.log(`${cores} available cpu cores`)

const concurrency = program.concurrency || cores * 2 - 1
const cmdQueue = queue(concurrency)

console.log(`Running ${concurrency} concurrent cmds.`)

const getFiles = files => (files || []).reduce(
  (all, inputFile) => {
    if (fs.statSync(inputFile).isDirectory()) {
      return all.concat(
        getFiles(
          fs.readdirSync(inputFile)
            .map(file => path.join(inputFile, file))
        )
      )
    }
    return all.concat(inputFile)
  },
  []
)

const files = getFiles(program.args).map(file => path.resolve(file))

if (!files.length) {
  console.error('no files provided')
  process.exit(1)
}

const commonSegments = []
const fileSegments = files
  .concat(program.args.map(file => path.resolve(file)))
  .map(file => file.split(path.sep))
let i = 0
let segment = ''
while (segment !== undefined && fileSegments.every(s => s[i] === segment)) {
  commonSegments.push(segment)
  i += 1
  segment = fileSegments[0][i]
}
const basePath = commonSegments.join(path.sep).trim()

const extractors = {
  mbox: (file, fileOutDir) => {
    return spawn('node', [
      '--max-old-space-size=4000',
      'extract-mbox',
      '-s',
      '-e', // dump eml
      // '-p', // dump plain text
      // '-a', // dump attachments
      '-o', fileOutDir,
      file
    ])
  },
  textract: file => {
    return spawn('node', [
      'extract-text',
      file
    ])
  }
}

const outDir = program.out
  ? path.resolve(program.out)
  : path.join(__dirname, 'extract')

const unkownByExt = {}
const errorByExt = {}
const doneByExt = {}
const bySymbol = {}

const incStat = (stat, key) => {
  stat[key] = (stat[key] || 0) + 1
}
const incSymbols = message => {
  for (let i = 0; i < message.length; i++) {
    incStat(bySymbol, message[i])
  }
}

const reportStat = throttle(() => {
  console.log('\n')
  console.log(`\nUnkown Stat:\n${JSON.stringify(unkownByExt)}`)
  console.log(`\nError Stat:\n${JSON.stringify(errorByExt)}`)
  console.log(`\nDone Stat:\n${JSON.stringify(doneByExt)}`)
  console.log(`\nSymbols:\n${JSON.stringify(bySymbol)}`)
  console.log('\n')
}, 5000)

const extractFile = (file, extractor) => {
  const ext = path.extname(file)
  if (ext !== '.txt') {
    cmdQueue.defer(callback => {
      let child
      if (extractor) {
        const fileBase = file.replace(basePath, '')
        const fileOutDir = path.join(
          outDir,
          fileBase
        )
        mkdirp.sync(fileOutDir)
        child = extractor(file, fileOutDir)
      } else {
        child = extractors.textract(file)
      }

      const messages = []
      child.stdout.on('data', (chunk) => {
        const lines = chunk.toString().trim().split('\n')
        lines.forEach(message => {
          if (message.startsWith('extract:')) {
            if (program.recursive) {
              extractFile(message.replace(/^extract:/, ''))
            }
          } else {
            process.stdout.write(message)
            messages.push(message)
          }
        })
      })

      const errors = []
      child.stderr.on('data', (chunk) => {
        errors.push(chunk.toString())
      })

      child.on('close', (code) => {
        incSymbols(messages.join(''))
        if (errors.length) {
          console.error(`\n\nFailure ${file}\n`)
          console.error(errors.join(''))
          incStat(errorByExt, ext)
        } else if (code !== 0) {
          incStat(unkownByExt, ext)
        } else {
          incStat(doneByExt, ext)
        }
        callback(null)
        reportStat()
      })
    })
  }
}

console.log('Initial Mboxes', files.length, files)

files.forEach(file => extractFile(file, extractors.mbox))

// cmdQueue.awaitAll((error) => {
//   if (error) console.error(error)
// })
