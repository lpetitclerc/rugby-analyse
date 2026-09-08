import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import {
  useEffect,
  useMemo,
  useState
} from 'react'

import { supabase }
  from '../lib/supabase'

import VideoPlayer
  from '../components/VideoPlayer'

import '../App.css'


function RucksPage({
  saison,
  journee,
  matchId
}) {

  const [rucks, setRucks] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState(null)

  const [
    selectedPossession,
    setSelectedPossession
  ] = useState(null)

  const [teamFilter, setTeamFilter] =
  useState('all')

    useEffect(() => {
    if (matchId) {
        chargerRucks()
    }
    }, [matchId])


  async function chargerRucks() {

    setLoading(true)
    setError(null)

    let query = supabase
  .from('v_ruck')
  .select('*')

if (matchId) {
  query = query.eq(
    'uuid_match',
    matchId
  )
}

const {
  data,
  error
} = await query
  .order(
    'uuid_possession',
    {
      ascending: true
    }
  )
  .order(
    'ordre_ruck',
    {
      ascending: true
    }
  )
      .order(
        'uuid_possession',
        {
          ascending: true
        }
      )

    if (error) {

      console.error(
        'Erreur v_ruck :',
        error
      )

      setError(error.message)

    } else {

      setRucks(data || [])

    }

    setLoading(false)
  }


  /*
   * Rucks de l'équipe à domicile
   */
  const rucksDomicile =
    useMemo(
      () =>
        rucks.filter(
          ruck =>
            ruck.equipe_domicile === 1
        ),
      [rucks]
    )


  /*
   * Rucks de l'équipe visiteuse
   */
  const rucksVisiteur =
    useMemo(
      () =>
        rucks.filter(
          ruck =>
            ruck.equipe_domicile === 0
        ),
      [rucks]
    )
    
  const filteredRucks =
  useMemo(() => {

    if (teamFilter === 'home') {
      return rucksDomicile
    }

    if (teamFilter === 'away') {
      return rucksVisiteur
    }

    return rucks

  }, [
    teamFilter,
    rucks,
    rucksDomicile,
    rucksVisiteur
  ])

  const contestChartData =
  useMemo(() => {

    const map = new Map()

    filteredRucks.forEach(ruck => {

      const ordre =
        Number(ruck.ordre_ruck)

      if (!ordre) {
        return
      }

      if (!map.has(ordre)) {
        map.set(ordre, {
          ordre,
          total: 0,
          contests: 0
        })
      }

      const item = map.get(ordre)

      item.total += 1

      if (ruck.contest_ruck === 'oui') {
        item.contests += 1
      }

    })

    return Array
      .from(map.values())
      .sort(
        (a, b) =>
          a.ordre - b.ordre
      )
      .map(item => ({
        ...item,

        pourcentage:
          item.total > 0
            ? Math.round(
                item.contests
                / item.total
                * 100
              )
            : 0
      }))

  }, [filteredRucks])

  const statsDomicile =
    calculerStats(rucksDomicile)

  const statsVisiteur =
    calculerStats(rucksVisiteur)


  if (loading) {

    return (
      <div className="page">
        <div className="loading">
          Chargement des rucks...
        </div>
      </div>
    )
  }


  return (

    <div className="page">

      <header className="page-header">

        <div>

          <h1>
            Rucks & Contests
          </h1>

          <p>
            Analyse des contests de ruck
          </p>

        </div>

        <button
          className="refresh-button"
          onClick={chargerRucks}
        >
          ↻ Actualiser
        </button>

      </header>


      {error && (

        <div className="error">
          Erreur Supabase :
          {' '}
          {error}
        </div>

      )}


      {/* KPI */}

      <section className="ruck-kpis">

        <Kpi
          label="Rucks"
          value={rucks.length}
        />

        <Kpi
          label="Contests"
          value={
            rucks.filter(
              r =>
                r.contest_ruck === 'oui'
            ).length
          }
        />

        <Kpi
          label="% contest"
          value={
            formatPercentage(
              rucks.filter(
                r =>
                  r.contest_ruck === 'oui'
              ).length,
              rucks.length
            )
          }
        />

        <Kpi
          label="Rucks domicile"
          value={rucksDomicile.length}
        />

        <Kpi
          label="Rucks visiteur"
          value={rucksVisiteur.length}
        />

      </section>


      {/* TERRAINS */}

      <section className="pitches-grid">

        <div className="analysis-card">

          <div className="card-title">

            <h2>
              Rucks domicile
            </h2>

            <span>
              {
                statsDomicile.contests
              }
              {' / '}
              {
                statsDomicile.total
              }
              {' contests'}
            </span>

          </div>

          <RugbyPitch
            rucks={rucksDomicile}
          />

          <ZoneStats
            stats={statsDomicile}
          />

        </div>


        <div className="analysis-card">

          <div className="card-title">

            <h2>
              Rucks visiteur
            </h2>

            <span>
              {
                statsVisiteur.contests
              }
              {' / '}
              {
                statsVisiteur.total
              }
              {' contests'}
            </span>

          </div>

          <RugbyPitch
            rucks={rucksVisiteur}
          />

          <ZoneStats
            stats={statsVisiteur}
          />

        </div>

      </section>


      {/* SUIVI POSSESSION */}

      <section className="analysis-card">

        <div className="card-title">

  <div>
    <h2>
      Suivi des contests
    </h2>

    <p>
      Une ligne = une possession
    </p>
  </div>

  <div className="team-filter">

    <button
      className={
        teamFilter === 'all'
          ? 'team-filter-button active'
          : 'team-filter-button'
      }
      onClick={() =>
        setTeamFilter('all')
      }
    >
      Toutes
    </button>

    <button
      className={
        teamFilter === 'home'
          ? 'team-filter-button active'
          : 'team-filter-button'
      }
      onClick={() =>
        setTeamFilter('home')
      }
    >
      Domicile
    </button>

    <button
      className={
        teamFilter === 'away'
          ? 'team-filter-button active'
          : 'team-filter-button'
      }
      onClick={() =>
        setTeamFilter('away')
      }
    >
      Extérieur
    </button>

  </div>

</div>

        <PossessionContestTable
          rucks={filteredRucks}
          onPossessionClick={
            setSelectedPossession
          }
        />

      </section>

<section className="analysis-card">

  <div className="card-title">

    <div>
      <h2>
        Rucks contestés par ordre de ruck
      </h2>

      <p>
        Nombre et pourcentage de contests
      </p>
    </div>

  </div>

  <ContestChart
    data={contestChartData}
  />

</section>

      {/* VIDEO */}

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

    </div>
  )
}


