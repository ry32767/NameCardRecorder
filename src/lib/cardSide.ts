/** 名刺の面。表は必須ではないが、裏だけの登録は稀なので front を既定の並び順にする */
export type CardSide = 'front' | 'back'

export const CARD_SIDES: readonly CardSide[] = ['front', 'back']

export const SIDE_LABELS: Record<CardSide, string> = { front: '表', back: '裏' }
