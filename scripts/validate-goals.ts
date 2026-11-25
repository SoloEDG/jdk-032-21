/**
 * 目标时间窗 / 先后到达约束的验证脚本。
 * 用分岔布局（起点链 → 分岔器 s1 → 终点 A / 终点 B）验证：
 *  1. 一处要求 A 早于 B、另一处要求 B 早于 A 时，系统指出矛盾并阻塞整组判定
 *  2. 时间窗与先后要求不可兼得时被点名
 *  3. 单条路线达标不算整组通过
 *  4. 几何修改后旧判定过期，重新模拟会重新核对全部时间窗
 *  5. 共享上游牌与分叉触点被识别，敏感度提示哪些几何调整会改变共享触点
 *  6. 回放可定位真正违反约束的触点
 *
 * 运行：npm run validate:goals
 */
import type { DominoDocument, GoalSet, SimulationRun } from '@/shared/document'
import { createDefaultDocument } from '@/shared/defaults'
import { propagate } from '@/features/simulation/lib/propagate'
import {
  arrivalEventOf, buildGoalReport, detectContradictions, sharedUpstream, violatingContacts,
} from '@/features/goals/lib/analyze'

let failures = 0
function check(name: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}
function section(title: string) { console.log(`\n■ ${title}`) }

function runOf(document: DominoDocument): SimulationRun {
  const result = propagate(document)
  return {
    id: 'validation-run', documentId: document.id, revision: document.revision, startedAt: 0,
    startPieceId: document.startPieceId, status: result.status, events: result.events,
    contacts: result.contacts, interruptedPieceId: result.interruptedPieceId,
    interruptionReason: result.interruptionReason, duration: result.duration,
  }
}
const withGoals = (document: DominoDocument, goals: GoalSet): DominoDocument => ({ ...document, goals })
const movePiece = (document: DominoDocument, id: string, x: number, y: number): DominoDocument => ({
  ...document, revision: document.revision + 1,
  pieces: document.pieces.map(piece => piece.id === id ? { ...piece, x, y } : piece),
})
const arrival = (run: SimulationRun, pieceId: string) => arrivalEventOf(run, pieceId)?.time ?? null

// ── 分岔布局基准运行 ─────────────────────────────────────────────
section('分岔布局基准运行（起点链 → 分岔 → 终点 A / 终点 B）')
const base = createDefaultDocument()
const baseRun = runOf(base)
const arrivalA = arrival(baseRun, 't1')
const arrivalB = arrival(baseRun, 't2')
console.log(`  终点 A 到达 ${arrivalA?.toFixed(2)}s · 终点 B 到达 ${arrivalB?.toFixed(2)}s · 状态 ${baseRun.status}`)
check('链路完整跑通', baseRun.status === 'complete')
check('两个终点都被到达', arrivalA !== null && arrivalB !== null)
const triggerIds = new Set(base.pieces.filter(piece => piece.kind === 'trigger').map(piece => piece.id))
const contactable = baseRun.events.filter(event => event.kind !== 'interrupted' && !triggerIds.has(event.pieceId))
check('每次倒下都记录了触点决策（含备选）', contactable.length > 0
  && contactable.every(event => baseRun.contacts.some(record => record.eventId === event.id)))

// ── 矛盾：一处要求 A 早于 B，另一处要求 B 早于 A ──────────────────
section('矛盾检测：A≺B 与 B≺A 同时存在')
const contradictory = withGoals(base, {
  windows: [
    { id: 'gw-a', pieceId: 't1', min: 2.5, max: 3.5 },
    { id: 'gw-b', pieceId: 't2', min: 2.5, max: 3.5 },
  ],
  orders: [
    { id: 'go-ab', beforeId: 't1', afterId: 't2', margin: 0 },
    { id: 'go-ba', beforeId: 't2', afterId: 't1', margin: 0 },
  ],
})
const contradictions = detectContradictions(contradictory)
const cycle = contradictions.find(item => item.kind === 'cycle')
check('指出先后要求回环', Boolean(cycle), '未检测到 cycle 矛盾')
check('回环描述点名两个终点', Boolean(cycle && cycle.text.includes('终点 A') && cycle.text.includes('终点 B')))
if (cycle) console.log(`  系统提示：${cycle.text}`)
const blockedReport = buildGoalReport(contradictory, baseRun, false)
check('整组判定被矛盾阻塞', blockedReport.verdict === 'blocked')
check('逐条看全部达标也不能算整组通过', blockedReport.passed === blockedReport.total && blockedReport.verdict !== 'pass',
  `passed=${blockedReport.passed}/${blockedReport.total} verdict=${blockedReport.verdict}`)

// ── 矛盾：时间窗与先后要求不可兼得 ───────────────────────────────
section('矛盾检测：时间窗与先后要求不可兼得')
const infeasible = withGoals(base, {
  windows: [
    { id: 'gw-a', pieceId: 't1', min: 3.0, max: 4.0 },
    { id: 'gw-b', pieceId: 't2', min: 1.0, max: 2.0 },
  ],
  orders: [{ id: 'go-ab', beforeId: 't1', afterId: 't2', margin: 0 }],
})
const windowOrder = detectContradictions(infeasible).find(item => item.kind === 'window-order')
check('指出时间窗与先后要求冲突', Boolean(windowOrder))
if (windowOrder) console.log(`  系统提示：${windowOrder.text}`)

// ── 整组通过 ───────────────────────────────────────────────────
section('整组通过：全部时间窗与先后要求同时满足')
const passReport = buildGoalReport(base, baseRun, false)
check('默认目标整组通过', passReport.verdict === 'pass', `verdict=${passReport.verdict} passed=${passReport.passed}/${passReport.total}`)
check('无违反约束的触点', passReport.violations.length === 0)

