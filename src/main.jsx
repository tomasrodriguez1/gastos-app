import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { PrivacyModeProvider } from './contexts/PrivacyModeContext.jsx'
import './index.css'
import AppRoot from './AppRoot.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PrivacyModeProvider>
          <AppRoot />
        </PrivacyModeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
