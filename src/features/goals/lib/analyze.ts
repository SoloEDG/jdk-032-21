import type {
  ContactRecord, DominoDocument, PieceKind, SimulationEvent, SimulationRun,
} from '@/shared/document'

export type WindowStatus = 'early' | 'ontime' | 'late' | 'unreached'
export type OrderStatus = 'satisfied' | 'violated' | 'unknown'
export type GoalVerdict = 'blocked' | 'idle' | 'stale' | 'pass' | 'fail'

export interface WindowResult {
  id: string
  pieceId: string
  label: string
  min: number
  max: number
  arrival: number | null
  status: WindowStatus
  delta: number | null
}

export interface OrderResult {
  id: string
  beforeId: string
  afterId: string
  beforeLabel: string
  afterLabel: string
  margin: number
  gap: number | null
  status: OrderStatus
}

export interface Contradiction {
  id: string
  kind: 'cycle' | 'window-order' | 'window-range' | 'self-order'
  text: string
  goalIds: string[]
}

export interface ContactSensitivity {
  targetId: string
  targetLabel: string
  alternativeId: string | null
  alternativeLabel: string | null
  distanceMargin: number | null
  coneMargin: number | null
  reachMargin: number | null
  sensitive: boolean
  hints: string[]
}

export interface SharedPiece {
  pieceId: string
  label: string
  kind: PieceKind
  eventId: string | null
  endpoints: string[]
  divergence: boolean
  sensitivity: ContactSensitivity | null
}

export interface ViolationContact {
  eventId: string
  pieceId: string
  label: string
  time: number
  reason: string
  goalId: string
}

export interface GoalReport {
  windows: WindowResult[]
  orders: OrderResult[]
  contradictions: Contradiction[]
  shared: SharedPiece[]
  violations: ViolationContact[]
  verdict: GoalVerdict
  passed: number
  total: number
}

export function labelOf(document: DominoDocument, pieceId: string) {
  return document.pieces.find(piece => piece.id === pieceId)?.label ?? pieceId
}

export function arrivalTimes(run: SimulationRun) {
  const arrivals = new Map<string, number>()
  for (const event of run.events) {
    if (event.kind === 'interrupted') continue
    const seen = arrivals.get(event.pieceId)
    if (seen === undefined || event.time < seen) arrivals.set(event.pieceId, event.time)
  }
  return arrivals
}

export function arrivalEventOf(run: SimulationRun, pieceId: string) {
  let found: SimulationEvent | null = null
  for (const event of run.events) {
    if (event.pieceId !== pieceId || event.kind === 'interrupted') continue
    if (!found || event.time < found.time) found = event
  }
  return found
}

export function causalChain(run: SimulationRun, eventId: string) {
  const byId = new Map(run.events.map(event => [event.id, event]))
  const chain: SimulationEvent[] = []
  const guard = new Set<string>()
  let cursor = byId.get(eventId) ?? null
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id)
    chain.unshift(cursor)
    cursor = cursor.causeId ? byId.get(cursor.causeId) ?? null : null
  }
  return chain
}

export function evaluateWindows(document: DominoDocument, run: SimulationRun | null): WindowResult[] {
  const arrivals = run ? arrivalTimes(run) : new Map<string, number>()
  return document.goals.windows.map(window => {
    const arrival = arrivals.get(window.pieceId) ?? null
    let status: WindowStatus = 'unreached'
    let delta: number | null = null
    if (arrival !== null) {
      if (arrival < window.min) { status = 'early'; delta = arrival - window.min }
      else if (arrival > window.max) { status = 'late'; delta = arrival - window.max }
      else status = 'ontime'
    }
    return {
      id: window.id, pieceId: window.pieceId, label: labelOf(document, window.pieceId),
      min: window.min, max: window.max, arrival, status, delta,
    }
  })
}

