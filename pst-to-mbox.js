const fs = require('fs')
const path = require('path')
const program = require('commander')
const { queue } = require('d3-queue')
const os = require('os')
const { spawn } = require('child_process')
const { version } = require('./package.json')

program
  .version(version)
  .usage('[options] <file ...>')
  .option('-c, --concurrency <n>', 'number of readpst cmds', parseInt)
  .option('-j, --jobs <n>', 'number of readpst jobs', parseInt)
  .option('-o, --out [value]', 'out dir')
  .parse(process.argv)

const psts = program.args.reduce(
  (all, inputFile) => {
    if (fs.statSync(inputFile).isDirectory()) {
      return all.concat(
        fs.readdirSync(inputFile)
          .filter(file => file.match(/\.pst$/))
          .map(file => path.join(inputFile, file))
      )
    }
    return all.concat(inputFile)
  },
  []
)

const cores = os.cpus().length

console.log(`${cores} available cpu cores, ${psts.length} PSTs`)

const readPstJobs = program.jobs || 3
const concurrency = program.concurrency || cores / 2 - 1

console.log(`Running ${concurrency} concurrent readpst, with ${readPstJobs} jobs each.`)

let pstQueue = queue(concurrency)
const outDir = program.out || __dirname

psts.forEach(pst => {
  pstQueue.defer(callback => {
    const basename = path.basename(pst, '.pst')
    const pstOutDir = path.join(outDir, basename)
    if (!fs.existsSync(pstOutDir)) {
      fs.mkdirSync(pstOutDir)
    }

    console.log(basename, 'start')
    const child = spawn('readpst', [
      '-D', // include deleted
      '-w', // overwrite
      '-j', readPstJobs,
      // '-d', path.join(pstOutDir, 'debug.txt'),
      '-o', pstOutDir,
      pst
    ])
    child.stdout.on('data', (chunk) => {
      console.log(basename, chunk.toString().trimRight())
    })
    child.stderr.on('data', (chunk) => {
      console.error(basename, chunk.toString().trimRight())
    })

    child.on('close', (code) => {
      console.log(basename, 'close', code)
      callback(null, pst)
    })
  })
})

pstQueue.awaitAll((error, results) => {
  if (error) console.error(error)
})
