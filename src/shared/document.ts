export type PieceKind = 'domino' | 'ramp' | 'splitter' | 'trigger'
export type Axis = 'north' | 'east' | 'south' | 'west'

export interface Vec2 { x: number; y: number }

export interface Piece {
  id: string
  kind: PieceKind
  x: number
  y: number
  angle: number
  facing: Axis
  label: string
  height: number
  width: number
  fallThreshold: number
  friction: number
}

export interface MechanismConnection {
  id: string
  from: string
  to: string
  delay: number
  enabled: boolean
}

export interface SceneSettings {
  gravity: number
  friction: number
  width: number
  height: number
  showGrid: boolean
}

export interface GoalWindow {
  id: string
  pieceId: string
  min: number
  max: number
}

export interface GoalOrder {
  id: string
  beforeId: string
  afterId: string
  margin: number
}

export interface GoalSet {
  windows: GoalWindow[]
  orders: GoalOrder[]
}

export interface DominoDocument {
  id: string
  title: string
  revision: number
  updatedAt: number
  pieces: Piece[]
  connections: MechanismConnection[]
  scene: SceneSettings
  startPieceId: string
  goals: GoalSet
}

export interface SimulationEvent {
  id: string
  pieceId: string
  time: number
  causeId: string | null
  kind: 'trigger' | 'fall' | 'mechanism' | 'interrupted'
  detail: string
}

export interface ContactAlternative {
  pieceId: string
  distance: number
  alignment: number
}

export interface ContactRecord {
  pieceId: string
  eventId: string
  targetId: string | null
  via: 'geometry' | 'connection' | 'none'
  reach: number | null
  cone: number | null
  chosen: ContactAlternative | null
  alternatives: ContactAlternative[]
}

export interface SimulationRun {
  id: string
  documentId: string
  revision: number
  startedAt: number
  startPieceId: string
  status: 'complete' | 'interrupted' | 'empty'
  events: SimulationEvent[]
  contacts: ContactRecord[]
  interruptedPieceId: string | null
  interruptionReason: string | null
  duration: number
}
