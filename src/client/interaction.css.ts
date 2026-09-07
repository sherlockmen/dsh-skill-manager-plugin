/** Shared interaction refinements within the paper workbench palette. */
export const INTERACTION_CSS = `
.sm-app { --sm-space-control:8px; --sm-space-group:16px; --sm-motion-feedback:120ms; }
.sm-app .sm-eval-create-action { padding:var(--sm-space-group); border-top:1px solid var(--sm-line); }
.sm-app .gate-create .sm-card-heading { padding:var(--sm-space-group); gap:var(--sm-space-group); }
.sm-app .sm-form-grid { gap:var(--sm-space-group); }
.sm-app .gate-page-head, .sm-app .validation-head, .sm-app .annotation-head, .sm-app .editor-toolbar { flex-wrap:wrap; gap:var(--sm-space-group); }
.sm-app .gate-page-actions, .sm-app .editor-toolbar-actions, .sm-app .gate-editor-actions, .sm-app .annotation-actions { flex-wrap:wrap; gap:var(--sm-space-control); }
.sm-app .editor-shell, .sm-app .annotation-shell { grid-template-columns:auto minmax(0,1fr); }
.sm-app .sm-resizable-rail { position:relative; min-width:176px; max-width:480px; }
.sm-app .sm-resizable-rail > aside { width:100%; height:100%; }
.sm-app .sm-rail-handle { position:absolute; width:8px; inset:0 -4px 0 auto; cursor:col-resize; touch-action:none; z-index:2; }
.sm-app .sm-rail-handle:hover, .sm-app .sm-rail-handle:focus-visible { background:var(--sm-blue-soft); outline:1px solid var(--sm-blue); }
.sm-app .rail-text, .sm-app .case-copy strong, .sm-app .case-copy small { white-space:normal; overflow-wrap:anywhere; }
.sm-app .file-button { min-height:36px; padding-block:8px; }
.sm-app .case-list, .sm-app .rail-list { overflow:auto; }
.sm-app .editor-file, .sm-app .case-pane, .sm-app .case-head > div, .sm-app .context-stage h2 { min-width:0; overflow-wrap:anywhere; }
.sm-app .editor-file strong, .sm-app .case-head h2 { white-space:normal; overflow-wrap:anywhere; }
.sm-app .grade-option { position:relative; gap:12px; padding:12px; }
.sm-app .grade-option .radio-control { display:block; position:relative; width:16px; height:16px; border:0; background:transparent; }
.sm-app .grade-option .radio-control::after, .sm-app .grade-option .radio-control i { display:none; }
.sm-app .grade-option .radio-control input { position:static; opacity:1; pointer-events:auto; appearance:auto; width:16px; height:16px; min-height:0; margin:0; padding:0; accent-color:var(--sm-blue); }
.sm-app .grade-option:focus-within { outline:2px solid var(--sm-blue); outline-offset:2px; }
.sm-app .grade-option small { line-height:1.5; font-size:11px; }
.sm-app .gate-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:background-color var(--sm-motion-feedback),color var(--sm-motion-feedback); }
.sm-app .gate-button[aria-busy="true"] { opacity:1; cursor:progress; }
.sm-app .sm-busy-indicator { display:inline-block; width:12px; height:12px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:sm-busy-spin .8s linear infinite; flex:none; }
.sm-app .save-status:not(:empty) { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 0; line-height:1.5; }
.sm-app .sm-toast { max-width:min(480px,calc(100vw - 48px)); overflow-wrap:anywhere; top:max(80px,calc(var(--sm-desktop-titlebar,0px) + 64px)); animation:sm-feedback-in 120ms ease-out; }
.sm-app .sm-inline-error p { white-space:normal; overflow-wrap:anywhere; }
.sm-app .sm-source-workspace { padding:16px 0; min-width:0; }
.sm-app .sm-source-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.sm-app .sm-source-tools > strong { margin-right:auto; font-size:15px; }
.sm-app .sm-source-tools label { display:flex; align-items:center; gap:8px; }
.sm-app .sm-mind-elixir { width:100%; height:clamp(320px,48vh,540px); min-width:0; margin-top:12px; border:1px solid var(--sm-line); border-radius:5px; overflow:hidden; position:relative; }
.sm-app .sm-mind-elixir me-tpc { max-width:280px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:13px; line-height:1.5; }
.sm-app .sm-mind-elixir me-tpc.root { font-size:15px; }
.sm-app .sm-mind-elixir input, .sm-app .sm-mind-elixir textarea { height:auto; min-height:0; }
.sm-app .sm-map-help { color:var(--sm-muted); font-size:11px; line-height:1.6; margin-top:8px; }
.sm-app .sm-map-view-tools { margin-left:auto; display:flex; align-items:center; gap:8px; min-width:0; }
.sm-app .sm-map-view-tools .sm-select-trigger { width:90px; }
.sm-app .sm-source-workspace > header { margin-bottom:12px; }
.sm-app [aria-label="测评筛选"] > label { width:min(100%,480px); }
.sm-app .sm-select-trigger { display:inline-flex; justify-content:space-between; align-items:center; gap:12px; width:100%; min-width:0; max-width:100%; min-height:34px; height:auto; padding:7px 12px; border:1px solid var(--sm-line); border-radius:5px; background:#fff; color:var(--sm-ink); font-family:inherit; font-size:13px; line-height:1.5; text-align:left; cursor:pointer; }
.sm-app .sm-select-trigger > span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sm-app .sm-select-trigger svg { flex-shrink:0; }
.sm-app .sm-select-trigger:hover:not(:disabled) { border-color:#afb8c3; }
.sm-app .sm-select-trigger:focus-visible, .sm-app .sm-select-trigger[data-state="open"] { outline:2px solid var(--sm-blue); outline-offset:2px; }
.sm-app .sm-select-trigger:disabled { cursor:not-allowed; opacity:.48; }
.sm-select-popup { z-index:10000; width:var(--radix-select-trigger-width); max-width:calc(100vw - 24px); max-height:min(320px,var(--radix-select-content-available-height)); overflow:hidden; border:1px solid var(--sm-line); border-radius:5px; background:#fff; color:var(--sm-ink); padding:4px; box-shadow:0 8px 24px #20262e18; font-family:Inter,system-ui,sans-serif; font-size:13px; }
.sm-select-option { display:flex; align-items:center; justify-content:space-between; gap:12px; position:relative; padding:9px 12px; min-height:36px; border-radius:3px; cursor:pointer; outline:none; line-height:1.5; overflow-wrap:anywhere; }
.sm-select-option[data-highlighted] { background:var(--sm-blue-soft); color:var(--sm-blue); }
.sm-select-option[data-state="checked"] { font-weight:600; color:var(--sm-blue); }
.sm-select-option[data-disabled] { opacity:.45; cursor:not-allowed; }
.sm-select-check { display:flex; flex:none; }
.sm-select-scroll { text-align:center; padding:4px; color:var(--sm-muted); }
.sm-app .toolbar-tools, .sm-app .sm-form-grid > label { min-width:0; }
@media(max-width:760px) { .sm-app .sm-map-view-tools { margin-left:0; } .sm-app .sm-source-tools { align-items:stretch; } .sm-app .sm-form-grid { grid-template-columns:minmax(0,1fr) !important; } .sm-app .toolbar-tools { flex-wrap:wrap; } }
.sm-app .sm-source-content { display:grid; gap:8px; margin-top:16px; font-size:12px; }
.sm-app .sm-source-content textarea { width:100%; min-height:96px; resize:vertical; padding:12px; font-family:inherit; font-size:14px; line-height:1.6; border:1px solid var(--sm-line); border-radius:4px; background:white; color:var(--sm-ink); }
.sm-app .sm-create-skill > p { padding:0 16px; font-size:13px; line-height:1.6; color:var(--sm-muted); }
.sm-app .sm-create-skill > .sm-source-tools { padding:16px; }
.sm-app .document-ruler[hidden] { display:none; }
.sm-app .editor-work:has(.document-surface > div:not([hidden]) > .sm-source-workspace) { grid-template-columns:minmax(0,1fr); }
.sm-app .editor-work:has(.document-surface > div:not([hidden]) > .sm-source-workspace) .source-notes { display:none; }
.sm-app .evaluation-run-toolbar progress { accent-color:var(--sm-blue); }
@keyframes sm-busy-spin { to { transform:rotate(360deg); } }
@keyframes sm-feedback-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
@media(max-width:1200px) { .sm-app .evidence-ledger { grid-template-columns:repeat(2,minmax(0,1fr)); } .sm-app .evidence-ledger .trace-summary { grid-column:1/-1; border-left:0; border-top:1px solid var(--sm-line); } .sm-app .evidence-column header { flex-wrap:wrap; } .sm-app .evidence-column header h2 { white-space:normal; } }
@media(max-width:900px) { .sm-app .evidence-ledger { grid-template-columns:minmax(0,1fr); } }
@media(max-width:1100px) { .sm-app .editor-work { grid-template-columns:minmax(0,1fr); } .sm-app .source-notes { border-left:0; border-top:1px solid var(--sm-line); } }
@media(max-width:760px) { .sm-app .editor-shell, .sm-app .annotation-shell { grid-template-columns:minmax(0,1fr); } .sm-app .sm-resizable-rail { width:100% !important; max-width:none; min-width:0; } .sm-app .sm-rail-handle { display:none; } .sm-app .sm-resizable-rail .case-list { max-height:200px; } }
@media(prefers-reduced-motion:reduce) { .sm-app .sm-busy-indicator, .sm-app .sm-toast { animation:none; } .sm-app .gate-button { transition:none; } }

.sm-validation-feedback,.sm-candidate-feedback{margin:16px 0;padding:16px;border:1px solid var(--sm-border,#dcd8d0);border-radius:4px;background:#f2f8f5;line-height:1.6;overflow-wrap:anywhere}
.sm-validation-feedback.has-errors,.sm-candidate-feedback.has-errors{background:#fff7ef;border-color:#decbb8}
.sm-validation-feedback p,.sm-candidate-feedback p{margin:8px 0}
.sm-candidate-feedback ul{margin:8px 0;padding-left:22px}
.sm-check-time{margin-left:12px;color:#626b75;font-size:12px}
.sm-validation-feedback:focus-visible,.review-section:focus-visible{outline:2px solid #2267c7;outline-offset:3px}

.sm-model-field { display: grid; gap: 8px; width: 100%; max-width: 640px; min-width: 0; }
.sm-model-settings p, .sm-model-settings .management-actions { overflow-wrap: anywhere; }
.sm-model-settings .management-actions { flex-wrap: wrap; gap: 12px; }

.sm-evaluation-create-fields { border:0; padding:0; margin:0; min-width:0; }
.sm-evaluation-source-tabs { display:flex; gap:8px; flex-wrap:wrap; padding:16px; }
.sm-evaluation-source-tabs [aria-pressed="true"] { background:var(--sm-blue-soft); border-color:var(--sm-blue); color:var(--sm-blue); }
.sm-evaluation-upload { padding:0 16px 16px; min-width:0; }
.sm-evaluation-upload p { margin:12px 0; line-height:1.6; }
.sm-evaluation-upload td { max-width:360px; white-space:pre-wrap; overflow-wrap:anywhere; }
.sm-evaluation-inline { margin:16px 24px; padding:14px 16px; border:1px solid var(--sm-line); background:#f3f7f5; line-height:1.6; }
.sm-evaluation-identity { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 24px; overflow-wrap:anywhere; }
.sm-annotation-result { min-height:104px; margin-top:16px; padding:16px; background:#f3f7f5; border:1px solid var(--sm-line); line-height:1.6; }
.sm-annotation-result p { margin:8px 0 12px; }
.sm-annotation-result .annotation-actions { justify-content:flex-start; flex-wrap:wrap; }
.sm-app .grade-fieldset:disabled { opacity:1; }
.sm-app .grade-fieldset:disabled .grade-option { cursor:default; }
.sm-app .gate-button[aria-busy="true"] { transition:none; opacity:1; }
.sm-app .sm-busy-indicator { position:absolute; right:4px; width:8px; height:8px; pointer-events:none; }
.sm-app .gate-button { position:relative; }
.sm-eval-create-action { flex-wrap:wrap; gap:12px; }

.sm-next-step { margin:8px 0 0; color:var(--sm-ink); font-family:inherit; font-size:12px; line-height:1.65; white-space:normal; overflow-wrap:anywhere; }
.attention-item .row-link { white-space:normal; text-align:right; }

/* Shared table actions and filter forms use the same type and spacing. */
.sm-app .row-link, .sm-app .sm-link {
  font-family:inherit; font-size:13px; font-weight:500; line-height:1.5;
}
.sm-app .sm-filter-form {
  display:flex; flex-wrap:wrap; align-items:flex-end; gap:16px;
  margin:0; padding:16px 24px; border:0; background:transparent;
}
.sm-app .sm-filter-form > label:not(.sm-check-label) {
  display:grid; gap:8px; flex:0 1 480px; min-width:0;
  color:var(--sm-muted); font-family:inherit; font-size:12px; line-height:1.5;
}
.sm-app .sm-filter-form > input { flex:0 1 320px; min-width:0; }
.sm-app .sm-filter-form .toolbar-tools { width:100%; margin:0; gap:12px; }
.sm-app .toolbar-tools > .sm-select-trigger, .sm-app .sm-filter-form > .sm-select-trigger {
  flex:0 1 180px; width:180px; max-width:100%;
}
.sm-app .toolbar-tools > .search-field {
  flex:0 1 320px; width:320px; min-width:0; max-width:100%; height:36px;
}
.sm-app .sm-filter-form .sm-check-label { min-height:36px; flex:0 0 auto; align-items:center; }
.sm-app .sm-filter-form .trace-time-filter { flex-basis:100%; min-width:0; overflow-wrap:anywhere; }
.sm-app .sm-filter-form .sm-select-trigger, .sm-app .sm-filter-form input:not([type="checkbox"]), .sm-app .sm-filter-form select {
  min-height:36px; font-family:inherit; font-size:13px; line-height:1.5;
}
.sm-app .sm-filter-form > label .sm-select-trigger { width:100%; max-width:none; }
.sm-app .management-directory-tools.sm-filter-form { padding:16px; gap:12px; }
.sm-app .management-directory-tools.sm-filter-form > input { width:100%; flex-basis:100%; }
.sm-app .management-audit-filters.sm-filter-form { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
.sm-app .sm-filter-row { border:0; gap:16px; }

.sm-app .quality-table { table-layout:fixed; }
.quality-col-skill { width:42%; }
.quality-col-number { width:33%; }
.quality-col-status { width:25%; }
.sm-app .quality-table th { height:auto; padding:12px 16px; font-size:12px; line-height:1.5; }
.sm-app .quality-table td { height:auto; padding:16px; vertical-align:top; line-height:1.6; }
.sm-app .quality-table th:first-child, .sm-app .quality-table td:first-child { padding-left:24px; }
.sm-app .quality-table th:last-child, .sm-app .quality-table td:last-child { padding-right:24px; }
.sm-app .quality-summary td { border-bottom:0; padding-bottom:8px; }
.sm-app .quality-skill { width:100%; text-align:left; padding:0; gap:4px; white-space:normal; }
.sm-app .quality-skill strong { font-size:13px; line-height:1.5; white-space:normal; overflow-wrap:anywhere; }
.sm-app .quality-skill small { font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
.sm-app .quality-number { font-family:inherit; font-size:13px; font-variant-numeric:tabular-nums; }
.sm-app .quality-number small { display:block; margin-top:4px; font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.sm-app .quality-table .quality-details td { text-align:left; padding-top:4px; padding-bottom:20px; }
.quality-issue { display:flex; gap:16px; align-items:flex-end; }
.quality-issue > div { flex:1; min-width:0; }
.quality-issue p { margin:0; font-size:12px; line-height:1.7; overflow-wrap:anywhere; }
.quality-issue .sm-next-step { margin-top:8px; }
.quality-issue > .sm-link { flex:0 0 auto; }
@media (max-width:1000px) {
  .quality-issue { align-items:flex-start; flex-direction:column; gap:8px; }
  .sm-app .toolbar-tools > .search-field { flex-basis:100%; width:100%; }
}
@media (max-width:700px) {
  .sm-app .sm-filter-form { padding:16px; }
  .sm-app .toolbar-tools > .search-field { flex-basis:100%; width:100%; }
  .sm-app .toolbar-tools > .sm-select-trigger, .sm-app .sm-filter-form > .sm-select-trigger { flex:1 1 160px; width:160px; }
  .sm-app .management-audit-filters.sm-filter-form { grid-template-columns:minmax(0,1fr); }
  .sm-app .quality-table th, .sm-app .quality-table td { padding-left:12px; padding-right:12px; }
  .sm-app .quality-table th:first-child, .sm-app .quality-table td:first-child { padding-left:16px; }
  .sm-app .quality-table th:last-child, .sm-app .quality-table td:last-child { padding-right:16px; }
  .sm-app .quality-summary .sm-pill { white-space:normal; }
}
@media (max-width:480px) {
  .sm-app .toolbar-tools > .sm-select-trigger, .sm-app .sm-filter-form > .sm-select-trigger { flex:0 1 100%; width:100%; }
}

.sm-app .sm-toast { background:#f3f7f5; color:var(--sm-ink); border:1px solid var(--sm-line); box-shadow:none; animation:none; }
.sm-app .sm-toast button { color:inherit; }

.sm-app .sm-eval-create-action > span { font-size:12px; font-weight:400; color:var(--sm-muted); line-height:1.6; }
.sm-app .sm-annotation-result { font-size:13px; font-weight:400; }
.sm-app .sm-annotation-result p { font-size:13px; font-weight:400; }
@media (max-width:900px) {
  .sm-app .annotation-shell { display:block; }
  .sm-app .annotation-shell > .sm-resizable-rail { width:100%!important; max-width:none; border-right:0; border-bottom:1px solid var(--sm-line); }
  .sm-app .annotation-shell .sm-rail-handle { display:none; }
  .sm-app .annotation-shell .case-list { max-height:200px; overflow:auto; }
  .sm-app .annotation-shell .case-pane { width:100%; min-width:0; }
}
`
