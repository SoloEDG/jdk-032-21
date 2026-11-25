import type { Ref } from 'vue'
import type { DominoDocument, GoalOrder, GoalSet, GoalWindow } from '@/shared/document'
import { stableId } from '@/shared/time'

export function useGoals(document: Ref<DominoDocument>, touch: () => void) {
  function patchGoals(patch: (goals: GoalSet) => GoalSet) {
    document.value = { ...document.value, goals: patch(document.value.goals) }
    touch()
  }

  function addWindow(pieceId: string, min: number, max: number) {
    if (!pieceId || !document.value.pieces.some(piece => piece.id === pieceId)) return
    patchGoals(goals => ({ ...goals, windows: [...goals.windows, { id: stableId('gw'), pieceId, min, max }] }))
  }

  function updateWindow(id: string, patch: Partial<Pick<GoalWindow, 'pieceId' | 'min' | 'max'>>) {
    patchGoals(goals => ({
      ...goals,
      windows: goals.windows.map(window => window.id === id ? { ...window, ...patch } : window),
    }))
  }

  function removeWindow(id: string) {
    patchGoals(goals => ({ ...goals, windows: goals.windows.filter(window => window.id !== id) }))
  }

  function addOrder(beforeId: string, afterId: string, margin: number) {
    if (!beforeId || !afterId) return
    patchGoals(goals => ({ ...goals, orders: [...goals.orders, { id: stableId('go'), beforeId, afterId, margin }] }))
  }

  function updateOrder(id: string, patch: Partial<Pick<GoalOrder, 'beforeId' | 'afterId' | 'margin'>>) {
    patchGoals(goals => ({
      ...goals,
      orders: goals.orders.map(order => order.id === id ? { ...order, ...patch } : order),
    }))
  }

  function removeOrder(id: string) {
    patchGoals(goals => ({ ...goals, orders: goals.orders.filter(order => order.id !== id) }))
  }

  return { addWindow, updateWindow, removeWindow, addOrder, updateOrder, removeOrder }
}
