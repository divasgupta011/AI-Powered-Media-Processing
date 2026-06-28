// thrown when retrying won't help (bad image, unsupported input, etc.)
export class PermanentError extends Error {}

export function isRetryable(err: unknown): boolean {
  return !(err instanceof PermanentError)
}
