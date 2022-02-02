import classnames from 'classnames'
import usePromise from 'react-use-promise'
export { classnames }

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
