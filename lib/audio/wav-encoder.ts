// Browser-side WAV encoder.
// SpeechSuper officially accepts wav/mp3/opus/ogg/amr but recommends
// 16 kHz mono 16-bit PCM WAV for "optimal API performance". MediaRecorder
// gives us webm/opus or mp4/aac depending on browser, so we decode with
// Web Audio API and re-encode as 16 kHz mono PCM WAV for the API call.

export interface EncodedAudio {
  blob: Blob
  audioType: 'wav'
  sampleRate: number
  durationSec: number
}

const TARGET_RATE = 16000

function downmixToMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) {
    return buf.getChannelData(0).slice()
  }
  const len = buf.length
  const out = new Float32Array(len)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) out[i] += data[i]
  }
  const inv = 1 / buf.numberOfChannels
  for (let i = 0; i < len; i++) out[i] *= inv
  return out
}

// Linear-interpolated resampler. Good enough for speech assessment;
// SpeechSuper handles its own feature extraction.
function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const newLen = Math.round(samples.length / ratio)
  const out = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    const t = i * ratio
    const i0 = Math.floor(t)
    const i1 = Math.min(i0 + 1, samples.length - 1)
    const frac = t - i0
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac
  }
  return out
}

function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]
    if (s > 1) s = 1
    if (s < -1) s = -1
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function encodeWav(pcm: Int16Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const blockAlign = 1 * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataLen = pcm.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLen)
  const view = new DataView(buffer)

  let p = 0
  function w(s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i))
  }
  function u32(n: number) { view.setUint32(p, n, true); p += 4 }
  function u16(n: number) { view.setUint16(p, n, true); p += 2 }

  w('RIFF')
  u32(36 + dataLen)
  w('WAVE')
  w('fmt ')
  u32(16)             // PCM chunk size
  u16(1)              // PCM format
  u16(1)              // mono
  u32(sampleRate)
  u32(byteRate)
  u16(blockAlign)
  u16(16)             // bits per sample
  w('data')
  u32(dataLen)

  // PCM data
  let offset = 44
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i], true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Decode any browser-supported audio Blob (webm/opus, mp4/aac, ogg, etc.)
 * and re-encode as 16 kHz mono 16-bit PCM WAV Blob.
 */
export async function blobToPcmWav(blob: Blob): Promise<EncodedAudio> {
  const arrayBuf = await blob.arrayBuffer()
  // Lazy-instantiate AudioContext at the actual rate we'll use; some browsers
  // refuse to construct OfflineAudioContext at non-standard rates, so we
  // decode at the source rate and resample manually.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext)
  if (!Ctor) throw new Error('AudioContext is not supported in this browser')
  const ctx = new Ctor()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(arrayBuf.slice(0))
  } finally {
    // closing right away is fine — decodeAudioData returned a detached buffer
    if (typeof ctx.close === 'function') ctx.close().catch(() => {})
  }

  const mono = downmixToMono(decoded)
  const resampled = resample(mono, decoded.sampleRate, TARGET_RATE)
  const pcm = floatToPcm16(resampled)
  const wav = encodeWav(pcm, TARGET_RATE)
  return {
    blob: wav,
    audioType: 'wav',
    sampleRate: TARGET_RATE,
    durationSec: resampled.length / TARGET_RATE,
  }
}
