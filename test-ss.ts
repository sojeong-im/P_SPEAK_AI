import { createHash, randomUUID } from 'crypto'

const APP_KEY = process.env.SPEECHSUPER_APP_KEY ?? ''
const SECRET_KEY = process.env.SPEECHSUPER_SECRET_KEY ?? ''
const BASE_URL = 'https://api.speechsuper.com'

function sha1Hex(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex')
}

async function test() {
  const userId = 'guest'
  const timestamp = Date.now().toString()
  const connectSig = sha1Hex(APP_KEY + timestamp + SECRET_KEY)
  const startSig = sha1Hex(APP_KEY + timestamp + userId + SECRET_KEY)
  
  const params = {
    connect: {
      cmd: 'connect',
      param: {
        sdk: { version: 16777472, source: 9, protocol: 2 },
        app: { applicationId: APP_KEY, sig: connectSig, timestamp },
      },
    },
    start: {
      cmd: 'start',
      param: {
        app: { userId, applicationId: APP_KEY, timestamp, sig: startSig },
        audio: { audioType: 'wav', channel: 1, sampleBytes: 2, sampleRate: 16000 },
        request: { coreType: 'sent.eval.promax', refText: '안녕하세요', tokenId: randomUUID() },
      },
    },
  }

  const fd = new FormData()
  fd.append('text', JSON.stringify(params))
  fd.append('audio', new Blob([new ArrayBuffer(44)]), 'audio.wav') // dummy audio

  const res = await fetch(`${BASE_URL}/sent.eval.promax`, {
    method: 'POST',
    body: fd,
  })
  const text = await res.text()
  console.log('Status:', res.status)
  console.log('Body:', text)
}

test()
