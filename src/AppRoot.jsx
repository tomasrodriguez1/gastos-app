import { RouteGuard } from './components/Auth/RouteGuard'
import App from './App'

export default function AppRoot() {
  return (
    <RouteGuard>
      <App />
    </RouteGuard>
  )
}
