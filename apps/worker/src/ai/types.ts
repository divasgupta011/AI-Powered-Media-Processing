import type { Label, SafetyResult } from '@camarin/shared'

export interface AiClient {
  caption(image: Buffer): Promise<string>
  labels(image: Buffer): Promise<Label[]>
  safety(image: Buffer): Promise<SafetyResult>
}
