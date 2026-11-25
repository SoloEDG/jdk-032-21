import type { Piece, Vec2 } from '@/shared/document'

export function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function roundedPosition(point: Vec2) {
  return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 }
}

export function forwardVector(piece: Piece): Vec2 {
  const radians = piece.angle * Math.PI / 180
  return { x: Math.cos(radians), y: Math.sin(radians) }
}

export function angleBetween(a: Vec2, b: Vec2) {
  const denominator = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)
  if (!denominator) return 180
  const dot = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / denominator))
  return Math.acos(dot) * 180 / Math.PI
}

export interface ContactCandidate {
  piece: Piece
  distance: number
  alignment: number
}

export function contactCandidates(source: Piece, candidates: readonly Piece[], reachScale = 1): ContactCandidate[] {
  const facing = forwardVector(source)
  return candidates
    .filter(piece => piece.id !== source.id)
    .map(piece => {
      const delta = { x: piece.x - source.x, y: piece.y - source.y }
      return { piece, distance: distance(source, piece), alignment: angleBetween(facing, delta) }
    })
    .filter(entry => entry.distance < source.height * 1.18 * reachScale && entry.alignment < 47)
    .sort((a, b) => a.distance - b.distance || a.piece.id.localeCompare(b.piece.id))
}

export function nextContact(source: Piece, candidates: readonly Piece[], reachScale = 1) {
  return contactCandidates(source, candidates, reachScale)[0]?.piece ?? null
}