export function evaluateOrders(document: DominoDocument, run: SimulationRun | null): OrderResult[] {
  const arrivals = run ? arrivalTimes(run) : new Map<string, number>()
  return document.goals.orders.map(order => {
    const before = arrivals.get(order.beforeId)
    const after = arrivals.get(order.afterId)
    const gap = before !== undefined && after !== undefined ? after - before : null
    return {
      id: order.id, beforeId: order.beforeId, afterId: order.afterId,
      beforeLabel: labelOf(document, order.beforeId), afterLabel: labelOf(document, order.afterId),
      margin: order.margin, gap,
      status: gap === null ? 'unknown' as const : gap >= order.margin ? 'satisfied' as const : 'violated' as const,
    }
  })
}

export function detectContradictions(document: DominoDocument): Contradiction[] {
  const { windows, orders } = document.goals
  const contradictions: Contradiction[] = []

  for (const window of windows) {
    if (window.min > window.max) {
      contradictions.push({
        id: `range-${window.id}`, kind: 'window-range', goalIds: [window.id],
        text: `「${labelOf(document, window.pieceId)}」的时间窗下限 ${window.min.toFixed(2)}s 晚于上限 ${window.max.toFixed(2)}s，窗口本身不成立`,
      })
    }
  }

  for (const order of orders) {
    if (order.beforeId === order.afterId) {
      contradictions.push({
        id: `self-${order.id}`, kind: 'self-order', goalIds: [order.id],
        text: `「${labelOf(document, order.beforeId)}」被要求先于它自己到达，无法满足`,
      })
    }
  }

  // 先后要求构成的有向图里找环（如 A≺B 与 B≺A 同时存在）
  const nodes = [...new Set(orders.flatMap(order => [order.beforeId, order.afterId]))]
  const edges = new Map<string, string[]>(nodes.map(node => [node, []]))
  for (const order of orders) edges.get(order.beforeId)?.push(order.afterId)
  const index = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  let counter = 0

  const strongConnect = (node: string) => {
    index.set(node, counter)
    lowlink.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const next of edges.get(node) ?? []) {
      if (!index.has(next)) {
        strongConnect(next)
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!))
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, index.get(next)!))
      }
    }
    if (lowlink.get(node) !== index.get(node)) return
    const component: string[] = []
    let member = ''
    do {
      member = stack.pop()!
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    if (component.length < 2) return
    // 沿环走一圈，生成可读的回环描述
    const members = new Set(component)
    const loop = [component[0]]
    let cursor = component[0]
    const visited = new Set([cursor])
    while (true) {
      const next = (edges.get(cursor) ?? []).find(target => members.has(target) && (!visited.has(target) || target === component[0]))
      if (!next || next === component[0]) break
      loop.push(next)
      visited.add(next)
      cursor = next
    }
    const labels = [...loop, component[0]].map(id => `「${labelOf(document, id)}」`)
    contradictions.push({
      id: `cycle-${component.sort().join('-')}`, kind: 'cycle',
      goalIds: orders.filter(order => members.has(order.beforeId) && members.has(order.afterId)).map(order => order.id),
      text: `先后要求互相矛盾：${labels.join(' 先于 ')} 形成回环，任何运行结果都无法同时满足`,
    })
  }
  for (const node of nodes) if (!index.has(node)) strongConnect(node)

  // 时间窗与先后要求联合不可行：before 最早也要 beforeMin，after 最晚只能 afterMax
  const windowsByPiece = new Map<string, typeof windows>()
  for (const window of windows) {
    const list = windowsByPiece.get(window.pieceId) ?? []
    list.push(window)
    windowsByPiece.set(window.pieceId, list)
  }
  for (const order of orders) {
    for (const beforeWindow of windowsByPiece.get(order.beforeId) ?? []) {
      for (const afterWindow of windowsByPiece.get(order.afterId) ?? []) {
        if (beforeWindow.min + order.margin > afterWindow.max) {
          contradictions.push({
            id: `wo-${order.id}-${beforeWindow.id}-${afterWindow.id}`, kind: 'window-order',
            goalIds: [order.id, beforeWindow.id, afterWindow.id],
            text: `「${labelOf(document, order.beforeId)}」最早 ${beforeWindow.min.toFixed(2)}s 到达，加上间隔 ${order.margin.toFixed(2)}s 已超过「${labelOf(document, order.afterId)}」的上限 ${afterWindow.max.toFixed(2)}s，时间窗与先后要求不可兼得`,
          })
        }
      }
    }
  }

  return contradictions
}