/*
 * KPI
 */

function Kpi({
  label,
  value
}) {

  return (

    <div className="ruck-kpi">

      <strong>
        {value}
      </strong>

      <span>
        {label}
      </span>

    </div>

  )
}


/*
 * TERRAIN
 */

function RugbyPitch({
  rucks
}) {

  return (

    <div className="rugby-pitch">

      {/* lignes verticales */}

      <div className="pitch-line line-22-left" />

      <div className="pitch-line line-half" />

      <div className="pitch-line line-22-right" />


      {/* lignes horizontales */}

      <div className="pitch-horizontal horizontal-1" />

      <div className="pitch-horizontal horizontal-2" />


      {rucks.map(
        ruck => {

          const x =
            Math.max(
              0,
              Math.min(
                100,
                Number(ruck.x_ruck) || 0
              )
            )

          const y =
            Math.max(
              0,
              Math.min(
                100,
                Number(ruck.y_ruck) || 0
              )
            )

          const contest =
            ruck.contest_ruck === 'oui'

          return (

            <div
              key={ruck.uuid_ruck}
              className={
                contest
                  ? 'ruck-point contest'
                  : 'ruck-point no-contest'
              }
              style={{
                left: `${x}%`,
                top: `${100 - y}%`
              }}
              title={
                `Ruck ${ruck.ordre_ruck}
Contest : ${
                  contest
                    ? 'oui'
                    : 'non'
                }
Durée : ${ruck.duree_ruck ?? '-'}`
              }
            />

          )
        }
      )}

    </div>

  )
}


/*
 * STATS PAR ZONE
 */

function ZoneStats({
  stats
}) {

  const zones = [
    {
      key: 'zone_embut_22',
      label: 'En-but → 22'
    },
    {
      key: 'zone_22_50',
      label: '22 → 50'
    },
    {
      key: 'zone_50_22',
      label: '50 → 22'
    },
    {
      key: 'zone_22_embut',
      label: '22 → en-but'
    }
  ]

  return (

    <div className="zone-stats">

      {zones.map(
        zone => {

          const data =
            stats.zones[
              zone.key
            ] || {
              total: 0,
              contests: 0
            }

          return (

            <div
              className="zone-stat"
              key={zone.key}
            >

              <span className="zone-label">
                {zone.label}
              </span>

              <strong>
                {data.contests}
                {' / '}
                {data.total}
              </strong>

              <span>
                {
                  formatPercentage(
                    data.contests,
                    data.total
                  )
                }
              </span>

            </div>

          )
        }
      )}

    </div>
  )
}


