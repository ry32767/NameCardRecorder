import { CARD_LABEL } from '../github/issues'
import { normalizeTags } from './serialize'
import type { CardFields } from './types'

export const COMPANY_LABEL_PREFIX = 'company:'
export const EVENT_LABEL_PREFIX = 'event:'
export const TAG_LABEL_PREFIX = 'tag:'

/**
 * Issue に付けるラベルを組み立てる。
 * ラベルは GitHub 上で絞り込むための冗長化であって、正となる値は本文の YAML 側
 * （docs/architecture.md）。イベントラベルは「出会った場所」(metAt) から作る。
 */
export function buildCardLabels(fields: CardFields): string[] {
  const labels = [CARD_LABEL]

  const company = fields.company.trim()
  if (company) labels.push(`${COMPANY_LABEL_PREFIX}${company}`)

  const metAt = fields.metAt.trim()
  if (metAt) labels.push(`${EVENT_LABEL_PREFIX}${metAt}`)

  for (const tag of normalizeTags(fields.tags)) {
    labels.push(`${TAG_LABEL_PREFIX}${tag}`)
  }

  return labels
}
