import {
  ResponsiveContainer,
  Sankey,
  Tooltip
} from 'recharts'
import { useState } from 'react'

function buildSankeyData(possessions) {
  const nodes = []
  const nodeMap = new Map()
  const links = new Map()

  function getNode(name, level) {
    const key = `${level}-${name}`

    if (!nodeMap.has(key)) {
      nodeMap.set(key, nodes.length)

      nodes.push({
        name,
        level
      })
    }

    return nodeMap.get(key)
  }

  function addLink(source, target, possession) {
    const key = `${source}-${target}`

    if (!links.has(key)) {
      links.set(key, {
        source,
        target,
        value: 0,
        possessions: []
      })
    }

    const link = links.get(key)

    link.value += 1
    link.possessions.push(possession)
  }

  possessions.forEach((possession) => {

    const debut =
      possession.type_debut_possession ||
      'Inconnu'

    const fin =
      possession.type_fin_possession ||
      'Inconnu'

    // Niveau 0 : début de possession
    const nodeDebut = getNode(debut, 0)

    // Niveau 1 : fin de possession
    const nodeFin = getNode(fin, 1)

    // Début → Fin
    addLink(
      nodeDebut,
      nodeFin,
      possession
    )
  })

  return {
    nodes,
    links: Array.from(links.values())
  }
}

export default function SankeyDiagram({
  possessions,
  onLinkClick,
  onSelectionChange,
  height = 650,
  compact = false
}) {
  const [selectedNode, setSelectedNode] = useState(null)

  const data = buildSankeyData(possessions)

  function handleNodeClick(payload) {
    const selection = {
      name: payload.name,
      level: payload.level
    }

    const nextSelection =
      selectedNode?.name === selection.name &&
      selectedNode?.level === selection.level
        ? null
        : selection

    setSelectedNode(nextSelection)
    onSelectionChange?.(
      nextSelection
        ? possessions.filter((possession) => {
            const name = nextSelection.level === 0
              ? possession.type_debut_possession
              : possession.type_fin_possession

            return (name || 'Inconnu') === nextSelection.name
          })
        : possessions
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: `${height}px`
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={data}
          nodePadding={30}
          nodeWidth={18}
          margin={{
            top: compact ? 12 : 30,
            right: compact ? 100 : 150,
            bottom: compact ? 12 : 30,
            left: compact ? 100 : 150
          }}
          iterations={32}
          linkCurvature={0.5}
          node={
            <SankeyNode
              selectedNode={selectedNode}
              onNodeClick={handleNodeClick}
              compact={compact}
            />
          }
          link={
            <SankeyLink
              selectedNode={selectedNode}
              onLinkClick={onLinkClick}
              onSelectionChange={onSelectionChange}
            />
          }
        >
          <Tooltip />
        </Sankey>
      </ResponsiveContainer>
    </div>
  )
}

function SankeyNode({
  x,
  y,
  width,
  height,
  payload,
  selectedNode,
  onNodeClick,
  compact
}) {
  const isSelected =
    selectedNode?.name === payload?.name &&
    selectedNode?.level === payload?.level

  return (
    <g
      onClick={() => onNodeClick(payload)}
      style={{
        cursor: 'pointer'
      }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={isSelected ? '#2563eb' : '#475569'}
      />

      <text
        x={payload.level === 0 ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={payload.level === 0 ? 'end' : 'start'}
        dominantBaseline="middle"
        fill={isSelected ? '#60a5fa' : '#e2e8f0'}
        fontSize={compact ? 11 : 13}
        fontWeight={isSelected ? 700 : 400}
      >
        {payload.name}
      </text>
    </g>
  )
}

function SankeyLink({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
  selectedNode,
  onLinkClick,
  onSelectionChange
}) {
  const path = `
    M${sourceX},${sourceY}
    C${sourceControlX},${sourceY}
     ${targetControlX},${targetY}
     ${targetX},${targetY}
  `

  const firstPossession = payload?.possessions?.[0]

  const startName =
    firstPossession?.type_debut_possession || 'Inconnu'

  const endName =
    firstPossession?.type_fin_possession || 'Inconnu'

  let isHighlighted = false

  if (selectedNode?.level === 0) {
    // Nœud de départ : flux sortants
    isHighlighted = startName === selectedNode.name
  }

  if (selectedNode?.level === 1) {
    // Nœud d'arrivée : flux entrants
    isHighlighted = endName === selectedNode.name
  }

  const isDimmed =
    selectedNode !== null && !isHighlighted

  function handleClick() {
    if (payload?.possessions?.length) {
      onSelectionChange?.(payload.possessions)
      onLinkClick?.(payload.possessions)
    }
  }

  return (
    <path
      d={path}
      stroke={isHighlighted ? '#3b82f6' : '#64748b'}
      strokeWidth={Math.max(linkWidth, 2)}
      fill="none"
      opacity={
        isHighlighted
          ? 0.95
          : isDimmed
            ? 0.12
            : 0.55
      }
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        transition: 'stroke 0.2s, opacity 0.2s'
      }}
    />
  )
}