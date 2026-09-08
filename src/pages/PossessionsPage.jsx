import { useEffect, useState } from 'react'

import { supabase } from '../lib/supabase'

import SankeyDiagram
  from '../components/SankeyDiagram'

import VideoPlayer
  from '../components/VideoPlayer'

import '../App.css'

function PossessionsPage({
  saison,
  journee,
  matchId
}) {

  const [
    possessions,
    setPossessions
  ] = useState([])
  const [
    selectedPossession,
    setSelectedPossession
  ] = useState(null)

  const [
    selectedPossessions,
    setSelectedPossessions
  ] = useState([])

  const [
    loading,
    setLoading
  ] = useState(true)

  const [
    error,
    setError
  ] = useState(null)

  useEffect(() => {
    chargerPossessions()
  }, [])

  async function chargerPossessions() {

    setLoading(true)
    setError(null)

    const {
      data,
      error
    } = await supabase
      .from(
        'v_recuperation_possession'
      )
      .select('*')
      .order(
        'ordre_possession',
        {
          ascending: true
        }
      )

    if (error) {
      console.error(error)
      setError(error.message)
    } else {
      setPossessions(data || [])
    }

    setLoading(false)
  }

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
          onClick={
            chargerPossessions
          }
        >
          ↻ Actualiser
        </button>

      </header>

      <main>

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        <div className="stats">

          <strong>
            {possessions.length}
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
            possessions={possessions}
            onLinkClick={
              setSelectedPossessions
            }
          />

        )}

        {selectedPossessions.length > 0 && (

          <PossessionList
            possessions={
              selectedPossessions
            }
            onClose={() =>
              setSelectedPossessions([])
            }
            onSelectPossession={
              setSelectedPossession
            }
          />
          
        )}

        {selectedPossession && (
            <VideoPlayer
              possession={selectedPossession}
              saison={saison}
              journee={journee}
              onClose={() =>
                setSelectedPossession(null)
              }
            />
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
            {possessions.length}
            {' '}
            possessions
          </span>
        </div>

        <button
          onClick={onClose}
        >
          ✕
        </button>

      </div>

      <div className="possession-list">

        {possessions.map(
          (possession) => (

            <button
              key={
                possession.uuid_possession
              }
              className="possession-item"
              onClick={() =>
                onSelectPossession(
                  possession
                )
              }
            >

              <strong>
                {possession.uuid_possession}
              </strong>

              <span>
                Possession #
                {
                  possession.ordre_possession
                }
              </span>

            </button>

          )
        )}

      </div>

    </div>

  )
}

export default PossessionsPage