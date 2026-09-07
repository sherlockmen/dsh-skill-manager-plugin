/** Geometry only: nodes retain the approved Gate 7 / P13 color and type styles. */
export const TRACE_GRAPH_CSS: string = `
.trace-page .graph-scroll { height: 60vh; min-height: 410px; max-height: 760px; }
.trace-page .graph-canvas.is-fitted { width: 100%; min-height: 100%; padding: 24px; justify-content: center; }
.gate-trace-scaled-size { position: relative; flex: 0 0 auto; overflow: clip; }
.gate-trace-topology { position: relative; flex: 0 0 auto; }
.gate-trace-topology .trace-node { position: absolute; margin: 0; display: block; }
.gate-trace-topology .node-type { font-size: 10px; }
.gate-trace-topology .node-copy { gap: 8px; }
.gate-trace-topology .node-meta { font-size: 10px; }
.gate-trace-topology .trace-topology-links { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.gate-trace-topology .trace-link { fill: none; stroke: #9aabba; stroke-width: 1.25; stroke-linejoin: round; }
.gate-trace-topology .trace-link.failed { stroke: #b33e3e; }
.gate-trace-topology .trace-component-label { position: absolute; left: 8px; color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.gate-trace-topology .trace-node:focus-visible { outline: 2px solid #2267c7; outline-offset: 4px; }
.sm-app .detail-eyebrow { align-items: flex-start; flex-direction: column; gap: 8px; }
.sm-app .detail-eyebrow > span:first-child { min-width: 0; overflow-wrap: anywhere; }
.sm-app .detail-eyebrow > span:last-child { display: flex; flex-wrap: wrap; gap: 8px; }
.sm-app .detail-eyebrow .mini-action { white-space: nowrap; flex: 0 0 auto; }
.sm-app .detail-head h2 { overflow-wrap: anywhere; }
.trace-page .gate-title-line h1 { overflow-wrap: anywhere; white-space: normal; }
.trace-list-page .trace-toolbar .toolbar-tools { margin-left: 0; flex-wrap: wrap; }
.trace-time-filter { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #737a82; font-size: 12px; }
.trace-ledger .trace-list-items { max-height: none; padding: 0; }
.trace-ledger .trace-list-item { min-height: 64px; grid-template-columns: 8px minmax(0,1fr) auto 90px; gap: 16px; padding: 12px 24px; }
.trace-ledger .trace-list-copy small { overflow-wrap: anywhere; white-space: normal; }
.trace-ledger .trace-list-meta { gap: 6px; }
.trace-detail-page .trace-workspace { display: grid; grid-template-columns: minmax(0,1fr); }
.trace-detail-page .trace-workspace.has-inspector { grid-template-columns: minmax(0,1fr) 360px; }
.trace-main-panel { min-width: 0; }
.trace-detail-page .sequence-section { margin: 0; border-top: 0; }
.trace-detail-page .sequence-button { grid-template-columns: 30px minmax(120px,1fr) 52px minmax(70px,.6fr) 65px 60px 55px; gap: 8px; padding: 10px 16px; }
.trace-detail-page .context-stage p { white-space: normal; overflow-wrap: anywhere; }
.trace-execution-profile { padding: 12px 24px; border-bottom: 1px solid #eeeae3; font-size: 12px; }
.trace-execution-profile summary { cursor: pointer; color: #5e6872; }
.trace-inspector-back { justify-self: start; }
.trace-retention-actions > div { display: flex; gap: 8px; flex-wrap: wrap; }
.trace-narrow-notice { display: none; }
@media (max-width: 1279px) {
  .trace-detail-page .trace-workspace.has-inspector { grid-template-columns: minmax(0,1fr); }
  .trace-detail-page .trace-workspace.has-inspector .trace-main-panel { display: none; }
  .trace-detail-page .detail-pane { border-top: 0; }
}
@media (max-width: 1023px) {
  .trace-detail-page .graph-pane { display: none; }
  .trace-detail-page .sequence-section { display: block; }
  .trace-detail-page .view-tabs { display: none; }
  .trace-detail-page .toolbar-tools { margin-left: 0; }
  .trace-retention-actions { display: none; }
  .trace-narrow-notice { display: block; padding: 12px 24px; color: #737a82; font-size: 12px; line-height: 1.6; }
}
@media (max-width: 767px) {
  .trace-page .toolbar-tools { flex-wrap: wrap; }
  .trace-ledger .trace-list-item { grid-template-columns: 8px minmax(0,1fr) auto; gap: 8px; padding: 12px 16px; }
  .trace-ledger .trace-list-item > .row-link { grid-column: 2 / -1; }
  .trace-detail-page .sequence-button { grid-template-columns: 28px minmax(0,1fr) auto; padding: 10px 16px; }
  .trace-detail-page .sequence-type, .trace-detail-page .sequence-parent, .trace-detail-page .sequence-time, .trace-detail-page .sequence-action { display: none; }
  .trace-detail-page .sequence-state { grid-column: 3; grid-row: 1; }
}
`
