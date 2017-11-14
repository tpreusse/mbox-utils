const fs = require('fs')
const path = require('path')

const program = require('commander')

const { version } = require('./package.json')

program
  .version(version)
  .usage('[options] <file>')
  .option('-p, --plain-text', 'convert email to txt files')
  .option('-a, --attachments', 'extract mail attachments')
  .option('-s, --slave', 'silent mode, only report to master')
  .option('-o, --out [value]', 'out dir')
  .parse(process.argv)

const html_strip = require('htmlstrip-native')
const { MailParser } = require('mailparser')

if (program.args.length !== 1) {
  console.error('need exactly one file to extract')
  process.exit(1)
}

const filePath = program.args[0]

const fsErrorHandler = err => {
  if (err) {
    console.error('fs error', err)
    process.exit(1)
  }
}

let headers
let attachments = []

const processAttachment = (id, attachment) => {
  const fileName = attachmentFileName(attachment)

  if (!fs.existsSync(path.join(outDir, id))) {
    fs.mkdirSync(path.join(outDir, id))
  }

  const filePath = path.join(
    outDir,
    id,
    fileName
  )
  const fsStream = fs.createWriteStream(filePath)
  fsStream.on('error', fsErrorHandler)
  fsStream.on('close', () => {
    process.stdout.write('+')
    if (program.slave) {
      console.log(`\nextract:${filePath}\n`)
    }
  })

  attachment.content.pipe(fsStream)
  attachment.content.on('end', () => {
    attachment.release()
  })
}

const onAttachment = (attachment) => {
  attachments.push(attachment.filename || 'unknown')
  if (!extractAttachments) {
    return attachment.release()
  }
  processAttachment(id, attachment)
}

const getAddresses = value => {
  if (!value) {
    return []
  }
  return (value.value || value).reduce(
    (contacts, contact) => {
      if (contact.group) {
        return contacts
          .concat(contact.address ? contact : [])
          .concat(getAddresses(contact.group))
      }
      return contacts.concat(contact)
    },
    []
  )
}

const formatContact = c => `${c.name} <${c.address}>`

const onMessage = (id, headers, message) => {
  if (!plainText) {
    return
  }

  const mailFrom = getAddresses(headers.get('from'))
  let firstFrom = mailFrom[0]
  if (!firstFrom) {
    mailFrom.push({address: 'unknown'})
    firstFrom = mailFrom[0]
  }
  if (!firstFrom.address) {
    firstFrom.address = firstFrom.name || 'unknown'
  }
  const to = getAddresses(headers.get('to'))
  const cc = getAddresses(headers.get('cc'))
  const bcc = getAddresses(headers.get('bcc'))

  const messageText = (
    (message.text || '').trim() ||
    html_strip.html_strip(message.html || '')
  )

  const references = [].concat(headers.get('references') || [])

  fs.writeFile(
    path.join(outDir, `${id}.txt`),
    [
      `From: ${mailFrom.map(formatContact).join(', ')}`,
      to.length && `To: ${to.map(formatContact).join(', ')}`,
      cc.length && `Cc: ${cc.map(formatContact).join(', ')}`,
      bcc.length && `Bcc: ${bcc.map(formatContact).join(', ')}`,
      `Date: ${headers.get('date').toUTCString()}`,
      `Subject: ${headers.get('subject') || ''}`,
      '',
      `Message ID: ${headers.get('message-id') || ''}`,
      references.length && `References: ${references.join(', ')}`,
      '',
      '',
      messageText,
      '',
      '',
      attachments.length && `Attachments: ${attachments.join(', ')}`
    ]
      .filter(line => line !== 0)
      .join('\n')
      .trimRight(),
    error => {
      fsErrorHandler(error)
      process.stdout.write('.')
    }
  )
}

var parser = new MailParser()
parser.on('headers', data => {
  headers = data
})
parser.on('data', data => {
  if (data.type !== 'text') {
    onAttachment(data)
    return
  } else {
    onMessage(data)
  }
})
parser.on('end', () => {})


fs.createReadStream(filePath)

fsStream.on('error', fsErrorHandler)
fsStream.pipe(parser)

!program.slave && console.log(
`Processed Legend:
  . plain text
  + attachment
`)

process.on('exit', () => {
  console.log('\n')
})
