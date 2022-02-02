import { render } from 'react-dom'
import ReactModal from 'react-modal'
import App from './App'
import './index.css'

ReactModal.setAppElement('#root')
render(<App />, document.getElementById('root'))
