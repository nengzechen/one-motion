import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import Login from './pages/Login'
import Home from './pages/Home'
import TitleBar from './components/TitleBar'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <HashRouter>
      <div className="flex flex-col h-screen overflow-hidden">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<PrivateRoute><Home /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
