import { onBeforeUnmount, onMounted, computed, ref, shallowRef, watch } from 'vue'
import type { DominoDocument, GoalSet } from '@/shared/document'
import { createDefaultDocument } from '@/shared/defaults'
import { useLayout } from '@/features/layout'
import { useMechanisms } from '@/features/mechanisms'
import { useScene, clampToScene } from '@/features/scene'
import { useSimulation } from '@/features/simulation'
import { useReview } from '@/features/replay'
import { buildGoalReport, useGoals } from '@/features/goals'

const storageKey = 'chainline-jdk032-project-v1'

function normalizeGoals(parsed: DominoDocument): GoalSet {
  const ids = new Set(parsed.pieces.map(piece => piece.id))
  const goals = parsed.goals
  const windows = Array.isArray(goals?.windows)
    ? goals.windows.filter(window => window && ids.has(window.pieceId)
      && Number.isFinite(window.min) && Number.isFinite(window.max))
    : []
  const orders = Array.isArray(goals?.orders)
    ? goals.orders.filter(order => order && ids.has(order.beforeId) && ids.has(order.afterId)
      && Number.isFinite(order.margin))
    : []
  return { windows, orders }
}

function loadProject() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return createDefaultDocument()
    const parsed = JSON.parse(saved) as DominoDocument
    if (!Array.isArray(parsed.pieces) || !Array.isArray(parsed.connections) || !parsed.scene) return createDefaultDocument()
    parsed.goals = normalizeGoals(parsed)
    return parsed
  } catch {
    return createDefaultDocument()
  }
}

export function useWorkspace() {
  const document = shallowRef<DominoDocument>(loadProject())
  const saveState = ref<'saved' | 'saving' | 'unsaved'>('saved')
  const focusPieceId = ref<string | null>(null)
  let saveTimer = 0

  function changed() {
    document.value = {
      ...document.value,
      revision: document.value.revision + 1,
      updatedAt: Date.now(),
    }
    saveState.value = 'unsaved'
  }

  // 目标改动不顶版号：只触发保存，判定沿用当前运行结果实时重算；
  // 几何改动走 changed() 顶版号，旧运行随即过期，必须重新模拟核对。
  function touch() {
    document.value = { ...document.value, updatedAt: Date.now() }
    saveState.value = 'unsaved'
  }

  const layout = useLayout(document, changed)
  const mechanisms = useMechanisms(document, changed)
  const scene = useScene(document, changed)
  const simulation = useSimulation(document)
  const review = useReview(simulation.run)
  const goals = useGoals(document, touch)
  const goalReport = computed(() => buildGoalReport(document.value, simulation.run.value, simulation.stale.value))

  watch(document, next => {
    saveState.value = 'saving'
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
        saveState.value = 'saved'
      } catch {
        saveState.value = 'unsaved'
      }
    }, 380)
  })

  function place(kind: Parameters<typeof layout.add>[0], x: number, y: number) {
    const piece = { x, y, width: kind === 'ramp' ? 1.7 : 0.42, id: '', kind, label: '', height: 1, angle: 0, facing: 'east' as const, fallThreshold: 0.8, friction: 0.55 }
    const safe = clampToScene(document.value, piece)
    layout.add(kind, safe.x, safe.y)
  }
  function move(id: string, x: number, y: number) {
    const piece = document.value.pieces.find(item => item.id === id)
    if (!piece) return
    const safe = clampToScene(document.value, { ...piece, x, y })
    layout.move(id, safe.x, safe.y)
  }
  function focusEvent(id: string) {
    const event = simulation.run.value?.events.find(item => item.id === id)
    if (!event) return
    focusPieceId.value = event.pieceId
    layout.select(event.pieceId)
    review.focusEvent(id)
  }
  function onKeydown(event: KeyboardEvent) {
    const target = event.target
    if (target instanceof HTMLElement && target.matches('input, select, textarea, button')) return
    if (event.code === 'Space') {
      event.preventDefault()
      review.toggle()
    } else if (event.key === 'Escape') {
      layout.chooseTool(null)
      layout.select(null)
      focusPieceId.value = null
    } else {
      layout.handleKey(event)
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    window.clearTimeout(saveTimer)
  })

  return { document, saveState, focusPieceId, layout, mechanisms, scene, simulation, review, goals, goalReport, place, move, focusEvent }
}
