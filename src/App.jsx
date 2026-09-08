import { useState } from 'react'

import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes
} from 'react-router-dom'

import MatchSelector
  from './components/MatchSelector'

import PossessionsPage
  from './pages/PossessionsPage'

import RucksPage
  from './pages/RucksPage'

import './App.css'


function App() {

  const [saison, setSaison] =
    useState('')

  const [journee, setJournee] =
    useState('')

  const [matchId, setMatchId] =
    useState('')


  return (

    <BrowserRouter>

      <div className="application-layout">

        <nav className="main-nav">

          <div className="nav-brand">
            Rugby Analytics
          </div>

          <div className="nav-links">

            <NavLink
              to="/possessions"
              className={({ isActive }) =>
                isActive
                  ? 'nav-link active'
                  : 'nav-link'
              }
            >
              Possessions
            </NavLink>

            <NavLink
              to="/rucks"
              className={({ isActive }) =>
                isActive
                  ? 'nav-link active'
                  : 'nav-link'
              }
            >
              Rucks & Contests
            </NavLink>

          </div>

        </nav>


        <MatchSelector
          saison={saison}
          setSaison={setSaison}

          journee={journee}
          setJournee={setJournee}

          matchId={matchId}
          setMatchId={setMatchId}
        />


        <Routes>

          <Route
            path="/"
            element={
              <Navigate
                to="/possessions"
                replace
              />
            }
          />

          <Route
            path="/possessions"
            element={
              <PossessionsPage
                saison={saison}
                journee={journee}
                matchId={matchId}
              />
            }
          />

          <Route
            path="/rucks"
            element={
              <RucksPage
                saison={saison}
                journee={journee}
                matchId={matchId}
              />
            }
          />

        </Routes>

      </div>

    </BrowserRouter>

  )
}

export default App