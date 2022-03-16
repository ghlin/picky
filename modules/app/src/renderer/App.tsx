import { useEffect } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { MemoryRouter as Router, Route, Routes } from 'react-router-dom'
import useLocalStorage from 'use-local-storage'
import * as UUID from 'uuid'
import { AppContext, handleSessionState, initialize, useAppState } from './context'
import { EditPool } from './EditPool'
import { MainPage } from './Main'
import { Keys } from './misc'
import { Settings } from './Settings'

const { socket, request, rx$ } = initialize()

export default function App() {
  const [uuid]     = useLocalStorage(Keys.UUID,   UUID.v1())
  const [secret]   = useLocalStorage(Keys.SECRET, UUID.v1())
  const [image_id] = useLocalStorage(Keys.AVATAR, 24154052  /* 原型机灵 */)

  const handle     = (e: Error) => toast.error(e.message)
  const context    = useAppState({ socket, request, rx$, handle })

  useEffect(() => handleSessionState({ uuid, image_id, secret }, context), [])
  useEffect(() => {
    context.rx$.subscribe(e => {
      if (e.tag === 's_error') { toast.error(`${e.code}: ${e.message}`) }
    })
  }, [])

  return <AppContext.Provider value={context}>
    <Router>
      <Routes>
        <Route path='/'         element={<MainPage />} />
        <Route path='/settings' element={<Settings />} />
        <Route path='/pooledit' element={<EditPool />} />
      </Routes>
    </Router>
    <Toaster />
  </AppContext.Provider>
}
