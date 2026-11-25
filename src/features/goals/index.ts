export { useGoals } from './model/useGoals'
export { default as GoalsPanel } from './ui/GoalsPanel.vue'
export {
  arrivalEventOf, arrivalTimes, buildGoalReport, causalChain, detectContradictions,
  evaluateOrders, evaluateWindows, goalEndpoints, labelOf, sharedUpstream, violatingContacts,
} from './lib/analyze'
export type {
  ContactSensitivity, Contradiction, GoalReport, GoalVerdict, OrderResult, OrderStatus,
  SharedPiece, ViolationContact, WindowResult, WindowStatus,
} from './lib/analyze'
