import { TextArea, TextField } from './TextField'
import type { CardFields } from '../lib/card/types'
import type { CardFieldErrors } from '../lib/card/validate'

interface CardFormProps {
  fields: CardFields
  errors: CardFieldErrors
  onChange: <K extends keyof CardFields>(key: K, value: CardFields[K]) => void
}

/**
 * 確認フォーム。OCR の結果は「候補」なので、全欄を手で直せることが要件
 * （docs/spec.md 機能2）。狭幅は 1 列、広幅は 2 列にリフローする。
 */
export function CardForm({ fields, errors, onChange }: CardFormProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="氏名"
        value={fields.name}
        error={errors.name}
        onChange={(e) => onChange('name', e.target.value)}
      />
      <TextField
        label="ふりがな"
        value={fields.nameKana}
        onChange={(e) => onChange('nameKana', e.target.value)}
      />
      <TextField
        label="会社名"
        value={fields.company}
        error={errors.company}
        onChange={(e) => onChange('company', e.target.value)}
      />
      <TextField
        label="部署"
        value={fields.department}
        onChange={(e) => onChange('department', e.target.value)}
      />
      <TextField
        label="役職"
        value={fields.title}
        onChange={(e) => onChange('title', e.target.value)}
      />
      <TextField
        label="メール"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={fields.email}
        error={errors.email}
        onChange={(e) => onChange('email', e.target.value)}
      />
      <TextField
        label="電話"
        type="tel"
        inputMode="tel"
        numeric
        value={fields.phone}
        onChange={(e) => onChange('phone', e.target.value)}
      />
      <TextField
        label="携帯"
        type="tel"
        inputMode="tel"
        numeric
        value={fields.mobile}
        onChange={(e) => onChange('mobile', e.target.value)}
      />
      <TextField
        label="FAX"
        type="tel"
        inputMode="tel"
        numeric
        value={fields.fax}
        onChange={(e) => onChange('fax', e.target.value)}
      />
      <TextField
        label="郵便番号"
        numeric
        inputMode="numeric"
        value={fields.postalCode}
        onChange={(e) => onChange('postalCode', e.target.value)}
      />
      <TextField
        label="住所"
        className="sm:col-span-2"
        value={fields.address}
        onChange={(e) => onChange('address', e.target.value)}
      />
      <TextField
        label="Web サイト"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        value={fields.website}
        error={errors.website}
        onChange={(e) => onChange('website', e.target.value)}
      />
      <TextField
        label="出会った日"
        type="date"
        numeric
        value={fields.metOn}
        onChange={(e) => onChange('metOn', e.target.value)}
      />
      <TextField
        label="出会った場所"
        hint="展示会名や訪問先。絞り込みに使えます"
        value={fields.metAt}
        onChange={(e) => onChange('metAt', e.target.value)}
      />
      <TextField
        label="タグ"
        className="sm:col-span-2"
        hint="スペース区切りで複数入力できます"
        value={fields.tags.join(' ')}
        onChange={(e) => onChange('tags', e.target.value.split(/\s+/).filter(Boolean))}
      />
      <TextArea
        label="メモ"
        className="sm:col-span-2"
        value={fields.memo}
        onChange={(e) => onChange('memo', e.target.value)}
      />
    </div>
  )
}