function sensitivityFor(document: DominoDocument, record: ContactRecord | undefined): ContactSensitivity | null {
  if (!record || !record.chosen || !record.targetId) return null
  const alternative = record.alternatives[0] ?? null
  const distanceMargin = alternative ? alternative.distance - record.chosen.distance : null
  const coneMargin = record.cone !== null ? record.cone - record.chosen.alignment : null
  const reachMargin = record.reach !== null ? record.reach - record.chosen.distance : null
  const hints: string[] = []
  if (alternative && distanceMargin !== null && distanceMargin <= 0.45) {
    hints.push(`与备选「${labelOf(document, alternative.pieceId)}」的触距差仅 ${distanceMargin.toFixed(2)} m，微调位置即可改触它`)
  }
  if (coneMargin !== null && coneMargin <= 6) {
    hints.push(`朝向余量仅剩 ${coneMargin.toFixed(1)}°，稍转角度就会改变触点`)
  }
  if (reachMargin !== null && reachMargin <= 0.3) {
    hints.push(`触达余量仅 ${reachMargin.toFixed(2)} m，目标稍远即失联`)
  }
  return {
    targetId: record.targetId,
    targetLabel: labelOf(document, record.targetId),
    alternativeId: alternative?.pieceId ?? null,
    alternativeLabel: alternative ? labelOf(document, alternative.pieceId) : null,
    distanceMargin, coneMargin, reachMargin,
    sensitive: hints.length > 0,
    hints,
  }
}

export function goalEndpoints(document: DominoDocument) {
  return [...new Set([
    ...document.goals.windows.map(window => window.pieceId),
    ...document.goals.orders.flatMap(order => [order.beforeId, order.afterId]),
  ])]
}

export function sharedUpstream(document: DominoDocument, run: SimulationRun): SharedPiece[] {
  const arrivals = arrivalTimes(run)
  const chains = goalEndpoints(document)
    .filter(pieceId => arrivals.has(pieceId))
    .map(pieceId => ({ pieceId, chain: causalChain(run, arrivalEventOf(run, pieceId)!.id) }))
  if (chains.length < 2) return []

  const pathsByPiece = new Map<string, Set<string>>()
  const eventCounts = new Map<string, number>()
  const eventTimes = new Map<string, number>()
  for (const { pieceId, chain } of chains) {
    const seen = new Set<string>()
    for (const event of chain) {
      eventCounts.set(event.id, (eventCounts.get(event.id) ?? 0) + 1)
      eventTimes.set(event.id, event.time)
      if (seen.has(event.pieceId)) continue
      seen.add(event.pieceId)
      const endpoints = pathsByPiece.get(event.pieceId) ?? new Set<string>()
      endpoints.add(pieceId)
      pathsByPiece.set(event.pieceId, endpoints)
    }
  }

  let divergenceEventId: string | null = null
  let divergenceTime = -Infinity
  for (const [eventId, count] of eventCounts) {
    const time = eventTimes.get(eventId) ?? 0
    if (count === chains.length && time > divergenceTime) {
      divergenceTime = time
      divergenceEventId = eventId
    }
  }

  const shared: SharedPiece[] = []
  for (const [pieceId, endpoints] of pathsByPiece) {
    if (endpoints.size < 2) continue
    const piece = document.pieces.find(item => item.id === pieceId)
    if (!piece) continue
    const eventId = arrivalEventOf(run, pieceId)?.id ?? null
    shared.push({
      pieceId, label: piece.label, kind: piece.kind, eventId,
      endpoints: [...endpoints].map(id => labelOf(document, id)),
      divergence: eventId !== null && eventId === divergenceEventId,
      sensitivity: sensitivityFor(document, run.contacts.find(record => record.pieceId === pieceId)),
    })
  }
  return shared.sort((a, b) => {
    const timeA = a.eventId ? eventTimes.get(a.eventId) ?? 0 : 0
    const timeB = b.eventId ? eventTimes.get(b.eventId) ?? 0 : 0
    return timeA - timeB || a.pieceId.localeCompare(b.pieceId)
  })
}

