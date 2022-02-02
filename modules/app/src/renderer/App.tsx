import { useEffect } from 'react'
import { MemoryRouter as Router, Route, Routes } from 'react-router-dom'
import useLocalStorage from 'use-local-storage'
import * as UUID from 'uuid'
import { AppContext, handleSessionState, initialize, useAppState } from './context'
import { MainPage } from './Main'
import { Keys } from './misc'
import { Settings } from './Settings'

const { socket, request, rx$ } = initialize()

export default function App() {
  const [uuid]     = useLocalStorage(Keys.UUID, UUID.v1())
  const [secret]   = useLocalStorage(Keys.SECRET, UUID.v1())
  const [image_id] = useLocalStorage(Keys.AVATAR, 0)
  const context    = useAppState({ socket, request, rx$ })

  useEffect(() => handleSessionState({ uuid, image_id, secret }, context), [])

  return <AppContext.Provider value={context}>
    <Router>
      <Routes>
        <Route path='/'         element={<MainPage />} />
        <Route path='/settings' element={<Settings />} />
      </Routes>
    </Router>
  </AppContext.Provider>
}
