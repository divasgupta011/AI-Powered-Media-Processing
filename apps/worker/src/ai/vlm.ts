import { env } from '../env'
import { PermanentError } from '../errors'

// Hosted captioning via a vision LLM, called through HF's inference-providers
// router (OpenAI-compatible). Needs a provider enabled on the HF account and
// spends the account's inference credit. Alternative to the local captioner.

function mimeOf(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.length > 12 && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return 'image/jpeg'
}

export async function captionWithVlm(image: Buffer): Promise<string> {
  const dataUrl = `data:${mimeOf(image)};base64,${image.toString('base64')}`

  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.HUGGINGFACE_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.HF_VLM_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in one short, factual sentence.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 60,
    }),
  })

  if (res.status === 429 || res.status === 503) {
    throw new Error(`vlm temporarily unavailable (${res.status})`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status >= 400 && res.status < 500) {
      throw new PermanentError(`vlm rejected the request (${res.status}): ${body}`)
    }
    throw new Error(`vlm error (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const caption = data.choices?.[0]?.message?.content?.trim()
  if (!caption) throw new Error('vlm returned no caption')
  return caption
}
