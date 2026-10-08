import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../lib/supabase'

import SankeyDiagram from '../components/SankeyDiagram'

import VideoPlayer from '../components/VideoPlayer'

import '../App.css'

function PossessionsPage({
  saison,
  journee,
  matchId
}) {

  const [possessions, setPossessions] = useState([])

  const [selectedPossession, setSelectedPossession] = useState(null)

  const [selectedPossessions, setSelectedPossessions] = useState([])

  const [teamFilter, setTeamFilter] = useState('all')

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState(null)

  const chargerPossessions = useCallback(async () => {

    // Aucun match sélectionné
    if (!matchId) {
      setPossessions([])
      setSelectedPossession(null)
      setSelectedPossessions([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Fermer les anciennes sélections
    setSelectedPossession(null)
    setSelectedPossessions([])

    const {
      data,
      error: queryError
    } = await supabase
      .from('v_recuperation_possession')
      .select('*')
      .eq('uuid_match', matchId)
      .order('ordre_possession', {
        ascending: true
      })

    if (queryError) {
      console.error('Erreur chargement possessions :', queryError)
      setError(queryError.message)
      setPossessions([])
    } else {
      setPossessions(data || [])
    }

    setLoading(false)

  }, [matchId])

  // Recharger automatiquement au changement de match
  useEffect(() => {
    chargerPossessions()
  }, [chargerPossessions])

  const filteredPossessions = useMemo(() => {
  if (teamFilter === 'home') {
    return possessions.filter(
      (p) => Number(p.equipe_domicile) === 1
    )
  }

  if (teamFilter === 'away') {
    return possessions.filter(
      (p) => Number(p.equipe_domicile) === 0
    )
  }

  return possessions
}, [possessions, teamFilter])

  return (
    <div className="app">

      <header className="header">

        <div>
          <h1>
            Analyse des possessions
          </h1>

          <p>
            Analyse vidéo rugby
          </p>
        </div>

        <button
          onClick={chargerPossessions}
          disabled={!matchId || loading}
        >
          ↻ Actualiser
        </button>

      </header>

      <main>

        {!matchId && (
          <div className="loading">
            Sélectionne un match pour afficher les possessions.
          </div>
        )}

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        {matchId && (
          <>
          <div className="possession-team-filter">
          <button
            type="button"
            className={teamFilter === 'all' ? 'active' : ''}
            onClick={() => setTeamFilter('all')}
          >
            Toutes les équipes
          </button>

          <button
            type="button"
            className={teamFilter === 'home' ? 'active' : ''}
            onClick={() => setTeamFilter('home')}
          >
            Domicile
          </button>

          <button
            type="button"
            className={teamFilter === 'away' ? 'active' : ''}
            onClick={() => setTeamFilter('away')}
          >
            Extérieur
          </button>

        </div>
            <div className="stats">

              <strong>
                {filteredPossessions.length}
              </strong>

              <span>
                possessions
              </span>

            </div>

            {loading ? (

              <div className="loading">
                Chargement des possessions...
              </div>

            ) : (

              <SankeyDiagram
                possessions={filteredPossessions}
                onLinkClick={setSelectedPossessions}
              />

            )}

            {selectedPossessions.length > 0 && (

              <PossessionList
                possessions={selectedPossessions}
                onClose={() => setSelectedPossessions([])}
                onSelectPossession={setSelectedPossession}
              />

            )}

            {selectedPossession && (

              <VideoPlayer
                possession={selectedPossession}
                saison={saison}
                journee={journee}
                onClose={() => setSelectedPossession(null)}
              />

            )}
          </>
        )}

      </main>

    </div>
  )
}

function PossessionList({
  possessions,
  onClose,
  onSelectPossession
}) {

  return (

    <div className="possession-panel">

      <div className="panel-header">

        <div>
          <strong>
            Possessions du flux
          </strong>

          <span>
            {possessions.length} possessions
          </span>
        </div>

        <button onClick={onClose}>
          ✕
        </button>

      </div>

      <div className="possession-list">

        {possessions.map((possession) => (

          <button
            key={possession.uuid_possession}
            className="possession-item"
            onClick={() => onSelectPossession(possession)}
          >

            <strong>
              {possession.uuid_possession}
            </strong>

            <span>
              Possession #{possession.ordre_possession}
            </span>

          </button>

        ))}

      </div>

    </div>

  )
}

export default PossessionsPage