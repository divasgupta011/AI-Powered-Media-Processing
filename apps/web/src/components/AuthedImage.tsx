import { useEffect, useState } from 'react'
import { api } from '../api'

// the image endpoint is behind auth, so an <img src> won't work directly
// (no bearer header). fetch it with the api client and render the blob.
export default function AuthedImage({ jobId, className }: { jobId: string; className?: string }) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let active = true
    let made: string | undefined
    api(`/jobs/${jobId}/image`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('no image'))))
      .then((blob) => {
        if (!active) return
        made = URL.createObjectURL(blob)
        setUrl(made)
      })
      .catch(() => {})
    return () => {
      active = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [jobId])

  if (!url) return <div className={`${className ?? ''} img-loading`} />
  return <img className={className} src={url} alt="" />
}
