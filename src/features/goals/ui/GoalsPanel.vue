<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ArrowRight, CheckCircle2, Plus, RotateCcw, Share2, Target, Timer, X } from '@lucide/vue'
import type { DominoDocument, GoalOrder, GoalWindow } from '@/shared/document'
import type { GoalReport, GoalVerdict, OrderResult, WindowResult } from '../lib/analyze'

const props = defineProps<{ document: DominoDocument; report: GoalReport }>()
const emit = defineEmits<{
  addWindow: [string, number, number]
  updateWindow: [string, Partial<Pick<GoalWindow, 'pieceId' | 'min' | 'max'>>]
  removeWindow: [string]
  addOrder: [string, string, number]
  updateOrder: [string, Partial<Pick<GoalOrder, 'beforeId' | 'afterId' | 'margin'>>]
  removeOrder: [string]
  selectPiece: [string]
}>()

const endpoints = computed(() => [...props.document.pieces]
  .sort((a, b) => Number(b.kind === 'trigger') - Number(a.kind === 'trigger') || a.label.localeCompare(b.label)))

const newWindowPiece = ref('')
const newWindowMin = ref(0)
const newWindowMax = ref(4)
const newOrderBefore = ref('')
const newOrderAfter = ref('')
const newOrderMargin = ref(0)

function submitWindow() {
  if (!newWindowPiece.value) return
  emit('addWindow', newWindowPiece.value, newWindowMin.value, newWindowMax.value)
}
function submitOrder() {
  if (!newOrderBefore.value || !newOrderAfter.value) return
  emit('addOrder', newOrderBefore.value, newOrderAfter.value, newOrderMargin.value)
}
function number(event: Event) { return Number((event.target as HTMLInputElement).value) }
function text(event: Event) { return (event.target as HTMLSelectElement).value }

const verdictMeta: Record<GoalVerdict, { title: string; sub: string; icon: typeof Timer }> = {
  blocked: { title: '目标互相矛盾，整组判定被阻塞', sub: '先解决上方列出的矛盾，再核对时间窗', icon: AlertTriangle },
  idle: { title: '尚未核对目标', sub: '定义目标并运行模拟后，逐一核对全部时间窗与先后要求', icon: Timer },
  stale: { title: '布局已修改，判定待重新核对', sub: '重新模拟后才会用新结果核对全部时间窗', icon: RotateCcw },
  pass: { title: '整组通过', sub: '全部时间窗与先后要求在同一次运行中同时满足', icon: CheckCircle2 },
  fail: { title: '整组未达标', sub: '单条路线达标不计入整组通过，需全部满足', icon: AlertTriangle },
}
const verdict = computed(() => verdictMeta[props.report.verdict])

function windowChip(window: WindowResult) {
  if (props.report.verdict === 'idle') return { tone: 'pending', label: '待运行' }
  if (window.status === 'ontime') return { tone: 'ontime', label: '准时' }
  if (window.status === 'early') return { tone: 'early', label: `过早 ${Math.abs(window.delta ?? 0).toFixed(2)}s` }
  if (window.status === 'late') return { tone: 'late', label: `偏晚 ${Math.abs(window.delta ?? 0).toFixed(2)}s` }
  return { tone: 'unreached', label: '未到达' }
}
function orderChip(order: OrderResult) {
  if (props.report.verdict === 'idle') return { tone: 'pending', label: '待运行' }
  if (order.status === 'satisfied') return { tone: 'ontime', label: `满足 · 差距 ${(order.gap ?? 0).toFixed(2)}s` }
  if (order.status === 'violated') return { tone: 'late', label: `违反 · 差距 ${(order.gap ?? 0).toFixed(2)}s` }
  return { tone: 'pending', label: '无法判定' }
}
const sensitiveHints = computed(() => props.report.shared
  .filter(piece => piece.sensitivity?.sensitive)
  .map(piece => ({ pieceId: piece.pieceId, label: piece.label, hints: piece.sensitivity!.hints })))
</script>