/*
 * TABLE POSSESSIONS
 */

function ContestChart({
  data
}) {

  return (

    <div className="contest-chart">

      <ResponsiveContainer
        width="100%"
        height={380}
      >

        <ComposedChart
          data={data}
          margin={{
            top: 25,
            right: 35,
            left: 10,
            bottom: 10
          }}
        >

          <CartesianGrid
            strokeDasharray="3 3"
            opacity={0.15}
          />

          <XAxis
            dataKey="ordre"
            label={{
              value: 'Ordre du ruck',
              position: 'insideBottom',
              offset: -5
            }}
          />

          <YAxis
            yAxisId="count"
            allowDecimals={false}
            label={{
              value: 'Nombre',
              angle: -90,
              position: 'insideLeft'
            }}
          />

          <YAxis
            yAxisId="percent"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={
              value => `${value}%`
            }
          />

          <Tooltip
            formatter={(
              value,
              name
            ) => {

              if (
                name ===
                '% contestés'
              ) {
                return [
                  `${value}%`,
                  name
                ]
              }

              return [
                value,
                name
              ]
            }}
            labelFormatter={
              ordre =>
                `Ruck n°${ordre}`
            }
          />

          <Legend />

          <Bar
            yAxisId="count"
            dataKey="contests"
            name="Rucks contestés"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
          />

          <Line
            yAxisId="percent"
            type="monotone"
            dataKey="pourcentage"
            name="% contestés"
            stroke="#f97316"
            strokeWidth={3}
            dot={{
              r: 4
            }}
          />

        </ComposedChart>

      </ResponsiveContainer>

    </div>

  )
}

function PossessionContestTable({
  rucks,
  onPossessionClick
}) {

  const possessions =
    useMemo(
      () =>
        grouperParPossession(
          rucks
        ),
      [rucks]
    )


  return (

    <div className="contest-table">

      {possessions.map(
        possession => (

          <div
            className="contest-row"
            key={
              possession
                .uuid_possession
            }
          >

            <button
              className="video-link"
              onClick={() =>
                onPossessionClick({
                  uuid_possession:
                    possession
                      .uuid_possession
                })
              }
              title="Voir la vidéo"
            >
              ▶
            </button>


            <div className="contest-possession-id">

              {
                possession
                  .uuid_possession
              }

            </div>


            <div className="contest-dots">

              {possession.rucks.map(
                ruck => (

                  <div
                    key={
                      ruck.uuid_ruck
                    }
                    className={
                      ruck.contest_ruck
                        === 'oui'
                        ? 'contest-dot yes'
                        : 'contest-dot no'
                    }
                    title={
                      `Ruck ${
                        ruck.ordre_ruck
                      }`
                    }
                  >

                    {
                      ruck.ordre_ruck
                    }

                  </div>

                )
              )}

            </div>

          </div>

        )
      )}

    </div>

  )
}


/*
 * CALCULS
 */

function grouperParPossession(
  rucks
) {

  const map =
    new Map()

  rucks.forEach(
    ruck => {

      const uuid =
        ruck.uuid_possession

      if (!map.has(uuid)) {

        map.set(
          uuid,
          {
            uuid_possession:
              uuid,
            rucks: []
          }
        )

      }

      map.get(uuid)
        .rucks
        .push(ruck)

    }
  )


  return Array
    .from(map.values())
    .map(
      possession => {

        possession.rucks.sort(
          (a, b) =>
            Number(
              a.ordre_ruck
            )
            -
            Number(
              b.ordre_ruck
            )
        )

        return possession

      }
    )
}


function calculerStats(
  rucks
) {

  const result = {

    total:
      rucks.length,

    contests:
      rucks.filter(
        ruck =>
          ruck.contest_ruck
          === 'oui'
      ).length,

    zones: {}

  }


  rucks.forEach(
    ruck => {

      const zone =
        ruck.zone_ruck
        || 'N/A'

      if (
        !result.zones[zone]
      ) {

        result.zones[zone] = {
          total: 0,
          contests: 0
        }

      }

      result
        .zones[zone]
        .total += 1

      if (
        ruck.contest_ruck
        === 'oui'
      ) {

        result
          .zones[zone]
          .contests += 1

      }

    }
  )


  return result
}


function formatPercentage(
  value,
  total
) {

  if (!total) {
    return '0 %'
  }

  return (
    Math.round(
      value
      / total
      * 100
    )
    + ' %'
  )
}


export default RucksPage