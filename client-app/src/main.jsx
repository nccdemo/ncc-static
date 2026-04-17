import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { injectNccTheme } from './styles/theme.js'
injectNccTheme()
import '../../shared/src/styles/theme-global.css'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
