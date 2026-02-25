import { useState } from 'react'
import './App.css'
import LandingPage from './LandingPage'
import ChatPage from './pages/ChatPage'

type Page = 'landing' | 'chat'

function App() {
  const [page, setPage] = useState<Page>('landing')

  if (page === 'chat') return <ChatPage />
  return <LandingPage onTryIt={() => setPage('chat')} />
}

export default App
