import { env } from '../env'

// The spec's caption model (Salesforce/blip-image-captioning-base) is no longer
// served by HF's hosted inference API - the endpoint was retired and the model
// dropped from every provider. So instead of an HTTP call we run an ONNX caption
// model in-process via transformers.js. Same step, no external inference call.
// Loaded lazily because the model is heavy and only needed when AI_MOCK is off.

type Captioner = (input: unknown) => Promise<Array<{ generated_text?: string }>>

let lib: Promise<any> | null = null
function loadLib(): Promise<any> {
  if (!lib) {
    // the hub now refuses anonymous downloads, so hand transformers.js the token
    if (env.HUGGINGFACE_API_TOKEN) process.env.HF_TOKEN ??= env.HUGGINGFACE_API_TOKEN
    lib = import('@huggingface/transformers')
  }
  return lib
}

let captioner: Promise<Captioner> | null = null
function getCaptioner(): Promise<Captioner> {
  if (!captioner) {
    captioner = loadLib().then(({ pipeline }) => pipeline('image-to-text', env.HF_CAPTION_MODEL))
  }
  return captioner
}

export async function captionWithHuggingFace(image: Buffer): Promise<string> {
  const { RawImage } = await loadLib()
  const run = await getCaptioner()
  const raw = await RawImage.fromBlob(new Blob([image]))
  const out = await run(raw)
  const caption = out[0]?.generated_text?.trim()
  if (!caption) throw new Error('captioning produced no text')
  return caption
}
