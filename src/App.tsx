import { Navigate, Route, Routes } from 'react-router-dom'
import { Settings } from './pages/Settings'
import { CardList } from './pages/CardList'
import { NewCard } from './pages/NewCard'
import { CardDetail } from './pages/CardDetail'
import { isSettingsComplete } from './lib/settings'
import { useSettings } from './store/settingsContext'
import { useCards } from './store/useCards'

export default function App() {
  const { settings, repoRef } = useSettings()
  const cards = useCards(repoRef)
  const configured = isSettingsComplete(settings)

  return (
    <Routes>
      <Route path="/settings" element={<Settings />} />

      {/* 設定が未入力なら、何を開いても設定画面に送る（docs/spec.md 機能0） */}
      {configured ? (
        <>
          <Route path="/" element={<CardList cards={cards} />} />
          <Route path="/new" element={<NewCard onCreated={cards.addCard} />} />
          <Route path="/cards/:number" element={<CardDetail cards={cards} />} />
        </>
      ) : (
        <Route path="*" element={<Navigate to="/settings" replace />} />
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
