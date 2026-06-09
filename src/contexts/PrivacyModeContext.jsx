/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

const PRIVACY_MODE_STORAGE_KEY = 'gastos-privacy-mode'

const PrivacyModeContext = createContext(undefined)

function getStoredPrivacyMode() {
  try {
    const stored = localStorage.getItem(PRIVACY_MODE_STORAGE_KEY)
    return stored ? JSON.parse(stored) : false
  } catch {
    return false
  }
}

function setStoredPrivacyMode(enabled) {
  try {
    localStorage.setItem(PRIVACY_MODE_STORAGE_KEY, JSON.stringify(enabled))
  } catch (error) {
    console.error('Failed to store privacy mode setting:', error)
  }
}

export function PrivacyModeProvider({ children }) {
  const [isPrivacyModeEnabled, setIsPrivacyModeEnabled] = useState(() => getStoredPrivacyMode())

  useEffect(() => {
    setStoredPrivacyMode(isPrivacyModeEnabled)
  }, [isPrivacyModeEnabled])

  const togglePrivacyMode = () => {
    setIsPrivacyModeEnabled(prev => !prev)
  }

  return (
    <PrivacyModeContext.Provider value={{ isPrivacyModeEnabled, togglePrivacyMode }}>
      {children}
    </PrivacyModeContext.Provider>
  )
}

export function usePrivacyMode() {
  const context = useContext(PrivacyModeContext)
  if (context === undefined) {
    throw new Error('usePrivacyMode must be used within a PrivacyModeProvider')
  }
  return context
}