// ── 单条路线达标 ≠ 整组通过 ─────────────────────────────────────
section('单条路线达标不能当成整组目标通过')
const tightened = withGoals(base, {
  windows: [
    { id: 'gw-a', pieceId: 't1', min: 2.5, max: 3.5 },
    { id: 'gw-b', pieceId: 't2', min: 2.0, max: 2.5 },
  ],
  orders: [{ id: 'go-ab', beforeId: 't1', afterId: 't2', margin: 0 }],
})
const tightenedReport = buildGoalReport(tightened, baseRun, false)
const windowA = tightenedReport.windows.find(item => item.pieceId === 't1')
const windowB = tightenedReport.windows.find(item => item.pieceId === 't2')
check('该组合本身不构成静态矛盾', tightenedReport.contradictions.length === 0)
check('终点 A 准时', windowA?.status === 'ontime')
check('终点 B 偏晚', windowB?.status === 'late')
check('一路准时、一路偏晚 ⇒ 整组未达标', tightenedReport.verdict === 'fail'
  && tightenedReport.passed === 2 && tightenedReport.total === 3,
  `verdict=${tightenedReport.verdict} passed=${tightenedReport.passed}/${tightenedReport.total}`)

// ── 几何修改 ⇒ 判定过期 ⇒ 重新模拟重核全部时间窗 ─────────────────
section('几何修改后必须重新模拟，且重新核对全部时间窗')
const moved = movePiece(base, 'd10', 15.9, 4.05)
const staleReport = buildGoalReport(moved, baseRun, true)
check('旧运行对新布局过期，判定挂起', staleReport.verdict === 'stale')
const rerun = runOf(moved)
const rechecked = buildGoalReport(moved, rerun, false)
const recheckedA = rechecked.windows.find(item => item.pieceId === 't1')
const recheckedB = rechecked.windows.find(item => item.pieceId === 't2')
check('重跑后链路在 d10 处中断', rerun.interruptedPieceId === 'd10', `interrupted=${rerun.interruptedPieceId}`)
check('全部时间窗都被重新核对（A 准时、B 未到达）',
  recheckedA?.status === 'ontime' && recheckedB?.status === 'unreached')
check('整组判定随新结果更新', rechecked.verdict === 'fail')
check('未到达的终点能在回放里定位到中断触点',
  rechecked.violations.some(contact => contact.pieceId === 'd10' && contact.reason.includes('中断')))

// ── 共享上游牌与分叉触点 ────────────────────────────────────────
section('共享上游牌：两个终点共享同一枚上游牌')
const shared = sharedUpstream(base, baseRun)
const sharedIds = shared.map(piece => piece.pieceId)
console.log(`  共享链：${shared.map(piece => piece.label).join(' → ')}`)
check('分岔器 s1 是共享牌且为分叉点', shared.find(piece => piece.pieceId === 's1')?.divergence === true)
check('分岔前的骨牌都在共享链上', ['d1', 'd2', 'd3', 'd4', 'd5', 'r1', 'd6'].every(id => sharedIds.includes(id)))
check('分叉后的臂不共享', !sharedIds.includes('d7') && !sharedIds.includes('d9'))
check('每个终点只走自己的臂', shared.every(piece => piece.endpoints.length === 2))

// ── 回放定位真正违反约束的触点 ──────────────────────────────────
section('回放定位：真正违反约束的触点')
const strictOrder = withGoals(base, {
  windows: [],
  orders: [{ id: 'go-strict', beforeId: 't1', afterId: 't2', margin: 0.5 }],
})
const strictReport = buildGoalReport(strictOrder, baseRun, false)
const strictOrderResult = strictReport.orders[0]
check('间隔 0.5s 的先后要求被违反', strictOrderResult.status === 'violated')
const s1Event = baseRun.events.find(event => event.pieceId === 's1')
const violations = violatingContacts(strictOrder, baseRun, strictReport.windows, strictReport.orders)
check('定位到分叉触点 s1', Boolean(s1Event && violations.some(contact => contact.eventId === s1Event.id)))
check('定位到两个终点的实际到达事件',
  violations.some(contact => contact.pieceId === 't1') && violations.some(contact => contact.pieceId === 't2'))
check('触点按时间排序，可直接用于回放进度条',
  violations.every((contact, index) => index === 0 || violations[index - 1].time <= contact.time))
for (const contact of violations) console.log(`  ${contact.time.toFixed(2)}s · ${contact.label} · ${contact.reason}`)

// ── 几何调整可能改变共享触点 ────────────────────────────────────
section('触点敏感度：哪些几何调整可能改变共享触点')
const withDecoy: DominoDocument = {
  ...base,
  pieces: [...base.pieces, {
    id: 'dx', kind: 'domino', x: 3.85, y: 4.2, angle: 0, facing: 'east' as const,
    label: '诱饵', height: 1.6, width: 0.42, fallThreshold: 0.8, friction: 0.55,
  }],
}
const decoyRun = runOf(withDecoy)
check('加诱饵后链路仍完整', decoyRun.status === 'complete')
const decoyShared = sharedUpstream(withDecoy, decoyRun)
const d1 = decoyShared.find(piece => piece.pieceId === 'd1')
check('d1 的触点被标记为敏感（备选触点仅差 0.25m）', d1?.sensitivity?.sensitive === true)
check('敏感度点名备选触点', d1?.sensitivity?.alternativeId === 'dx')
if (d1?.sensitivity) for (const hint of d1.sensitivity.hints) console.log(`  提示：d1 ${hint}`)

// ── 汇总 ─────────────────────────────────────────────────────
console.log(failures === 0 ? '\n全部验证通过 ✓' : `\n${failures} 项验证失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
