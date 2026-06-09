import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivacyModeProvider } from './contexts/PrivacyModeContext.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <PrivacyModeProvider>
        <App />
      </PrivacyModeProvider>
    </BrowserRouter>
  </StrictMode>,
)
