const fs = require('fs')
const program = require('commander')
const { version } = require('./package.json')

const textract = require('textract')

program
  .version(version)
  .usage('[options] <file>')
  .parse(process.argv)

if (program.args.length !== 1) {
  console.error('need exactly one file to extract')
  process.exit(1)
}

const filePath = program.args[0]

const writeHandler = err => {
  if (err) {
    console.error('fs write error', err)
    process.exit(1)
  }
}

textract.fromFileWithPath(filePath, {exec: {maxBuffer: 1000*1024}}, (error, text) => {
  if (error) {
    if (error.typeNotFound) {
      process.stdout.write('?')
    } else {
      console.error(error)
    }
    process.exit(1)
    return
  }

  const outFilePath = `${filePath}.txt`

  fs.writeFile(
    outFilePath,
    text,
    writeHandler
  )
})