<template>
  <section class="goals-panel" aria-labelledby="goals-title">
    <div class="goals-heading">
      <div class="section-kicker"><span>06 / GOALS</span><h2 id="goals-title">目标时间窗</h2></div>
      <span v-if="report.total" class="goals-count mono">{{ report.passed }}/{{ report.total }} 达成</span>
    </div>

    <div v-if="report.contradictions.length" class="contradiction-list" role="alert">
      <div v-for="contradiction in report.contradictions" :key="contradiction.id" class="contradiction-row">
        <AlertTriangle :size="14" /><span>{{ contradiction.text }}</span>
      </div>
    </div>

    <div class="verdict-banner" :class="report.verdict">
      <div class="verdict-symbol"><component :is="verdict.icon" :size="17" /></div>
      <div>
        <strong>{{ verdict.title }}<template v-if="report.total && report.verdict !== 'idle'"> · {{ report.passed }}/{{ report.total }}</template></strong>
        <small>{{ verdict.sub }}</small>
      </div>
    </div>

    <template v-if="report.windows.length">
      <div class="goal-group-heading"><Target :size="13" /><span>到达时间窗</span></div>
      <div v-for="window in report.windows" :key="window.id" class="goal-row">
        <div class="goal-row-main">
          <select :value="window.pieceId" :aria-label="'时间窗终点 ' + window.label"
            @change="emit('updateWindow', window.id, { pieceId: text($event) })">
            <option v-for="piece in endpoints" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
          </select>
          <div class="window-range">
            <input type="number" step="0.1" :value="window.min" aria-label="窗口下限"
              @change="emit('updateWindow', window.id, { min: number($event) })" />
            <span>→</span>
            <input type="number" step="0.1" :value="window.max" aria-label="窗口上限"
              @change="emit('updateWindow', window.id, { max: number($event) })" />
          </div>
          <button class="remove-link" :aria-label="'删除时间窗 ' + window.label" @click="emit('removeWindow', window.id)"><X :size="14" /></button>
        </div>
        <div class="goal-row-sub">
          <span class="goal-arrival mono">{{ report.verdict === 'idle' ? '尚未运行' : window.arrival !== null ? `到达 ${window.arrival.toFixed(2)}s` : '波未传到' }}</span>
          <span class="goal-chip" :class="[windowChip(window).tone, { stale: report.verdict === 'stale' }]">{{ windowChip(window).label }}</span>
        </div>
      </div>
    </template>

    <template v-if="report.orders.length">
      <div class="goal-group-heading"><ArrowRight :size="13" /><span>先后到达要求</span></div>
      <div v-for="order in report.orders" :key="order.id" class="goal-row">
        <div class="goal-row-main order-main">
          <select :value="order.beforeId" :aria-label="'先到达 ' + order.beforeLabel"
            @change="emit('updateOrder', order.id, { beforeId: text($event) })">
            <option v-for="piece in endpoints" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
          </select>
          <span class="order-arrow">先于</span>
          <select :value="order.afterId" :aria-label="'后到达 ' + order.afterLabel"
            @change="emit('updateOrder', order.id, { afterId: text($event) })">
            <option v-for="piece in endpoints" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
          </select>
          <input class="margin-input" type="number" step="0.05" :value="order.margin" aria-label="最小间隔"
            @change="emit('updateOrder', order.id, { margin: number($event) })" />
          <button class="remove-link" :aria-label="'删除先后要求 ' + order.beforeLabel + ' 先于 ' + order.afterLabel"
            @click="emit('removeOrder', order.id)"><X :size="14" /></button>
        </div>
        <div class="goal-row-sub">
          <span class="goal-arrival mono">间隔 ≥ {{ order.margin.toFixed(2) }}s</span>
          <span class="goal-chip" :class="[orderChip(order).tone, { stale: report.verdict === 'stale' }]">{{ orderChip(order).label }}</span>
        </div>
      </div>
    </template>

    <p v-if="!report.total" class="goals-empty">还没有目标。为终点添加时间窗，或定义两个终点的先后到达要求。</p>

    <div class="goal-builder">
      <div class="builder-title"><Target :size="14" /> 新建时间窗</div>
      <div class="builder-grid window-builder">
        <select v-model="newWindowPiece" aria-label="选择终点">
          <option value="" disabled>选择终点</option>
          <option v-for="piece in endpoints" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
        </select>
        <input v-model.number="newWindowMin" type="number" step="0.1" aria-label="新窗口下限" />
        <input v-model.number="newWindowMax" type="number" step="0.1" aria-label="新窗口上限" />
        <button class="add-connection" :disabled="!newWindowPiece" @click="submitWindow"><Plus :size="14" /> 添加</button>
      </div>
    </div>
    <div class="goal-builder">
      <div class="builder-title"><ArrowRight :size="14" /> 新建先后要求</div>
      <div class="builder-grid order-builder">
        <select v-model="newOrderBefore" aria-label="先到达的终点">
          <option value="" disabled>先到达</option>
          <option v-for="piece in endpoints" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
        </select>
        <select v-model="newOrderAfter" aria-label="后到达的终点">
          <option value="" disabled>后到达</option>
          <option v-for="piece in endpoints" :key="piece.id" :value="piece.id">{{ piece.label }}</option>
        </select>
        <input v-model.number="newOrderMargin" type="number" step="0.05" aria-label="新先后要求的最小间隔" />
        <button class="add-connection" :disabled="!newOrderBefore || !newOrderAfter" @click="submitOrder"><Plus :size="14" /> 添加</button>
      </div>
    </div>

    <div v-if="report.shared.length" class="shared-section">
      <div class="goal-group-heading"><Share2 :size="13" /><span>共享上游牌 · {{ report.shared.length }}</span></div>
      <div class="shared-chips">
        <button v-for="piece in report.shared" :key="piece.pieceId" class="shared-chip"
          :class="{ divergence: piece.divergence, sensitive: piece.sensitivity?.sensitive }"
          :title="piece.endpoints.join('、') + ' 的路径都经过此牌'" @click="emit('selectPiece', piece.pieceId)">
          {{ piece.label }}<span v-if="piece.divergence" class="shared-tag">分叉点</span>
        </button>
      </div>
      <p class="goals-note">这些牌同时决定多个终点的到达时刻，不能各调一处就认定两个终点都达标。</p>
      <ul v-if="sensitiveHints.length" class="sensitivity-list">
        <li v-for="entry in sensitiveHints" :key="entry.pieceId">
          几何调整可能改变共享触点 —— <button class="sensitivity-piece" @click="emit('selectPiece', entry.pieceId)">{{ entry.label }}</button>
          <template v-for="hint in entry.hints" :key="hint"><br />{{ hint }}</template>
        </li>
      </ul>
    </div>

    <p class="goals-footnote">单条路线达标不计入整组通过；修改布局后需重新模拟，系统会用新结果重新核对全部时间窗。</p>
  </section>
</template>
