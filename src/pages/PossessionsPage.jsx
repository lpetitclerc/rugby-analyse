import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../lib/supabase'
import {
  calculerGainTerrainStats,
  getGainTerrainCategory,
  getGainTerrainClass,
  getDurationCategory,
  getDurationClass
} from '../lib/rucks'

import SankeyDiagram from '../components/SankeyDiagram'

import VideoPlayer from '../components/VideoPlayer'
import { openVideoWindow } from '../lib/video-window'

import '../App.css'

function PossessionsPage({
  saison,
  journee,
  matchId
}) {

  const [possessions, setPossessions] = useState([])

  const [rucks, setRucks] = useState([])

  const [selectedPossession, setSelectedPossession] = useState(null)

  const [videoWindow, setVideoWindow] = useState(null)

  const [videoWindowError, setVideoWindowError] = useState(null)

  const [selectedTerrainPossessionIds, setSelectedTerrainPossessionIds] =
    useState(null)

  const [selectedTablePossessionIds, setSelectedTablePossessionIds] =
    useState(null)

  const [sankeySelectionVersion, setSankeySelectionVersion] = useState(0)

  const [teamFilter, setTeamFilter] = useState('all')

  const [ruckViewMode, setRuckViewMode] = useState('contest')

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState(null)

  const chargerPossessions = useCallback(async () => {

    // Aucun match sélectionné
    if (!matchId) {
      setPossessions([])
      setRucks([])
      setSelectedPossession(null)
      setSelectedTerrainPossessionIds(null)
      setSelectedTablePossessionIds(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Fermer les anciennes sélections
    setSelectedPossession(null)
    setSelectedTerrainPossessionIds(null)
    setSelectedTablePossessionIds(null)

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

    const {
      data: ruckData,
      error: ruckQueryError
    } = await supabase
      .from('v_ruck')
      .select('*')
      .eq('uuid_match', matchId)
      .order('uuid_possession', { ascending: true })
      .order('ordre_ruck', { ascending: true })

    if (queryError || ruckQueryError) {
      if (queryError) {
        console.error('Erreur chargement possessions :', queryError)
      }

      if (ruckQueryError) {
        console.error('Erreur chargement des rucks :', ruckQueryError)
      }

      setError(
        [queryError?.message, ruckQueryError?.message]
          .filter(Boolean)
          .join(' — ')
      )
    } else {
      setError(null)
    }

    if (queryError) {
      setPossessions([])
    } else {
      setPossessions(data || [])
    }

    setRucks(ruckQueryError ? [] : ruckData || [])
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

  const terrainPossessions = useMemo(() => {
    if (selectedTerrainPossessionIds === null) {
      return filteredPossessions
    }

    return filteredPossessions.filter((possession) =>
      selectedTerrainPossessionIds.has(possession.uuid_possession)
    )
  }, [filteredPossessions, selectedTerrainPossessionIds])

  const terrainPossessionIds = useMemo(
    () => new Set(terrainPossessions.map((possession) => possession.uuid_possession)),
    [terrainPossessions]
  )

  const filteredRucks = useMemo(
    () => rucks.filter((ruck) => terrainPossessionIds.has(ruck.uuid_possession)),
    [rucks, terrainPossessionIds]
  )

  const gainTerrainStats = useMemo(
    () => calculerGainTerrainStats(filteredRucks),
    [filteredRucks]
  )

  const tablePossessions = useMemo(() => {
    if (selectedTablePossessionIds === null) {
      return filteredPossessions
    }

    return filteredPossessions.filter((possession) =>
      selectedTablePossessionIds.has(possession.uuid_possession)
    )
  }, [filteredPossessions, selectedTablePossessionIds])

  const tableRucks = useMemo(() => {
    const possessionIds = new Set(
      tablePossessions.map((possession) => possession.uuid_possession)
    )

    return rucks.filter((ruck) => possessionIds.has(ruck.uuid_possession))
  }, [tablePossessions, rucks])

  function handleSankeySelection(selected) {
    const selectedIds = new Set(
      selected.map((possession) => possession.uuid_possession)
    )

    setSelectedTerrainPossessionIds(selectedIds)
    setSelectedTablePossessionIds(
      selected.length === filteredPossessions.length ? null : selectedIds
    )
  }

  function resetSankeySelection() {
    setSelectedTerrainPossessionIds(null)
    setSelectedTablePossessionIds(null)
    setSankeySelectionVersion((version) => version + 1)
  }

  function ouvrirVideo(possession) {
    const popup = openVideoWindow(possession)

    if (!popup) {
      setVideoWindowError(
        'Le navigateur a bloqué la fenêtre vidéo. Autorise les fenêtres pop-up pour ce site et réessaie.'
      )
      return
    }

    setVideoWindowError(null)
    setVideoWindow(popup)
    setSelectedPossession(possession)
  }

  function fermerVideo() {
    setSelectedPossession(null)
    setVideoWindow(null)
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
            onClick={() => {
              setTeamFilter('all')
              setSelectedTerrainPossessionIds(null)
              setSelectedTablePossessionIds(null)
            }}
          >
            Toutes les équipes
          </button>

          <button
            type="button"
            className={teamFilter === 'home' ? 'active' : ''}
            onClick={() => {
              setTeamFilter('home')
              setSelectedTerrainPossessionIds(null)
              setSelectedTablePossessionIds(null)
            }}
          >
            Domicile
          </button>

          <button
            type="button"
            className={teamFilter === 'away' ? 'active' : ''}
            onClick={() => {
              setTeamFilter('away')
              setSelectedTerrainPossessionIds(null)
              setSelectedTablePossessionIds(null)
            }}
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

            <div className="possession-dashboard">
              <section className="analysis-card possession-sankey-card">
                <div className="card-title">
                  <h2>Flux des possessions</h2>
                </div>
                {loading ? (
                  <div className="loading">Chargement des possessions...</div>
                ) : (
                  <SankeyDiagram
                    key={`${matchId}-${teamFilter}-${sankeySelectionVersion}`}
                    compact
                    height={520}
                    possessions={filteredPossessions}
                    onSelectionChange={handleSankeySelection}
                  />
                )}
              </section>

              <section className="analysis-card">
              <div className="card-title">
                <h2>Terrain des possessions</h2>
                <span>
                  {terrainPossessions.length} possessions · {filteredRucks.length} rucks
                </span>
              </div>
              {loading ? (
                <div className="loading">Chargement du terrain...</div>
              ) : (
                <RuckTerrain
                  rucks={filteredRucks}
                  viewMode={ruckViewMode}
                  onViewModeChange={setRuckViewMode}
                />
              )}
              <GainTerrainKpis stats={gainTerrainStats} />
              </section>
            </div>

            <section className="analysis-card">
              <div className="card-title">
                <div>
                  <h2>Suivi des possessions</h2>
                  <p>Une ligne = une possession ; chaque point représente un ruck</p>
                </div>
                <div className="possession-table-actions">
                  <span>{tablePossessions.length} / {filteredPossessions.length}</span>
                  {selectedTablePossessionIds !== null && (
                    <button
                      type="button"
                      onClick={resetSankeySelection}
                    >
                      Effacer le filtre Sankey
                    </button>
                  )}
                </div>
              </div>
              {loading ? (
                <div className="loading possession-table-loading">
                  Chargement du suivi des possessions...
                </div>
              ) : (
                <PossessionRuckTable
                  possessions={tablePossessions}
                  rucks={tableRucks}
                  viewMode={ruckViewMode}
                  onPossessionClick={ouvrirVideo}
                />
              )}
            </section>

            {videoWindowError && (
              <div className="error" role="alert">
                {videoWindowError}
              </div>
            )}

            {selectedPossession && (

              <VideoPlayer
                possession={selectedPossession}
                saison={saison}
                journee={journee}
                playerWindow={videoWindow}
                onClose={fermerVideo}
              />

            )}
          </>
        )}

      </main>

    </div>
  )
}

function GainTerrainKpis({ stats }) {
  return (
    <div className="gain-terrain-kpis" aria-label="Bilan du gain de terrain">
      <div className="gain-terrain-kpi gain-terrain-positive">
        <strong>{stats.gain}</strong>
        <span>Gain terrain (&gt; +2 m)</span>
      </div>
      <div className="gain-terrain-kpi gain-terrain-neutral">
        <strong>{stats.neutre}</strong>
        <span>Neutre (de -2 à +2 m)</span>
      </div>
      <div className="gain-terrain-kpi gain-terrain-negative">
        <strong>{stats.perte}</strong>
        <span>Perte de terrain (&lt; -2 m)</span>
      </div>
    </div>
  )
}

function RuckTerrain({ rucks, viewMode, onViewModeChange }) {
  return (
    <div className="pitch-container">
      <div className="pitch-view-switch">
        <button
          type="button"
          className={`pitch-view-button ${viewMode === 'contest' ? 'active' : ''}`}
          onClick={() => onViewModeChange('contest')}
        >
          Contest
        </button>
        <button
          type="button"
          className={`pitch-view-button ${viewMode === 'duration' ? 'active' : ''}`}
          onClick={() => onViewModeChange('duration')}
        >
          Durée ruck
        </button>
        <button
          type="button"
          className={`pitch-view-button ${viewMode === 'gain' ? 'active' : ''}`}
          onClick={() => onViewModeChange('gain')}
        >
          Gain terrain
        </button>
      </div>

      {viewMode === 'contest' ? (
        <div className="pitch-legend">
          <span>
            <i className="legend-dot contest-yes" />
            Contest oui
          </span>
          <span>
            <i className="legend-dot contest-no" />
            Contest non
          </span>
        </div>
      ) : viewMode === 'duration' ? (
        <div className="pitch-legend">
          {[1, 2, 3, 4, 5, 6].map((duration) => (
            <span key={duration}>
              <i className={`legend-dot duration-${duration}`} />
              {duration}
            </span>
          ))}
          <span>
            <i className="legend-dot duration-over-6" />
            +6s
          </span>
        </div>
      ) : (
        <div className="pitch-legend">
          <span>
            <i className="legend-dot gain-terrain-positive" />
            Gain terrain (&gt; +2 m)
          </span>
          <span>
            <i className="legend-dot gain-terrain-neutral" />
            Neutre (−2 à +2 m)
          </span>
          <span>
            <i className="legend-dot gain-terrain-negative" />
            Perte de terrain (&lt; −2 m)
          </span>
        </div>
      )}

      <div className="rugby-pitch">
        <div className="pitch-line line-22-left" />
        <div className="pitch-line line-half" />
        <div className="pitch-line line-22-right" />
        <div className="pitch-vertical-dashed vertical-5" />
        <div className="pitch-vertical-dashed vertical-40" />
        <div className="pitch-vertical-dashed vertical-60" />
        <div className="pitch-vertical-dashed vertical-95" />
        <div className="pitch-horizontal horizontal-5" />
        <div className="pitch-horizontal horizontal-15" />
        <div className="pitch-horizontal horizontal-55" />
        <div className="pitch-horizontal horizontal-65" />

        {rucks.map((ruck) => {
          const x = Math.max(0, Math.min(100, Number(ruck.x_ruck) || 0))
          const y = Math.max(0, Math.min(70, Number(ruck.y_ruck) || 0))
          const isContest = ruck.contest_ruck === 'oui'
          const pointClass = viewMode === 'contest'
            ? `ruck-point ${isContest ? 'contest' : 'no-contest'}`
            : viewMode === 'duration'
              ? `ruck-point ${getDurationClass(ruck.duree_ruck)}`
              : `ruck-point ${getGainTerrainClass(ruck.gain_metres_ruck)}`

          const gainCategory = getGainTerrainCategory(ruck.gain_metres_ruck)

          return (
            <div
              key={ruck.uuid_ruck}
              className={pointClass}
              style={{
                left: `${x}%`,
                top: `${100 - (y / 70) * 100}%`
              }}
              title={`Possession ${ruck.ordre_possession} · Ruck ${ruck.ordre_ruck}\nDurée : ${getDurationCategory(ruck.duree_ruck) || '-'}\nGain terrain : ${gainCategory || 'inconnu'}\nContest : ${isContest ? 'oui' : 'non'}\nX : ${x} m\nY : ${y} m`}
            />
          )
        })}
      </div>
    </div>
  )
}

function PossessionRuckTable({
  possessions,
  rucks,
  viewMode,
  onPossessionClick
}) {
  const rucksByPossession = useMemo(() => {
    const grouped = new Map()

    rucks.forEach((ruck) => {
      const possessionRucks = grouped.get(ruck.uuid_possession) || []
      possessionRucks.push(ruck)
      grouped.set(ruck.uuid_possession, possessionRucks)
    })

    return grouped
  }, [rucks])

  if (possessions.length === 0) {
    return <p className="possession-table-empty">Aucune possession à afficher.</p>
  }

  return (
    <div className="contest-table possession-ruck-table">
      <div className="possession-ruck-row possession-ruck-header" aria-hidden="true">
        <span />
        <span>Possession</span>
        <span>X début (m)</span>
        <span>X fin (m)</span>
        <span>Type début</span>
        <span>Type fin</span>
        <span>Rucks</span>
      </div>
      {possessions.map((possession) => {
        const possessionRucks = rucksByPossession.get(possession.uuid_possession) || []

        return (
          <div className="contest-row possession-ruck-row" key={possession.uuid_possession}>
            <button
              className="video-link"
              onClick={() => onPossessionClick(possession)}
              title="Voir la vidéo"
              type="button"
            >
              ▶
            </button>

            <div className="contest-possession-id">
              Possession #{possession.ordre_possession}
            </div>

            <span className="possession-table-value">
              {possession.x_debut_possession ?? '-'}
            </span>
            <span className="possession-table-value">
              {possession.x_fin_possession ?? '-'}
            </span>
            <span className="possession-table-value" title={possession.type_debut_possession || ''}>
              {formatPossessionType(possession.type_debut_possession)}
            </span>
            <span className="possession-table-value" title={possession.type_fin_possession || ''}>
              {formatPossessionType(possession.type_fin_possession)}
            </span>

            <div className="contest-dots">
              {possessionRucks.length > 0 ? possessionRucks.map((ruck) => (
                <div
                  key={ruck.uuid_ruck}
                  className={`contest-dot ${viewMode === 'contest'
                    ? (ruck.contest_ruck === 'oui' ? 'yes' : 'no')
                    : viewMode === 'duration'
                      ? `${getDurationClass(ruck.duree_ruck)} duration-label`
                      : getGainTerrainClass(ruck.gain_metres_ruck)}`}
                  title={`Ruck ${ruck.ordre_ruck} · ${
                    viewMode === 'contest'
                      ? `Contest ${ruck.contest_ruck || 'inconnu'}`
                      : viewMode === 'duration'
                        ? `Durée ${getDurationCategory(ruck.duree_ruck) || 'inconnue'}`
                        : `Gain terrain ${getGainTerrainCategory(ruck.gain_metres_ruck) || 'inconnu'}`
                  }`}
                >
                  {viewMode === 'duration'
                    ? getDurationCategory(ruck.duree_ruck) || '?'
                    : ruck.ordre_ruck}
                </div>
              )) : (
                <span className="possession-no-rucks">Aucun ruck</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatPossessionType(value) {
  return value
    ? String(value).replaceAll('_', ' ')
    : '-'
}

export default PossessionsPage