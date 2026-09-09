import {
  ResponsiveContainer,
  Sankey,
  Tooltip
} from 'recharts'

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

  function addLink(
    source,
    target,
    possession
  ) {
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

    const gain =
      possession.gain_perte_terrain ||
      'Inconnu'

    const fin =
      possession.type_fin_possession ||
      'Inconnu'

    // Niveau 0 : début de possession
    const nodeDebut =
      getNode(debut, 0)

    // Niveau 1 : gain / perte de terrain
    const nodeGain =
      getNode(gain, 1)

    // Niveau 2 : fin de possession
    const nodeFin =
      getNode(fin, 2)

    // Début → Gain / perte
    addLink(
      nodeDebut,
      nodeGain,
      possession
    )

    // Gain / perte → Fin
    addLink(
      nodeGain,
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
  onLinkClick
}) {

  const data =
    buildSankeyData(possessions)

  return (
    <div
      style={{
        width: '100%',
        height: '650px'
      }}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
      >

        <Sankey
          data={data}
          nodePadding={30}
          nodeWidth={18}
          margin={{
            top: 30,
            right: 150,
            bottom: 30,
            left: 150
          }}
          iterations={32}
          linkCurvature={0.5}
          node={
            <SankeyNode />
          }
          link={
            <SankeyLink
              onLinkClick={onLinkClick}
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
  payload
}) {

  return (
    <g>

      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill="#475569"
      />

      <text
        x={x + width + 8}
        y={y + height / 2}
        dominantBaseline="middle"
        fill="#e2e8f0"
        fontSize={13}
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
  onLinkClick
}) {

  const path = `
    M${sourceX},${sourceY}
    C${sourceControlX},${sourceY}
     ${targetControlX},${targetY}
     ${targetX},${targetY}
  `

  function handleClick() {

    if (
      payload?.possessions?.length
    ) {
      onLinkClick(
        payload.possessions
      )
    }
  }

  return (
    <path
      d={path}
      stroke="#64748b"
      strokeWidth={
        Math.max(linkWidth, 2)
      }
      fill="none"
      opacity={0.55}
      onClick={handleClick}
      style={{
        cursor: 'pointer'
      }}
    />
  )
}