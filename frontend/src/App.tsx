import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import PlaceholderPage from './components/PlaceholderPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Coach */}
          <Route path="/coach" element={<PlaceholderPage role="coach" path="/coach" />} />
          <Route path="/coach/teams" element={<PlaceholderPage role="coach" path="/coach/teams" />} />
          <Route path="/coach/schedule" element={<PlaceholderPage role="coach" path="/coach/schedule" />} />
          <Route path="/coach/competition" element={<PlaceholderPage role="coach" path="/coach/competition" />} />
          <Route path="/coach/players" element={<PlaceholderPage role="coach" path="/coach/players" />} />
          <Route path="/coach/equipment" element={<PlaceholderPage role="coach" path="/coach/equipment" />} />

          {/* Player */}
          <Route path="/player" element={<PlaceholderPage role="player" path="/player" />} />
          <Route path="/player/my-team" element={<PlaceholderPage role="player" path="/player/my-team" />} />
          <Route path="/player/schedule" element={<PlaceholderPage role="player" path="/player/schedule" />} />
          <Route path="/player/development" element={<PlaceholderPage role="player" path="/player/development" />} />

          {/* Administration */}
          <Route path="/admin" element={<PlaceholderPage role="admin" path="/admin" />} />
          <Route path="/admin/people" element={<PlaceholderPage role="admin" path="/admin/people" />} />
          <Route path="/admin/settings" element={<PlaceholderPage role="admin" path="/admin/settings" />} />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/coach" replace />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
