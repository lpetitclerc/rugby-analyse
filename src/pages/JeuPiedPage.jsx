import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function JeuPiedPage({ matchId }) {
  const [jeuxPied, setJeuxPied] = useState([])
  const [possessions, setPossessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!matchId) {
      setJeuxPied([])
      setPossessions([])
      return
    }

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const [jeuPiedResult, possessionResult] = await Promise.all([
          supabase
            .from('v_jeu_pied')
            .select('*')
            .eq('uuid_match', matchId),

          supabase
            .from('v_suivi_possession')
            .select('*')
            .eq('uuid_match', matchId)
            .order('ordre_possession', { ascending: true }),
        ])

        if (jeuPiedResult.error) {
          throw jeuPiedResult.error
        }

        if (possessionResult.error) {
          throw possessionResult.error
        }

        setJeuxPied(jeuPiedResult.data || [])
        setPossessions(possessionResult.data || [])
      } catch (err) {
        console.error('Erreur chargement jeu au pied :', err)
        setError(err.message || 'Erreur lors du chargement des données.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [matchId])

  const jeuxPiedDomicile = useMemo(
    () => jeuxPied.filter((item) => Number(item.equipe_domicile) === 1),
    [jeuxPied]
  )

  const jeuxPiedExterieur = useMemo(
    () => jeuxPied.filter((item) => Number(item.equipe_domicile) === 0),
    [jeuxPied]
  )

  const possessionsDomicile = useMemo(
    () => possessions.filter((item) => Number(item.equipe_domicile) === 1),
    [possessions]
  )

  const possessionsExterieur = useMemo(
    () => possessions.filter((item) => Number(item.equipe_domicile) === 0),
    [possessions]
  )

  const nomDomicile =
    jeuxPiedDomicile[0]?.nom_equipe_domicile ||
    possessionsDomicile[0]?.nom_equipe ||
    'Équipe domicile'

  const nomExterieur =
    jeuxPiedExterieur[0]?.nom_equipe_exterieur ||
    possessionsExterieur[0]?.nom_equipe ||
    'Équipe extérieure'

  if (!matchId) {
    return (
      <div className="jeu-pied-page">
        <div className="empty-state">
          Sélectionne un match pour afficher le suivi du jeu au pied.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="jeu-pied-page">
        <div className="empty-state">Chargement...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="jeu-pied-page">
        <div className="error-message">{error}</div>
      </div>
    )
  }

  return (
    <div className="jeu-pied-page">

      <div className="page-heading">
        <div>
          <h1>Jeu au pied</h1>
          <p>
            Trajectoires des jeux au pied et évolution territoriale
            des possessions.
          </p>
        </div>
      </div>

      {/* =====================================================
          TRAJECTOIRES JEU AU PIED
      ===================================================== */}

      <section className="jeu-pied-section">

        <div className="section-title-row">
          <div>
            <h2>Trajectoires du jeu au pied</h2>
            <p>
              Départ et arrivée de chaque jeu au pied.
            </p>
          </div>
        </div>

        <div className="kick-pitches-grid">

          <KickPitchCard
            title={nomDomicile}
            subtitle="Équipe domicile"
            kicks={jeuxPiedDomicile}
          />

          <KickPitchCard
            title={nomExterieur}
            subtitle="Équipe extérieure"
            kicks={jeuxPiedExterieur}
          />

        </div>
      </section>

      {/* =====================================================
          GAIN / PERTE DE TERRAIN
      ===================================================== */}

      <section className="jeu-pied-section">

        <div className="section-title-row">
          <div>
            <h2>Gain / perte de terrain</h2>
            <p>
              Évolution territoriale entre deux possessions
              successives d'une même équipe.
            </p>
          </div>
        </div>

        <div className="territory-grid">

          <TerritoryCard
            title={nomDomicile}
            subtitle="Équipe domicile"
            possessions={possessionsDomicile}
          />

          <TerritoryCard
            title={nomExterieur}
            subtitle="Équipe extérieure"
            possessions={possessionsExterieur}
          />

        </div>
      </section>

    </div>
  )
}


/* ============================================================
   CARTE TERRAIN JEU AU PIED
============================================================ */

function KickPitchCard({ title, subtitle, kicks }) {
  return (
    <div className="kick-card">

      <div className="kick-card-header">
        <div>
          <span className="kick-team-type">{subtitle}</span>
          <h3>{title}</h3>
        </div>

        <div className="kick-count">
          <strong>{kicks.length}</strong>
          <span>jeux au pied</span>
        </div>
      </div>

      <RugbyKickPitch kicks={kicks} />

    </div>
  )
}


/* ============================================================
   TERRAIN SVG
============================================================ */

function RugbyKickPitch({ kicks }) {
  const markerId = `kick-arrow-${Math.random()
    .toString(36)
    .slice(2)}`

  return (
    <div className="kick-pitch-wrapper">

      <svg
        viewBox="0 0 100 70"
        className="kick-pitch"
        preserveAspectRatio="xMidYMid meet"
      >

        <defs>
          <marker
            id={markerId}
            markerWidth="4"
            markerHeight="4"
            refX="3.5"
            refY="2"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M 0 0 L 4 2 L 0 4 z"
              className="kick-arrow-head"
            />
          </marker>
        </defs>

        {/* Terrain */}

        <rect
          x="0"
          y="0"
          width="100"
          height="70"
          className="kick-pitch-background"
        />

        {/* Lignes principales */}

        <line
          x1="22"
          y1="0"
          x2="22"
          y2="70"
          className="kick-field-line main"
        />

        <line
          x1="50"
          y1="0"
          x2="50"
          y2="70"
          className="kick-field-line main"
        />

        <line
          x1="78"
          y1="0"
          x2="78"
          y2="70"
          className="kick-field-line main"
        />

        {/* Lignes verticales pointillées */}

        <line
          x1="5"
          y1="0"
          x2="5"
          y2="70"
          className="kick-field-line dashed"
        />

        <line
          x1="40"
          y1="0"
          x2="40"
          y2="70"
          className="kick-field-line dashed"
        />

        <line
          x1="60"
          y1="0"
          x2="60"
          y2="70"
          className="kick-field-line dashed"
        />

        <line
          x1="95"
          y1="0"
          x2="95"
          y2="70"
          className="kick-field-line dashed"
        />

        {/* Lignes horizontales */}

        {[5, 15, 55, 65].map((y) => (
          <line
            key={y}
            x1="0"
            y1={70 - y}
            x2="100"
            y2={70 - y}
            className="kick-field-line dashed"
          />
        ))}

        {/* Jeux au pied */}

        {kicks.map((kick) => {
          const x1 = clamp(kick.x_debut_jeu_pied, 0, 100)
          const y1 = clamp(kick.y_debut_jeu_pied, 0, 70)

          const x2 = clamp(kick.x_fin_jeu_pied, 0, 100)
          const y2 = clamp(kick.y_fin_jeu_pied, 0, 70)

          if (
            x1 === null ||
            y1 === null ||
            x2 === null ||
            y2 === null
          ) {
            return null
          }

          return (
            <g
              key={kick.uuid_jeu_pied}
              className="kick-trajectory"
            >

              <title>
                {`${kick.equipe || ''}
Résultat : ${kick.resultat_jeu_pied || '-'}
Départ : ${x1}, ${y1}
Arrivée : ${x2}, ${y2}`}
              </title>

              <line
                x1={x1}
                y1={70 - y1}
                x2={x2}
                y2={70 - y2}
                className="kick-line"
                markerEnd={`url(#${markerId})`}
              />

              <circle
                cx={x1}
                cy={70 - y1}
                r="1.1"
                className="kick-start"
              />

              <circle
                cx={x2}
                cy={70 - y2}
                r="0.8"
                className="kick-end"
              />

            </g>
          )
        })}

      </svg>

      {kicks.length === 0 && (
        <div className="kick-pitch-empty">
          Aucun jeu au pied
        </div>
      )}

    </div>
  )
}


/* ============================================================
   GAIN / PERTE POSSESSION
============================================================ */

function TerritoryCard({ title, subtitle, possessions }) {
  return (
    <div className="territory-card">

      <div className="territory-card-header">
        <div>
          <span className="kick-team-type">{subtitle}</span>
          <h3>{title}</h3>
        </div>
      </div>

      <div className="territory-table-header">
        <span>Fin possession</span>
        <span>Gain / perte</span>
        <span>Début suivant</span>
      </div>

      <div className="territory-list">

        {possessions.map((possession) => (
          <TerritoryRow
            key={possession.uuid_possession}
            possession={possession}
          />
        ))}

        {possessions.length === 0 && (
          <div className="territory-empty">
            Aucune possession disponible.
          </div>
        )}

      </div>

    </div>
  )
}


function TerritoryRow({ possession }) {
  const gain = Number(possession.gain_perte)

  const isValidGain = Number.isFinite(gain)

  const gainClass = !isValidGain
    ? 'neutral'
    : gain > 0
      ? 'positive'
      : gain < 0
        ? 'negative'
        : 'neutral'

  const formattedGain = !isValidGain
    ? '-'
    : gain > 0
      ? `+${gain} m`
      : `${gain} m`

  return (
    <div className="territory-row">

      <div className="territory-event left">
        <span className="territory-possession-number">
          {possession.possession}
        </span>

        <strong>
          {formatEvent(possession.type_fin_possession)}
        </strong>

        <small>
          x = {formatCoordinate(possession.x_fin_possession)}
        </small>
      </div>

      <div className={`territory-gain ${gainClass}`}>

        <div className="territory-gain-value">
          {formattedGain}
        </div>

        <div className="territory-gain-line">
          <span />
        </div>

      </div>

      <div className="territory-event right">
        <strong>
          {formatEvent(possession.tdp)}
        </strong>

        <small>
          x = {formatCoordinate(possession.xdp)}
        </small>
      </div>

    </div>
  )
}


/* ============================================================
   HELPERS
============================================================ */

function clamp(value, min, max) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null
  }

  const number = Number(value)

  if (!Number.isFinite(number)) {
    return null
  }

  return Math.max(min, Math.min(max, number))
}


function formatCoordinate(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '-'
  }

  return number
}


function formatEvent(value) {
  if (!value) {
    return '-'
  }

  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}