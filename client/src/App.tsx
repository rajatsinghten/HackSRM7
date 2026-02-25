import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import LandingPage from './LandingPage'
import ChatPage from './pages/ChatPage'
import AllResultsPage from './pages/AllResultsPage'
import { CompressResultsProvider } from './contexts/CompressResultsContext'

function App() {
  return (
    <CompressResultsProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/details" element={<AllResultsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CompressResultsProvider>
  )
}

export default App
