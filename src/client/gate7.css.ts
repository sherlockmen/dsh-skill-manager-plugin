/**
 * Gate 7 production surface.
 *
 * The approved prototypes use a continuous paper-ledger work surface rather
 * than a collection of floating cards.  These rules intentionally live next
 * to the React face so the packed Harness plugin is self contained; no page
 * in the host has to serve CSS assets for the plugin.
 */
export const GATE7_CSS: string = `
.sm-app {
  isolation: isolate;
  display: grid;
  grid-template-columns: 216px minmax(0, 1fr);
  min-height: 100dvh;
  height: 100dvh;
  background: #fbfaf7;
}
.sm-sidebar {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  height: 100dvh;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid #dedbd3;
  background: #fffefa;
}
.sm-brand {
  display: flex;
  height: 68px;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid #ebe8e1;
}
.sm-brand-mark {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #262b31;
  border-radius: 4px;
  background: #fff;
  color: #262b31;
  font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: -.06em;
}
.sm-brand strong { display: block; color: #23272c; font-size: 13px; font-weight: 650; letter-spacing: -.015em; }
.sm-brand small { display: block; margin-top: 4px; color: #7a8087; font-size: 11px; }
.sm-nav { display: grid; gap: 2px; padding: 12px 10px; }
.sm-nav-item {
  display: grid;
  min-height: 36px;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #596169;
  font-family:inherit; font-size:13px; line-height:1.2;
  text-align: left;
  cursor: pointer;
}
.sm-nav-item:hover { background: #f3f1ec; color: #20252a; }
.sm-nav-item.is-active { background: #e7effb; color: #20252a; font-weight: 600; }
.sm-nav-glyph { color: currentColor; font-size: 15px; line-height: 1; text-align: center; }
.sm-sidebar-bottom { display: grid; gap: 4px; margin-top: auto; padding: 12px 10px 14px; border-top: 1px solid #ebe8e1; }
.sm-health { display: flex; min-height: 28px; align-items: center; gap: 8px; padding: 0 10px; color: #7a8087; font-size: 11px; }
.sm-health i { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: #158064; }
.sm-native-link { min-height: 34px; padding: 0 10px; border: 0; border-radius: 4px; background: transparent; color: #6e757d; font-family:inherit; font-size:11px; line-height:1.2; text-align: left; cursor: pointer; }
.sm-native-link:hover { background: #f3f1ec; color: #2267c7; }
.sm-main { min-width: 0; overflow: auto; position: relative; background: #fffefa; }
.sm-topbar {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  height: 40px;
  min-width: 0;
  align-items: center;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid #e4e1da;
  background: rgba(255,255,255,.94);
  backdrop-filter: blur(10px);
}
.sm-breadcrumb { display: flex; min-width: 0; align-items: center; gap: 8px; overflow: hidden; color: #737a82; font-size: 12px; white-space: nowrap; }
.sm-breadcrumb span { color: #656d75; }
.sm-breadcrumb b { color: #a2a7ad; font-weight: 400; }
.sm-breadcrumb strong { overflow: hidden; color: #24282d; font-weight: 600; text-overflow: ellipsis; }
.sm-top-status { display: flex; flex: 0 0 auto; align-items: center; gap: 7px; margin-left: auto; color: #737a82; font-size: 11px; }
.sm-top-status .dot-ready, .sm-top-status .dot-warning { width: 7px; height: 7px; border-radius: 50%; background: #158064; }
.sm-top-status .dot-warning { background: #aa6900; }
.sm-top-divider { width: 1px; height: 14px; margin: 0 4px; background: #e4e1da; }
.sm-page { min-width: 0; max-width: none; margin: 0; padding: 0 0 64px; background: #fffefa; }
.sm-connection-banner { margin: 16px 24px 0; max-width: none; border-radius: 4px; }
.sm-toast { top: 52px; right: 24px; border-radius: 4px; }

.gate-page-head {
  display: grid;
  min-height: 84px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  padding: 16px 24px;
  border-bottom: 1px solid #e4e1da;
  background: #fffefa;
}
.gate-title-group { display: grid; min-width: 0; gap: 5px; }
.gate-title-line { display: flex; min-width: 0; align-items: center; gap: 9px; flex-wrap: wrap; }
.gate-title-line h1 { min-width: 0; overflow: hidden; color: #24282d; font-size: 20px; font-weight: 650; letter-spacing: -.02em; text-overflow: ellipsis; white-space: nowrap; }
.gate-title-meta { display: flex; min-width: 0; align-items: center; gap: 10px; color: #777e86; font-size: 12px; flex-wrap: wrap; }
.gate-title-meta .mono, .gate-mono { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
.gate-page-actions, .gate-editor-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; flex-wrap: wrap; }
.gate-status.status { display: inline-flex; min-height: 22px; align-items: center; gap: 5px; padding: 0 7px; border-radius: 4px; font-size: 11px; font-weight: 500; white-space: nowrap; }
.gate-status.status::before { width: 5px; height: 5px; flex: 0 0 auto; }
.gate-status.status i { display: none; }
.gate-button.sm-button { position: relative; display: inline-flex; min-height: 30px; align-items: center; justify-content: center; padding: 0 12px; border: 1px solid #d7d4cc; border-radius: 5px; background: #fff; color: #30353a; font-family:inherit; font-size:12px; font-weight:500; line-height:1.1; cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
.gate-button.sm-button:hover:not(:disabled) { border-color: #afb8c3; background: #fafbfc; transform: none; }
.gate-button.sm-button:active:not(:disabled) { background: #f0f2f5; }
.gate-button.sm-button-primary { min-height: 36px; border-color: #2267c7; background: #2267c7; color: #fff; }
.gate-button.sm-button-primary:hover:not(:disabled) { border-color: #1859b0; background: #1859b0; }
.gate-button.sm-button-quiet { border-color: transparent; background: transparent; color: #2267c7; }
.gate-button.sm-button-danger { border-color: #e3baba; background: #fffafa; color: #ad3e3e; }
.gate-button.sm-button:disabled { opacity: .48; transform: none; }
.gate-tabs { display: flex; height: 36px; gap: 24px; overflow-x: auto; padding: 0 24px; border-bottom: 1px solid #dcd9d1; scrollbar-width: none; }
.gate-tabs::-webkit-scrollbar { display: none; }
.gate-tab { flex: 0 0 auto; padding: 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #757c84; font-size: 12px; cursor: pointer; }
.gate-tab:hover, .gate-tab.is-active { color: #24282d; }
.gate-tab.is-active { border-bottom-color: #2267c7; font-weight: 600; }
.gate-work-belt { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid #dcd9d1; background: #fffefa; }
.gate-belt-stage { position: relative; min-width: 0; min-height: 102px; padding: 16px 24px; border-left: 1px solid #e4e1da; }
.gate-belt-stage:first-child { border-left: 0; }
.gate-belt-stage:not(:last-child)::after { position: absolute; z-index: 2; top: 50%; right: -6px; width: 10px; height: 10px; border-top: 1px solid #d6d3cb; border-right: 1px solid #d6d3cb; background: #fffefa; content: ''; transform: translateY(-50%) rotate(45deg); }
.gate-belt-stage.active { background: #fff1d9; }
.gate-belt-stage.active::after { background: #fff1d9; }
.gate-belt-stage.pending { background: #fff7e8; }
.gate-belt-stage.pending::after { background: #fff7e8; }
.gate-belt-stage.error { background: #fff0f0; }
.gate-belt-stage.error::after { background: #fff0f0; }
.gate-belt-kicker { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.gate-belt-stage h2 { overflow: hidden; padding-top: 8px; color: #272c31; font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.gate-belt-stage p { overflow: hidden; padding-top: 4px; color: #777e86; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }

/* A live job has one status group and one action group, not three workflow
   stages. Keep its controls stable as progress and identifiers grow. */
.evaluation-run-toolbar {
  --evaluation-gap-tight: var(--primitive-space-2, 8px);
  --evaluation-gap-group: var(--primitive-space-4, 16px);
  --evaluation-inset: var(--primitive-space-6, 24px);
  --evaluation-label-size: var(--text-ui, 13px);
  --evaluation-meta-size: var(--text-ui-xs, 11px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--evaluation-inset);
  padding: var(--evaluation-gap-group) var(--evaluation-inset);
  border-bottom-color: var(--sm-line);
}
.evaluation-run-toolbar > .gate-belt-stage {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: baseline;
  gap: var(--evaluation-gap-tight) var(--evaluation-gap-group);
  padding: 0;
  border: 0;
}
.evaluation-run-toolbar > .gate-belt-stage::after { display: none; content: none; }
.evaluation-run-toolbar > .gate-belt-stage > strong {
  color: var(--sm-ink);
  font-size: var(--evaluation-label-size);
  font-weight: 600;
  line-height: 1.5;
}
.evaluation-run-toolbar > .gate-belt-stage > [role="status"] {
  min-width: 0;
  color: var(--sm-muted);
  font-size: var(--evaluation-label-size);
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.evaluation-run-toolbar progress {
  display: block;
  width: 100%;
  height: var(--primitive-space-1, 4px);
  grid-column: 1 / -1;
  overflow: hidden;
  appearance: none;
  border: 0;
  border-radius: 0;
  background: var(--sm-line);
  color: var(--sm-blue);
  accent-color: var(--sm-blue);
}
.evaluation-run-toolbar progress::-webkit-progress-bar { background: var(--sm-line); }
.evaluation-run-toolbar progress::-webkit-progress-value { background: var(--sm-blue); }
.evaluation-run-toolbar progress::-moz-progress-bar { background: var(--sm-blue); }
.evaluation-run-toolbar > .gate-belt-stage > small {
  display: block;
  min-width: 0;
  grid-column: 1 / -1;
  color: var(--sm-muted);
  font-size: var(--evaluation-meta-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.evaluation-run-toolbar > .gate-page-actions {
  width: auto;
  justify-content: flex-end;
  gap: var(--evaluation-gap-tight);
}
.evaluation-run-toolbar > .gate-page-actions > .gate-button {
  min-height: var(--button-height, 36px);
  flex: 0 0 auto;
  font-size: var(--evaluation-label-size);
}
@media (max-width: 1120px) {
  .evaluation-run-toolbar { grid-template-columns: minmax(0, 1fr); gap: var(--evaluation-gap-group); }
  .evaluation-run-toolbar > .gate-page-actions { width: 100%; }
}
@media (max-width: 600px) {
  .evaluation-run-toolbar > .gate-belt-stage { grid-template-columns: minmax(0, 1fr); }
  .evaluation-run-toolbar > .gate-page-actions { justify-content: flex-start; }
}

/* These native controls remain programmatically uploadable and named for
   assistive technology. Their visible keyboard entry is the import button. */
.sm-app input[type="file"].sm-upload-input {
  position: absolute !important;
  display: block !important;
  width: 1px !important;
  height: 1px !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 1px !important;
  max-height: 1px !important;
  margin: -1px !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  clip-path: inset(50%) !important;
  border: 0 !important;
  white-space: nowrap !important;
}
.gate-notice { margin: 16px 24px 0; padding: 11px 16px; border-left: 3px solid #2267c7; background: #e8f1ff; color: #5e6872; font-size: 13px; line-height: 1.5; }
.gate-notice.warning { border-left-color: #aa6900; background: #fff2dc; }
.gate-notice.error { border-left-color: #ad3e3e; background: #fceaea; }
.gate-notice strong { color: #24282d; font-weight: 650; }
.gate-notice p { padding-top: 4px; }

/* Dashboard — one attention ledger followed by four continuous regions. */
.dashboard-page { min-width: 0; }
.dashboard-head { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 24px; padding: 16px 24px; border-bottom: 1px solid #e4e1da; background: #fffefa; }
.dashboard-head h1 { color: #24282d; font-size: 20px; font-weight: 650; letter-spacing: -.02em; }
.dashboard-head p { padding-top: 5px; color: #737a82; font-size: 12px; }
.dashboard-range { display: flex; align-items: center; gap: 12px; }
.range-note { color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.attention-panel { background: #fffefa; }
.section-head { display: flex; min-height: 56px; align-items: center; gap: 12px; padding: 0 24px; border-bottom: 1px solid #dcd9d1; }
.section-head div { min-width: 0; }
.section-head h2 { color: #2c3136; font-size: 15px; font-weight: 650; }
.section-head p { padding-top: 3px; overflow: hidden; color: #737a82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.section-head .gate-status, .section-head .gate-button { margin-left: auto; }
.attention-list, .release-list { list-style: none; margin: 0; padding: 0; }
.attention-item { display: grid; grid-template-columns: 120px minmax(0,1fr) 124px 104px auto; min-height: 68px; align-items: center; gap: 12px; padding: 11px 24px; border-bottom: 1px solid #eeeae3; color: inherit; text-decoration: none; }
.attention-item:hover, .release-item:hover { background: #faf9f5; }
.attention-reason { min-width: 0; }
.attention-copy { display: grid; min-width: 0; gap: 3px; }
.attention-copy strong { overflow: hidden; color: #272c31; font-size: 13px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.attention-copy small { overflow: hidden; color: #737a82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.attention-context, .attention-time { overflow: hidden; color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.attention-time { text-align: right; }
.row-link { border: 0; background: transparent; color: #2267c7; font-family:inherit; font-size:12px; font-weight:500; line-height:1.2; white-space: nowrap; cursor: pointer; text-decoration: none; }
.row-link:hover { text-decoration: underline; }
.attention-foot, .region-foot { display: flex; min-height: 48px; align-items: center; gap: 8px; padding: 0 24px; color: #737a82; font-size: 11px; }
.attention-foot .row-link, .region-head .row-link { margin-left: auto; }
.region-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); grid-auto-rows: minmax(320px,auto); background: #fffefa; }
.region { min-width: 0; min-height: 320px; border-bottom: 1px solid #dcd9d1; }
.region:nth-child(odd) { border-right: 1px solid #dcd9d1; }
.region-head { display: flex; min-height: 64px; align-items: center; gap: 12px; padding: 11px 24px; border-bottom: 1px solid #eeeae3; }
.region-head div { min-width: 0; }
.region-head h2 { color: #2c3136; font-size: 15px; font-weight: 650; }
.region-head p { overflow: hidden; padding-top: 3px; color: #737a82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.region-head .gate-status, .region-head .row-link { margin-left: auto; }
.metric-strip { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
.metric { min-width: 0; min-height: 88px; padding: 14px 20px; border-bottom: 1px solid #eeeae3; }
.metric:nth-child(2n) { border-left: 1px solid #eeeae3; }
.metric small, .metric span { display: block; overflow: hidden; color: #737a82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.metric strong { display: block; padding-top: 5px; color: #272c31; font: 600 22px ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
.coverage-note { display: grid; gap: 5px; padding: 16px 20px; border-bottom: 1px solid #eeeae3; }
.coverage-note h3 { color: #2c3136; font-size: 12px; font-weight: 650; }
.coverage-note p { color: #5e6872; font-size: 12px; line-height: 1.5; }
.coverage-note a { color: #2267c7; }
.quality-table { width: 100%; border-collapse: collapse; }
.quality-table th { height: 32px; border-bottom: 1px solid #eeeae3; color: #737a82; font-size: 11px; font-weight: 500; text-align: left; white-space: nowrap; }
.quality-table td { height: 58px; border-bottom: 1px solid #eeeae3; color: #5e6872; font-size: 12px; }
.quality-table th:first-child, .quality-table td:first-child { padding-left: 24px; }
.quality-table th:last-child, .quality-table td:last-child { padding-right: 24px; text-align: right; }
.quality-skill { display: grid; gap: 3px; min-width: 0; }
.quality-skill strong { overflow: hidden; color: #272c31; font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.quality-skill small, .quality-number { color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.empty-region { display: grid; min-height: 230px; place-items: center; padding: 24px; text-align: center; }
.empty-region > div { display: grid; max-width: 420px; gap: 8px; }
.empty-region h3 { color: #2c3136; font-size: 15px; font-weight: 650; }
.empty-region p { color: #5e6872; font-size: 12px; line-height: 1.55; }
.empty-region .gate-button { justify-self: center; margin-top: 4px; }
.release-item { display: grid; grid-template-columns: 84px minmax(0,1fr) auto; min-height: 62px; align-items: center; gap: 12px; padding: 10px 24px; border-bottom: 1px solid #eeeae3; color: inherit; text-decoration: none; }
.release-copy { display: grid; min-width: 0; gap: 3px; }
.release-copy strong { overflow: hidden; color: #272c31; font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.release-copy small, .release-time { overflow: hidden; color: #737a82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.release-time { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
.dashboard-empty { display: grid; min-height: 360px; place-items: center; padding: 32px 24px; text-align: center; }
.dashboard-empty > div { display: grid; max-width: 480px; gap: 8px; }
.dashboard-empty h2 { color: #2c3136; font-size: 20px; font-weight: 650; }
.dashboard-empty p { color: #5e6872; font-size: 13px; line-height: 1.55; }

/* Skill editor — source, package and validation remain one work surface. */
.editor-wrap { padding: 16px 24px; }
.editor-shell { display: grid; min-height: 510px; grid-template-columns: 216px minmax(0,1fr); border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; }
.file-rail { min-width: 0; border-right: 1px solid #dcd9d1; background: #fffefa; }
.rail-section { padding: 14px 12px; border-bottom: 1px solid #eeeae3; }
.rail-heading { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 8px; }
.rail-heading h2, .source-notes h3 { color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; letter-spacing: .04em; }
.rail-heading span, .rail-meta { color: #9aa0a6; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.rail-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.rail-button, .file-button { display: grid; width: 100%; min-height: 34px; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 6px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: #5e6872; font-family:inherit; font-size:12px; line-height:1.2; text-align: left; cursor: pointer; }
.rail-button:hover, .file-button:hover { background: #f3f1ec; color: #272c31; }
.file-button[aria-pressed="true"], .rail-button.active { background: #e7effb; color: #272c31; }
.rail-index { color: #8c949c; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.rail-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-pane { display: grid; min-width: 0; grid-template-rows: auto minmax(0,1fr) auto; background: #fffefa; }
.editor-toolbar { display: flex; min-width: 0; min-height: 52px; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid #dcd9d1; background: #fffefa; }
.editor-file { display: grid; min-width: 0; gap: 3px; }
.editor-file strong { overflow: hidden; color: #272c31; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.editor-file small { color: #737a82; font-size: 11px; }
.editor-toolbar-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; margin-left: auto; }
.editor-work { display: grid; min-width: 0; grid-template-columns: minmax(0,1fr) 192px; }
.document-surface { min-width: 0; padding: 16px 20px 20px; }
.document-ruler { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid #eeeae3; color: #737a82; font-size: 11px; }
.document-ruler span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.document-editor { width: 100%; min-height: 330px; padding: 16px 0; border: 0; outline: 0; resize: vertical; background: transparent; color: #2f363d; font-family:inherit; font-size:16px; line-height:1.7; tab-size: 2; }
.document-editor.mono-editor { font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }
.document-editor.readonly-editor { color: #69737d; cursor: default; }
.source-notes { min-width: 0; padding: 16px 12px; border-left: 1px solid #eeeae3; background: #fffefa; }
.source-notes h3 { padding: 0 4px 10px; }
.source-note { display: grid; gap: 4px; padding: 10px 6px; border-top: 1px solid #eeeae3; }
.source-note b { color: #30363b; font-size: 12px; font-weight: 550; }
.source-note span { color: #737a82; font-size: 11px; line-height: 1.45; }
.source-note .line-link { color: #2267c7; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.editor-foot { display: flex; min-height: 32px; align-items: center; gap: 16px; padding: 0 16px; border-top: 1px solid #eeeae3; background: #fffefa; color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.editor-foot span:last-child { margin-left: auto; }
.validation { margin: 0 24px 16px; border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; }
.validation-head { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 16px; border-bottom: 1px solid #eeeae3; background: #fffefa; }
.validation-title { display: flex; min-width: 0; align-items: center; gap: 10px; }
.validation-title h2 { color: #30363b; font-size: 13px; font-weight: 650; }
.validation-head p { color: #737a82; font-size: 11px; }
.validation-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); }
.validation-item { min-width: 0; padding: 14px 16px; border-left: 1px solid #eeeae3; }
.validation-item:first-child { border-left: 0; }
.validation-item small { display: block; color: #737a82; font-size: 11px; }
.validation-item strong { display: block; overflow: hidden; padding-top: 5px; color: #30363b; font-size: 13px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.validation-item p { padding-top: 3px; color: #737a82; font-size: 11px; }

/* Evaluation page — evidence ledger and annotation form from Gate 7 Page 02. */
.annotation-wrap { padding: 16px 24px 0; }
.annotation-shell { display: grid; min-width: 0; grid-template-columns: 216px minmax(0,1fr); border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; }
.case-rail { min-width: 0; border-right: 1px solid #dcd9d1; background: #fffefa; }
.case-rail-head { display: grid; gap: 4px; padding: 14px 12px; border-bottom: 1px solid #eeeae3; }
.case-rail-head small, .case-head small, .annotation-head small { color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.case-rail-head h2 { color: #30363b; font-size: 15px; font-weight: 650; }
.case-list { display: grid; max-height: 540px; gap: 2px; overflow: auto; margin: 0; padding: 8px; list-style: none; }
.case-button { display: grid; width: 100%; min-height: 48px; grid-template-columns: 28px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 6px 8px; border: 0; border-radius: 4px; background: transparent; color: #5e6872; text-align: left; cursor: pointer; }
.case-button:hover { background: #f3f1ec; }
.case-button.is-selected, .case-button[aria-pressed="true"] { background: #e7effb; box-shadow: inset 3px 0 #2267c7; color: #272c31; }
.case-index { color: #899199; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.case-copy { display: grid; min-width: 0; gap: 3px; }
.case-copy strong { overflow: hidden; color: #30363b; font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.case-copy small { overflow: hidden; color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.case-status { display: inline-flex; min-height: 20px; align-items: center; padding: 0 6px; border-radius: 4px; background: #f0eee9; color: #737a82; font-size: 10px; white-space: nowrap; }
.case-status.success { background: #e8f6ef; color: #12785c; }.case-status.warning { background: #fff2dc; color: #a86500; }.case-status.error { background: #fceaea; color: #b33e3e; }
.case-pane { min-width: 0; background: #fffefa; }
.case-head { display: flex; min-height: 68px; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border-bottom: 1px solid #dcd9d1; }
.case-head > div:first-child { min-width: 0; }.case-head h2 { overflow: hidden; padding-top: 5px; color: #30363b; font-size: 16px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }.case-head > div:last-child { display: flex; flex: 0 0 auto; gap: 6px; }
.evidence-ledger { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border-bottom: 1px solid #dcd9d1; }
.evidence-column { min-width: 0; min-height: 290px; border-left: 1px solid #eeeae3; }.evidence-column:first-child { border-left: 0; }
.evidence-column > header { display: flex; min-height: 58px; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eeeae3; }.evidence-column > header > div { min-width: 0; }.evidence-index { color: #899199; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }.evidence-column header small { display: block; color: #737a82; font-size: 10px; }.evidence-column header h2 { overflow: hidden; padding-top: 4px; color: #30363b; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.evidence-column .gate-status, .evidence-action { margin-left: auto; }
.fact-list { display: grid; gap: 9px; padding: 14px 12px; }.fact-list div { display: grid; grid-template-columns: 66px minmax(0,1fr); gap: 8px; }.fact-list dt { color: #737a82; font-size: 11px; }.fact-list dd { min-width: 0; overflow-wrap: anywhere; color: #30363b; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }.evidence-foot { padding: 0 12px 12px; color: #899199; font-size: 10px; line-height: 1.45; }
.result-body { display: grid; gap: 6px; padding: 16px 12px 12px; }.result-body small, .result-rationale small { color: #737a82; font-size: 10px; }.result-body strong { color: #30363b; font-size: 13px; font-weight: 600; line-height: 1.45; }.result-body p, .result-rationale p { color: #5e6872; font-size: 11px; line-height: 1.5; }.result-rationale { display: grid; gap: 6px; margin: 0 12px 12px; padding: 10px; border-left: 3px solid #12785c; background: #e8f6ef; }.result-rationale.error { border-left-color: #b33e3e; background: #fceaea; }.result-rationale code { color: #30363b; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }.trace-steps { display: grid; gap: 0; margin: 0; padding: 10px 12px; list-style: none; }.trace-steps li { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 7px; min-height: 48px; border-bottom: 1px solid #eeeae3; }.trace-steps li:last-child { border-bottom: 0; }.trace-steps li > span { color: #899199; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }.trace-steps li div { display: grid; gap: 3px; }.trace-steps strong { color: #30363b; font-size: 11px; font-weight: 550; }.trace-steps small { color: #737a82; font-size: 10px; }.trace-steps em { color: #12785c; font-size: 10px; font-style: normal; }.trace-steps em.error-text { color: #b33e3e; }
.annotation-panel { padding: 0 16px; }.annotation-head { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eeeae3; }.annotation-head h2 { padding-top: 4px; color: #30363b; font-size: 15px; font-weight: 650; }.annotation-head p { color: #737a82; font-size: 11px; }.annotation-form { padding: 14px 0; }.grade-fieldset, .issue-fieldset { margin: 0; padding: 0; border: 0; }.grade-fieldset legend, .issue-fieldset legend { padding-bottom: 9px; color: #737a82; font-size: 11px; }.grade-options { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }.grade-option, .issue-option { display: flex; min-width: 0; align-items: center; gap: 8px; padding: 10px; border: 1px solid #dcd9d1; border-radius: 4px; background: #fff; cursor: pointer; }.grade-option:has(input:checked), .issue-option:has(input:checked) { border-color: #8fb4e8; background: #eaf2ff; }.grade-option input, .issue-option input { position: absolute; opacity: 0; pointer-events: none; }.radio-control, .checkbox-control { display: grid; width: 16px; height: 16px; flex: 0 0 auto; place-items: center; border: 1px solid #b6bdc5; border-radius: 50%; background: #fff; }.checkbox-control { border-radius: 3px; }.grade-option:has(input:checked) .radio-control { border-color: #2267c7; }.grade-option:has(input:checked) .radio-control::after { width: 8px; height: 8px; border-radius: 50%; background: #2267c7; content: ''; }.issue-option:has(input:checked) .checkbox-control { border-color: #2267c7; background: #2267c7; }.checkbox-control svg { width: 12px; height: 12px; fill: none; stroke: #fff; stroke-width: 2; }.grade-option > span:last-child { display: grid; min-width: 0; gap: 3px; }.grade-option strong { color: #30363b; font-size: 12px; font-weight: 550; }.grade-option small { color: #737a82; font-size: 10px; }.incorrect-details { margin-top: 16px; padding-top: 14px; border-top: 1px solid #eeeae3; }.incorrect-details[hidden] { display: none; }.incorrect-details > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.incorrect-details h3 { padding-top: 4px; color: #30363b; font-size: 13px; font-weight: 600; }.issue-options { display: flex; gap: 8px; padding-top: 10px; flex-wrap: wrap; }.issue-option { padding: 7px 9px; font-size: 11px; }.correction-field { display: grid; gap: 6px; margin-top: 12px; }.correction-field label { color: #737a82; font-size: 11px; }.correction-field textarea { width: 100%; min-height: 84px; resize: vertical; border: 1px solid #dcd9d1; border-radius: 4px; padding: 9px; background: #fff; color: #30363b; font-family:inherit; font-size:12px; line-height:1.55; }.correction-field p { color: #899199; font-size: 10px; }.form-error { display: grid; gap: 3px; margin-top: 12px; padding: 10px 12px; border-left: 3px solid #b33e3e; background: #fceaea; color: #5e6872; font-size: 11px; }.form-error strong { color: #ad3e3e; }.save-status { min-height: 18px; padding-top: 8px; color: #12785c; font-size: 11px; }.accuracy { margin: 16px 24px 0; border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; }.accuracy-head { display: flex; min-height: 52px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 16px; border-bottom: 1px solid #eeeae3; }.accuracy-head > div { display: flex; align-items: center; gap: 10px; }.accuracy-head h2 { color: #30363b; font-size: 13px; font-weight: 650; }.accuracy-head > p { color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }.accuracy-head > p strong { color: #30363b; font-size: 16px; }.accuracy-grid { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); }.accuracy-grid > div { min-width: 0; padding: 12px 14px; border-left: 1px solid #eeeae3; }.accuracy-grid > div:first-child { border-left: 0; }.accuracy-grid small, .accuracy-grid p { display: block; color: #737a82; font-size: 10px; }.accuracy-grid strong { display: block; padding: 4px 0 2px; color: #30363b; font: 600 18px ui-monospace, SFMono-Regular, Menlo, monospace; }

/* Trace Page 03 — P13 horizontal execution flow and equivalent list. */
.context-belt { display: grid; grid-template-columns: 1.05fr 1fr 1fr; border-bottom: 1px solid #dcd9d1; background: #fffefa; }.context-stage { min-width: 0; padding: 14px 24px; border-left: 1px solid #eeeae3; }.context-stage:first-child { border-left: 0; }.context-kicker { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; color: #737a82; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }.context-stage h2 { overflow: hidden; padding-top: 6px; color: #30363b; font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.context-stage p { overflow: hidden; padding-top: 4px; color: #737a82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.trace-toolbar { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 12px 24px; border-bottom: 1px solid #eeeae3; background: #fffefa; }.view-tabs { display: flex; min-width: 0; gap: 4px; overflow-x: auto; }.view-tab { min-height: 30px; flex: 0 0 auto; padding: 0 10px; border: 0; border-radius: 4px; background: transparent; color: #5e6872; font-size: 12px; cursor: pointer; }.view-tab[aria-selected="true"] { background: #e7effb; color: #30363b; }.toolbar-tools { display: flex; min-width: 0; align-items: center; gap: 6px; margin-left: auto; }.search-field { width: min(240px,24vw); height: 30px; border: 1px solid #dcd9d1; border-radius: 4px; padding: 0 9px; background: #fff; color: #30363b; font-family:inherit; font-size:12px; }.filter-select { height: 30px; border: 1px solid #dcd9d1; border-radius: 4px; padding: 0 24px 0 8px; background: #fff; color: #5e6872; font-size: 12px; }.trace-workspace { display: grid; min-width: 0; grid-template-columns: minmax(0,1fr) 360px; border-bottom: 1px solid #dcd9d1; background: #fffefa; }.graph-pane { min-width: 0; border-right: 1px solid #dcd9d1; }.pane-head { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 24px; border-bottom: 1px solid #eeeae3; }.pane-head div { min-width: 0; }.pane-head h2 { color: #30363b; font-size: 15px; font-weight: 650; }.pane-head p { padding-top: 3px; color: #737a82; font-size: 11px; }.pane-head-actions { display: flex; flex: 0 0 auto; gap: 4px; }.mini-action { min-height: 28px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: #5e6872; font-size: 11px; cursor: pointer; }.mini-action:hover { background: #f3f1ec; color: #30363b; }.graph-scroll { position: relative; min-height: 360px; overflow: auto; background-color: #fffefa; background-image: radial-gradient(#dedbd3 1px, transparent 1px); background-size: 16px 16px; }.graph-canvas { position: relative; display: flex; width: max-content; min-width: 100%; min-height: 360px; align-items: center; justify-content: center; padding: 60px 64px; }.trace-node { position: relative; width: 160px; min-height: 88px; flex: 0 0 auto; overflow: visible; padding: 0; border: 1px solid #d4d8dc; border-radius: 6px; background: #fff; color: #30363b; text-align: left; cursor: pointer; }.trace-node::before { position: absolute; inset: 0 auto 0 0; width: 4px; border-radius: 6px 0 0 6px; background: #667585; content: ''; }.trace-node.skill::before { background: #2267c7; }.trace-node.model::before { background: #7f63a8; }.trace-node.tool::before { background: #158064; }.trace-node.merge::before { background: #a86500; }.trace-node:hover { border-color: #aeb8c5; }.trace-node.failed { border-color: #b33e3e; }.trace-node.partial { border-style: dashed; border-color: #a86500; }.trace-node[aria-pressed="true"] { box-shadow: 0 0 0 2px #2267c7, 0 6px 16px rgba(36,41,46,.08); }.node-type { display: flex; min-height: 28px; align-items: center; justify-content: space-between; padding: 0 9px 0 12px; border-bottom: 1px solid #eeeae3; border-radius: 6px 6px 0 0; background: #f7f6f2; color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }.node-copy { display: grid; gap: 6px; padding: 11px 12px; }.node-copy strong { overflow: hidden; font-size: 13px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }.node-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }.node-state { color: #12785c; font-family: inherit; }.trace-node.failed .node-state { color: #b33e3e; }.trace-node.partial .node-state { color: #a86500; }.port { position: absolute; top: 50%; width: 8px; height: 8px; border: 2px solid #fff; border-radius: 50%; background: #8fa3b9; transform: translateY(-50%); }.port.in { left: -5px; }.port.out { right: -5px; }.edge { position: relative; width: 44px; height: 1px; flex: 0 0 auto; background: #9aabba; }.edge::after { position: absolute; top: 50%; right: 0; width: 6px; height: 6px; border-top: 1px solid #9aabba; border-right: 1px solid #9aabba; content: ''; transform: translate(-1px,-50%) rotate(45deg); }.edge.failed { background: #b33e3e; }.edge.failed::after { border-color: #b33e3e; }.parallel-group { position: relative; display: grid; flex: 0 0 auto; gap: 16px; padding: 8px 0; }.parallel-group::before, .parallel-group::after { position: absolute; left: -22px; width: 22px; border: 1px solid #9aabba; border-right: 0; content: ''; }.parallel-group::before { top: 46px; bottom: 50%; border-bottom: 0; }.parallel-group::after { top: 50%; bottom: 46px; border-top: 0; }.detail-pane { min-width: 0; background: #fffefa; }.detail-pane[hidden], .graph-pane[hidden], .sequence-section[hidden] { display: none; }.detail-head { display: grid; gap: 6px; padding: 16px 20px; border-bottom: 1px solid #eeeae3; }.detail-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; }.detail-head h2 { color: #30363b; font-size: 20px; font-weight: 650; }.detail-head p { color: #5e6872; font-size: 12px; line-height: 1.5; }.detail-section { padding: 14px 20px; border-bottom: 1px solid #eeeae3; }.detail-section h3 { padding-bottom: 8px; color: #30363b; font-size: 12px; font-weight: 650; }.detail-list { display: grid; gap: 8px; }.detail-list div { display: grid; grid-template-columns: 72px minmax(0,1fr); gap: 8px; }.detail-list dt { color: #737a82; font-size: 11px; }.detail-list dd { min-width: 0; overflow-wrap: anywhere; color: #5e6872; font-size: 11px; }.code-evidence { overflow-x: auto; padding: 9px; border: 1px solid #eeeae3; border-radius: 4px; background: #f7f6f2; color: #5e6872; font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }.error-evidence { border-left: 3px solid #b33e3e; background: #fceaea; }.error-evidence p { color: #5e6872; font-size: 11px; line-height: 1.5; }.detail-foot { padding: 12px 20px; color: #899199; font-size: 10px; }.sequence-section { background: #fffefa; }.sequence-head { display: flex; min-height: 52px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 24px; border-bottom: 1px solid #dcd9d1; }.sequence-head h2 { color: #30363b; font-size: 15px; font-weight: 650; }.sequence-head p { color: #737a82; font-size: 11px; }.sequence-list { margin: 0; padding: 0; list-style: none; }.sequence-button { display: grid; width: 100%; min-height: 58px; grid-template-columns: 36px minmax(140px,1.2fr) 72px minmax(100px,1fr) 56px auto; align-items: center; gap: 10px; padding: 8px 24px; border: 0; border-bottom: 1px solid #eeeae3; background: transparent; color: #5e6872; text-align: left; cursor: pointer; }.sequence-button:hover { background: #faf9f5; }.sequence-button[aria-current="true"] { background: #e7effb; box-shadow: inset 3px 0 #2267c7; }.sequence-index, .sequence-time, .sequence-type, .sequence-parent { overflow: hidden; color: #899199; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }.sequence-copy { display: grid; min-width: 0; gap: 3px; }.sequence-copy strong { overflow: hidden; color: #30363b; font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }.sequence-copy small { overflow: hidden; color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }.sequence-state { justify-self: start; }.sequence-action { justify-self: end; color: #2267c7; font-size: 11px; white-space: nowrap; }.mobile-summary { display: none; }

.gate-empty { display: grid; min-height: 280px; place-items: center; padding: 32px 24px; text-align: center; }.gate-empty > div { display: grid; max-width: 380px; gap: 8px; }.gate-empty h2 { color: #30363b; font-size: 16px; font-weight: 650; }.gate-empty p { color: #737a82; font-size: 12px; line-height: 1.55; }.gate-empty .gate-button { justify-self: center; margin-top: 6px; }
.gate-create { margin: 16px 24px 0; border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; }.gate-create .sm-card-heading { min-height: 56px; padding: 0 16px; align-items: center; }.gate-create .sm-form-grid { padding: 14px 16px; }.gate-create textarea { min-height: 72px; }
.sm-nav-index { display: none !important; }

/* Gate 7 additions used by the live React surfaces. Trace list and detail
   are separate work surfaces; the P13 canvas owns its full available width. */
.gate-batch-picker-panel { display: grid; gap: 0; margin: 12px 24px 0; border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; background: #fffefa; }
.gate-batch-picker-panel > p { padding: 14px 16px; color: #737a82; font-size: 12px; }
.batch-option { display: flex; min-width: 0; min-height: 54px; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 16px; border: 0; border-bottom: 1px solid #eeeae3; background: transparent; color: #30363b; text-align: left; cursor: pointer; }
.batch-option:last-child { border-bottom: 0; }
.batch-option:hover { background: #faf9f5; }
.batch-option.is-selected { background: #e7effb; box-shadow: inset 3px 0 #2267c7; }
.batch-option > span:first-child { display: grid; min-width: 0; gap: 3px; }
.batch-option strong { overflow: hidden; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.batch-option small { overflow: hidden; color: #737a82; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.annotation-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.gate-suggestions { margin: 16px 24px 0; border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; background: #fffefa; }
.gate-suggestions > header { display: flex; min-height: 52px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 16px; border-bottom: 1px solid #eeeae3; }
.gate-suggestions > header h2 { color: #30363b; font-size: 13px; font-weight: 650; }
.gate-suggestions > header p { padding-top: 3px; color: #737a82; font-size: 11px; }
.gate-eval-footer { display: flex; align-items: center; gap: 16px; margin: 0 24px; }
.gate-eval-footer .sm-link:last-child { margin-left: auto; }
.trace-page .context-belt { border-top: 0; }
.trace-page .trace-toolbar { flex-wrap: wrap; }
.trace-page .trace-workspace { grid-template-columns: minmax(0,1fr); gap: 0; }
.trace-list-pane { min-width: 0; border-right: 1px solid #dcd9d1; background: #fffefa; }
.trace-list-items { max-height: 520px; overflow: auto; margin: 0; padding: 6px 0; list-style: none; }
.trace-list-item { display: grid; width: 100%; min-width: 0; grid-template-columns: 8px minmax(0,1fr) auto; align-items: center; gap: 8px; padding: 11px 12px; border: 0; border-bottom: 1px solid #eeeae3; background: transparent; color: #30363b; text-align: left; cursor: pointer; }
.trace-list-item:hover { background: #faf9f5; }
.trace-list-item.is-selected { background: #e7effb; box-shadow: inset 3px 0 #2267c7; }
.trace-list-dot { width: 7px; height: 7px; border-radius: 50%; background: #158064; }
.trace-list-dot.is-error { background: #b33e3e; }.trace-list-dot.is-unset { background: #a86500; }
.trace-list-copy { display: grid; min-width: 0; gap: 3px; }
.trace-list-copy strong { overflow: hidden; color: #30363b; font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.trace-list-copy small { overflow: hidden; color: #737a82; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.trace-list-meta { display: grid; justify-items: end; gap: 3px; min-width: 42px; }
.trace-list-meta small { color: #899199; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.trace-page .graph-pane { border-right: 1px solid #dcd9d1; }
.trace-page .graph-scroll { min-height: 410px; }
.trace-page .graph-canvas { min-height: 410px; justify-content: flex-start; }
.trace-page .detail-pane { min-height: 410px; }
.trace-page .detail-eyebrow > span:last-child { display: flex; align-items: center; gap: 4px; }
.trace-page .detail-eyebrow .mini-action { padding: 0 5px; }
.trace-page .sequence-section { margin-top: 16px; border-top: 1px solid #dcd9d1; border-bottom: 1px solid #dcd9d1; }
.trace-page .sequence-head { min-height: 58px; }
.trace-page .sequence-list { max-height: 560px; overflow: auto; }

@media (max-width: 1120px) {
  .sm-app { grid-template-columns: 64px minmax(0,1fr); }
  .sm-brand { justify-content: center; padding: 0; }
  .sm-brand > div { display: none; }
  .sm-nav-item { grid-template-columns: 1fr; justify-items: center; gap: 5px; padding: 0; font-size: 10px; }
  .sm-nav-glyph { font-size: 17px; }
  .sm-health { justify-content: center; padding: 0; font-size: 0; }
  .sm-native-link { padding: 0; font-size: 0; text-align: center; }
  .sm-native-link:first-letter { font-size: 17px; }
  .editor-shell { grid-template-columns: 176px minmax(0,1fr); }
  .trace-workspace { grid-template-columns: minmax(0,1fr) 320px; }
  .attention-item { grid-template-columns: 106px minmax(0,1fr) 96px auto; }
  .attention-context { display: none; }
}
@media (max-width: 860px) {
  .gate-page-head, .dashboard-head { grid-template-columns: 1fr; align-items: start; }
  .gate-page-actions, .dashboard-range { justify-content: flex-start; }
  .gate-work-belt, .context-belt { grid-template-columns: 1fr; }
  .gate-belt-stage, .context-stage { border-top: 1px solid #eeeae3; border-left: 0; }
  .gate-belt-stage:first-child, .context-stage:first-child { border-top: 0; }
  .gate-belt-stage:not(:last-child)::after { display: none; }
  .region-grid { grid-template-columns: 1fr; grid-auto-rows: auto; }
  .region { min-height: auto; border-right: 0 !important; }
  .annotation-shell { grid-template-columns: 176px minmax(0,1fr); }
  .evidence-ledger { grid-template-columns: 1fr; }
  .evidence-column { min-height: auto; border-top: 1px solid #eeeae3; border-left: 0; }
  .evidence-column:first-child { border-top: 0; }
  .trace-workspace { grid-template-columns: 1fr; }
  .graph-pane { border-right: 0; }
  .detail-pane { border-top: 1px solid #dcd9d1; }
  .editor-work { grid-template-columns: 1fr; }
  .source-notes { display: none; }
  .accuracy-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .accuracy-grid > div:nth-child(4) { border-left: 0; }
}
@media (max-width: 640px) {
  .sm-app { display: block; }
  .sm-sidebar { position: fixed; inset: 0 auto 0 0; width: min(272px,84vw); transform: translateX(-105%); transition: transform 160ms ease; box-shadow: 0 18px 48px rgba(36,41,46,.14); }
  .sm-sidebar.open { transform: translateX(0); }
  .sm-topbar { padding: 0 12px; }
  .sm-topbar::before { content: '菜单'; display: inline-flex; min-height: 26px; align-items: center; padding: 0 8px; border: 1px solid #dcd9d1; border-radius: 4px; color: #5e6872; font-size: 11px; }
  .sm-top-status { display: none; }
  .sm-page { padding-bottom: 48px; }
  .gate-page-head, .dashboard-head { padding: 14px 16px; }
  .gate-title-line h1, .dashboard-head h1 { font-size: 18px; }
  .gate-page-actions, .dashboard-range { width: 100%; }
  .gate-page-actions .gate-button, .dashboard-range .gate-button { flex: 1; }
  .gate-tabs { gap: 18px; padding: 0 16px; }
  .gate-notice { margin: 12px 16px 0; }
  .section-head, .region-head, .attention-item, .attention-foot, .region-foot { padding-right: 16px; padding-left: 16px; }
  .attention-item { grid-template-columns: minmax(0,1fr) auto; gap: 4px 10px; min-height: 76px; }
  .attention-reason { grid-column: 1; grid-row: 2; }.attention-copy { grid-column: 1; grid-row: 1; }.attention-time { grid-column: 2; grid-row: 1; }.attention-item .row-link { grid-column: 2; grid-row: 2; }
  .annotation-wrap, .editor-wrap { padding: 12px 16px 0; }
  .annotation-shell { grid-template-columns: 1fr; }
  .case-rail { border-right: 0; border-bottom: 1px solid #dcd9d1; }
  .case-list { display: flex; max-height: 74px; overflow-x: auto; overflow-y: hidden; padding: 6px; }.case-list li { flex: 0 0 180px; }
  .case-pane { min-width: 0; }.case-head { align-items: flex-start; flex-direction: column; }.case-head > div:last-child { flex-wrap: wrap; }
  .annotation-panel { padding: 0 12px; }.grade-options { grid-template-columns: 1fr; }.accuracy { margin: 12px 16px 0; }.accuracy-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.accuracy-grid > div:nth-child(odd) { border-left: 0; }.accuracy-grid > div:nth-child(n+3) { border-top: 1px solid #eeeae3; }
  .editor-shell { grid-template-columns: 1fr; }.file-rail { border-right: 0; border-bottom: 1px solid #dcd9d1; }.file-rail .rail-section:first-child { display: none; }.rail-list.is-scrollable { display: flex; max-height: none; overflow-x: auto; }.rail-list.is-scrollable li { flex: 0 0 150px; }.document-editor { min-height: 260px; }
  .trace-toolbar { align-items: flex-start; flex-direction: column; padding: 10px 16px; }.view-tabs { width: 100%; }.toolbar-tools { width: 100%; margin-left: 0; }.search-field { width: 100%; }.trace-workspace { display: block; }.graph-pane { display: none; }.detail-pane { border-top: 0; }.sequence-section { display: block !important; }.sequence-head { display: grid; min-height: auto; gap: 4px; padding: 14px 16px; }.sequence-button { min-height: 66px; grid-template-columns: 30px minmax(0,1fr) auto; gap: 8px; padding: 8px 16px; }.sequence-index { font-size: 11px; }.sequence-type, .sequence-parent, .sequence-time, .sequence-action { display: none; }.sequence-state { grid-column: 3; grid-row: 1; }.mobile-summary { display: grid; gap: 8px; padding: 14px 16px; border-top: 1px solid #dcd9d1; }.mobile-summary h2 { color: #30363b; font-size: 13px; }.mobile-summary p { color: #5e6872; font-size: 12px; line-height: 1.5; }.mobile-summary dl { display: grid; gap: 5px; }.mobile-summary dl div { display: grid; grid-template-columns: 64px minmax(0,1fr); gap: 8px; font-size: 11px; }.mobile-summary dt { color: #737a82; }.mobile-summary dd { overflow-wrap: anywhere; color: #5e6872; }
}
@media (prefers-reduced-motion: reduce) { .sm-sidebar { transition-duration: 0ms; } }
`;

export default GATE7_CSS
