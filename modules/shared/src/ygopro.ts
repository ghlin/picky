export interface YGOPROCardInfo {
  code:       number
  alias:      number
  name:       string
  desc:       string

  types:      CTypeEnums[]
  archtypes:  string[]

  mtype:      number
  mattribute: number
  mlevel:     number
  matk:       number
  mdef:       number
  mscale:     number
}

export const MTYPES = {
  WARRIOR:      0x000000000001,
  SPELLCASTER:  0x000000000002,
  FAIRY:        0x000000000004,
  FIEND:        0x000000000008,
  ZOMBIE:       0x000000000010,
  MACHINE:      0x000000000020,
  AQUA:         0x000000000040,
  PYRO:         0x000000000080,
  ROCK:         0x000000000100,
  WINDBEAST:    0x000000000200,
  PLANT:        0x000000000400,
  INSECT:       0x000000000800,
  THUNDER:      0x000000001000,
  DRAGON:       0x000000002000,
  BEAST:        0x000000004000,
  BEASTWARRIOR: 0x000000008000,
  DINOSAUR:     0x000000010000,
  FISH:         0x000000020000,
  SEASERPENT:   0x000000040000,
  REPTILE:      0x000000080000,
  PSYCHO:       0x000000100000,
  DEVINE:       0x000000200000,
  CREATORGOD:   0x000000400000,
  WYRM:         0x000000800000,
  CYBERSE:      0x000001000000,
}

export const MATTRIBUTES = {
  EARTH:  0x000000000001,
  WATER:  0x000000000002,
  FIRE:   0x000000000004,
  WIND:   0x000000000008,
  LIGHT:  0x000000000010,
  DARK:   0x000000000020,
  DEVINE: 0x000000000040,
}

export const MATTRIBUTE_BY_CODE: Record<number, keyof typeof MATTRIBUTES> = {
  [0x000000000001]: 'EARTH',
  [0x000000000002]: 'WATER',
  [0x000000000004]: 'FIRE',
  [0x000000000008]: 'WIND',
  [0x000000000010]: 'LIGHT',
  [0x000000000020]: 'DARK',
  [0x000000000040]: 'DEVINE',
}

export const CTYPES = {
  MONSTER:     0x000000000001,
  SPELL:       0x000000000002,
  TRAP:        0x000000000004,
  NORMAL:      0x000000000010,
  EFFECT:      0x000000000020,
  FUSION:      0x000000000040,
  RITUAL:      0x000000000080,
  TRAPMONSTER: 0x000000000100,
  SPIRIT:      0x000000000200,
  UNION:       0x000000000400,
  DUAL:        0x000000000800,
  TUNER:       0x000000001000,
  SYNCHRO:     0x000000002000,
  TOKEN:       0x000000004000,
  QUICKPLAY:   0x000000010000,
  CONTINUOUS:  0x000000020000,
  EQUIP:       0x000000040000,
  FIELD:       0x000000080000,
  COUNTER:     0x000000100000,
  FLIP:        0x000000200000,
  TOON:        0x000000400000,
  XYZ:         0x000000800000,
  PENDULUM:    0x000001000000,
  SPSUMMON:    0x000002000000,
  LINK:        0x000004000000,
}
export const MTYPES_BY_CODE: Record<number, keyof typeof MTYPES> = {
  [0x000000000001]: 'WARRIOR',
  [0x000000000002]: 'SPELLCASTER',
  [0x000000000004]: 'FAIRY',
  [0x000000000008]: 'FIEND',
  [0x000000000010]: 'ZOMBIE',
  [0x000000000020]: 'MACHINE',
  [0x000000000040]: 'AQUA',
  [0x000000000080]: 'PYRO',
  [0x000000000100]: 'ROCK',
  [0x000000000200]: 'WINDBEAST',
  [0x000000000400]: 'PLANT',
  [0x000000000800]: 'INSECT',
  [0x000000001000]: 'THUNDER',
  [0x000000002000]: 'DRAGON',
  [0x000000004000]: 'BEAST',
  [0x000000008000]: 'BEASTWARRIOR',
  [0x000000010000]: 'DINOSAUR',
  [0x000000020000]: 'FISH',
  [0x000000040000]: 'SEASERPENT',
  [0x000000080000]: 'REPTILE',
  [0x000000100000]: 'PSYCHO',
  [0x000000200000]: 'DEVINE',
  [0x000000400000]: 'CREATORGOD',
  [0x000000800000]: 'WYRM',
  [0x000001000000]: 'CYBERSE',
}

export type CTypeEnums = keyof typeof CTYPES

export const PRETTY_CTYPES = {
    MONSTER:     '??????',
    SPELL:       '??????',
    TRAP:        '??????',
    NORMAL:      '??????',
    EFFECT:      '??????',
    FUSION:      '??????',
    RITUAL:      '??????',
    TRAPMONSTER: '????????????',
    SPIRIT:      '??????',
    UNION:       '??????',
    DUAL:        '??????',
    TUNER:       '??????',
    SYNCHRO:     '??????',
    TOKEN:       '?????????',
    QUICKPLAY:   '??????',
    CONTINUOUS:  '??????',
    EQUIP:       '??????',
    FIELD:       '??????',
    COUNTER:     '??????',
    FLIP:        '??????',
    TOON:        '??????',
    XYZ:         '??????',
    PENDULUM:    '??????',
    SPSUMMON:    '????????????',
    LINK:        '??????',
}

export const PRETTY_MTYPES = {
  WARRIOR:      '??????',
  SPELLCASTER:  '?????????',
  FAIRY:        '??????',
  FIEND:        '??????',
  ZOMBIE:       '??????',
  MACHINE:      '??????',
  AQUA:         '???',
  PYRO:         '???',
  ROCK:         '??????',
  WINDBEAST:    '??????',
  PLANT:        '??????',
  INSECT:       '??????',
  THUNDER:      '???',
  DRAGON:       '???',
  BEAST:        '???',
  BEASTWARRIOR: '?????????',
  DINOSAUR:     '??????',
  FISH:         '???',
  SEASERPENT:   '??????',
  REPTILE:      '?????????',
  PSYCHO:       '?????????',
  DEVINE:       '?????????',
  CREATORGOD:   '?????????',
  WYRM:         '??????',
  CYBERSE:      '?????????',
}

export const PRETTY_MATTRIBUTES = {
  EARTH:  '???',
  WATER:  '???',
  FIRE:   '???',
  WIND:   '???',
  LIGHT:  '???',
  DARK:   '???',
  DEVINE: '???',
}

