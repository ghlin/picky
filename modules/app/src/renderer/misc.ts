import classnames from 'classnames'
import usePromise from 'react-use-promise'
export { classnames }

import EARTH  from '../../assets/textures/EARTH.png'
import WATER  from '../../assets/textures/WATER.png'
import FIRE   from '../../assets/textures/FIRE.png'
import WIND   from '../../assets/textures/WIND.png'
import LIGHT  from '../../assets/textures/LIGHT.png'
import DARK   from '../../assets/textures/DARK.png'
import DEVINE from '../../assets/textures/DEVINE.png'

export const ATTR_TEXTURES = { EARTH, WATER, FIRE, WIND, LIGHT, DARK, DEVINE }

const PREFIX = 'v1:'
export const Keys = {
  UUID:           PREFIX + 'uuid',
  SECRET:         PREFIX + 'secret',
  AVATAR:         PREFIX + 'avatar',
  DECKS:          PREFIX + 'decks'
}

export function useCardInfo(code?: number) {
  const [info] = usePromise(() => code ? window.ipc.queryCardInfo(code) : Promise.resolve(undefined), [code])
  return info
}