function slowestLink(chain: SimulationEvent[], afterTime = -Infinity) {
  let best: SimulationEvent | null = null
  let bestGap = -Infinity
  for (let index = 1; index < chain.length; index += 1) {
    const event = chain[index]
    if (event.time <= afterTime) continue
    const gap = event.time - chain[index - 1].time
    if (gap > bestGap + 1e-9) { bestGap = gap; best = event }
  }
  return best
}

export function violatingContacts(
  document: DominoDocument, run: SimulationRun,
  windows: WindowResult[], orders: OrderResult[],
): ViolationContact[] {
  const contacts: ViolationContact[] = []
  const push = (eventId: string, reason: string, goalId: string) => {
    const event = run.events.find(item => item.id === eventId)
    if (!event) return
    contacts.push({
      eventId, pieceId: event.pieceId, label: labelOf(document, event.pieceId),
      time: event.time, reason, goalId,
    })
  }

  for (const order of orders.filter(item => item.status === 'violated')) {
    const beforeEvent = arrivalEventOf(run, order.beforeId)
    const afterEvent = arrivalEventOf(run, order.afterId)
    if (!beforeEvent || !afterEvent) continue
    const beforeChain = causalChain(run, beforeEvent.id)
    const afterChain = causalChain(run, afterEvent.id)
    const afterEventIds = new Set(afterChain.map(event => event.id))
    const divergence = [...beforeChain].reverse().find(event => afterEventIds.has(event.id))
    if (divergence) push(divergence.id, '分叉触点：两路在此之后各自计时，先后差距由此产生', order.id)
    const splitTime = divergence?.time ?? -Infinity
    const beforeSlow = slowestLink(beforeChain, splitTime)
    const afterSlow = slowestLink(afterChain, splitTime)
    if (beforeSlow && beforeSlow.id !== beforeEvent.id) push(beforeSlow.id, `通往「${order.beforeLabel}」最慢的一段接触`, order.id)
    if (afterSlow && afterSlow.id !== afterEvent.id) push(afterSlow.id, `通往「${order.afterLabel}」最慢的一段接触`, order.id)
    push(beforeEvent.id, `「${order.beforeLabel}」实际到达`, order.id)
    push(afterEvent.id, `「${order.afterLabel}」实际到达，先后要求未满足`, order.id)
  }

  for (const window of windows) {
    if (window.status === 'early' || window.status === 'late') {
      const event = arrivalEventOf(run, window.pieceId)
      if (!event) continue
      const slow = slowestLink(causalChain(run, event.id))
      if (slow && slow.id !== event.id) push(slow.id, '耗时最长的接触段，调整它最能改变到达时刻', window.id)
      push(event.id, `实际到达，比窗口${window.status === 'early' ? '过早' : '偏晚'} ${Math.abs(window.delta ?? 0).toFixed(2)}s`, window.id)
    } else if (window.status === 'unreached') {
      const interrupted = run.events.find(event => event.kind === 'interrupted')
      if (interrupted) push(interrupted.id, `链路在此中断，「${window.label}」未到达`, window.id)
    }
  }

  const seen = new Set<string>()
  return contacts
    .filter(contact => {
      const key = `${contact.eventId}|${contact.reason}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.time - b.time || a.eventId.localeCompare(b.eventId))
}

export function buildGoalReport(document: DominoDocument, run: SimulationRun | null, stale: boolean): GoalReport {
  const contradictions = detectContradictions(document)
  const windows = evaluateWindows(document, run)
  const orders = evaluateOrders(document, run)
  const total = windows.length + orders.length
  const passed = windows.filter(window => window.status === 'ontime').length
    + orders.filter(order => order.status === 'satisfied').length
  let verdict: GoalVerdict
  if (contradictions.length > 0) verdict = 'blocked'
  else if (total === 0 || !run) verdict = 'idle'
  else if (stale) verdict = 'stale'
  else if (passed === total) verdict = 'pass'
  else verdict = 'fail'
  return {
    windows, orders, contradictions,
    shared: run ? sharedUpstream(document, run) : [],
    violations: run ? violatingContacts(document, run, windows, orders) : [],
    verdict, passed, total,
  }
}
