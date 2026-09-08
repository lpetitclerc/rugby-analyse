import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MatchSelector({
  saison,
  setSaison,
  journee,
  setJournee,
  matchId,
  setMatchId
}) {
  const [saisons, setSaisons] = useState([])
  const [journees, setJournees] = useState([])
  const [matches, setMatches] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    chargerSaisons()
  }, [])

  useEffect(() => {
    if (saison) {
      chargerJournees()
    } else {
      setJournees([])
      setJournee('')
    }
  }, [saison])

  useEffect(() => {
    if (saison && journee) {
      chargerMatches()
    } else {
      setMatches([])
      setMatchId('')
    }
  }, [saison, journee])

  async function chargerSaisons() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('match')
      .select('saison')
      .order('saison', { ascending: false })
      
      console.log('DATA SAISONS =', data)
      console.log('ERROR SAISONS =', error)
      
    
      if (error) {
      console.error(error)
      setError(error.message)
      setLoading(false)
      return
    }

    const valeurs = [
      ...new Set(
        (data || [])
          .map(row => row.saison)
          .filter(Boolean)
      )
    ]

    console.log('VALEURS SAISONS =', valeurs)
    
    setSaisons(valeurs)

    if (!saison && valeurs.length > 0) {
      setSaison(valeurs[0])
    }

    setLoading(false)
  }

  async function chargerJournees() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('match')
      .select('journee')
      .eq('saison', saison)
      .order('journee', { ascending: true })

    if (error) {
      console.error(error)
      setError(error.message)
      setLoading(false)
      return
    }

    const valeurs = [
      ...new Set(
        (data || [])
          .map(row => row.journee)
          .filter(Boolean)
      )
    ]

    setJournees(valeurs)

    if (!valeurs.includes(journee)) {
      setJournee(valeurs[0] || '')
    }

    setLoading(false)
  }

  async function chargerMatches() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('match')
      .select(`
        uuid_match,
        date,
        equipe_domicile,
        equipe_exterieur
      `)
      .eq('saison', saison)
      .eq('journee', journee)
      .order('date', { ascending: true })
    
    console.log('DATA SAISONS =', data)
    console.log('ERROR SAISONS =', error)
    
    if (error) {
      console.error(error)
      setError(error.message)
      setLoading(false)
      return
    }

    setMatches(data || [])

    const ids = (data || []).map(row => row.uuid_match)

    if (!ids.includes(matchId)) {
      setMatchId(ids[0] || '')
    }

    setLoading(false)
  }

  return (
    <div className="global-filters">

      <div className="filter-group">
        <label>Saison</label>

        <select
          value={saison}
          onChange={(e) => {
            setSaison(e.target.value)
            setJournee('')
            setMatchId('')
          }}
        >
          {saisons.map(value => (
            <option
              key={value}
              value={value}
            >
              {value}
            </option>
          ))}
        </select>
      </div>


      <div className="filter-group">
        <label>Journée</label>

        <select
          value={journee}
          onChange={(e) => {
            setJournee(e.target.value)
            setMatchId('')
          }}
        >
          {journees.map(value => (
            <option
              key={value}
              value={value}
            >
              {value}
            </option>
          ))}
        </select>
      </div>


      <div className="filter-group match-filter">
        <label>Match</label>

        <select
          value={matchId}
          onChange={(e) =>
            setMatchId(e.target.value)
          }
        >
          {matches.map(match => (
            <option
              key={match.uuid_match}
              value={match.uuid_match}
            >
              {match.equipe_domicile}
              {' - '}
              {match.equipe_exterieur}
            </option>
          ))}
        </select>
      </div>


      {loading && (
        <div className="filter-status">
          Chargement...
        </div>
      )}

      {error && (
        <div className="filter-error">
          {error}
        </div>
      )}

    </div>
  )
}