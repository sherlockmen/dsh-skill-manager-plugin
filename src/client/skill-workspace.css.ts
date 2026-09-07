/** Layout values retained from the approved Gate 7 candidate-review surface. */
export const SKILL_WORKSPACE_CSS: string = `
.sm-app .review-section { margin:16px 24px 0; border-top:1px solid #dcd9d1; border-bottom:1px solid #dcd9d1; background:#fff; }
.sm-app .review-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #eeeae3; }
.sm-app .review-head h2 { font-size:15px; }
.sm-app .review-head small { color:#737a82; }
.sm-app .review-row { display:grid; min-width:0; grid-template-columns:minmax(140px,.8fr) minmax(160px,1fr) minmax(160px,1fr) auto; gap:16px; align-items:center; padding:14px 16px; }
.sm-app .review-row + .review-row { border-top:1px solid #eeeae3; }
.sm-app .review-row strong { font-size:13px; overflow-wrap:anywhere; }
.sm-app .review-row p { font-size:12px; color:#737a82; line-height:1.5; }
.sm-app .diff-block { min-width:0; padding:10px; background:#f8f7f4; }
.sm-app .diff-block.before { background:#fcf2f1; }
.sm-app .diff-block.after { background:#f0f8f3; }
.sm-app .diff-block pre { max-height:240px; font-size:12px; background:transparent; border:0; }
.sm-app .review-section > .gate-editor-actions { justify-content:flex-end; padding:12px 16px; border-top:1px solid #eeeae3; }
.sm-app .source-editor { padding:24px 0; display:flex; flex-direction:column; align-items:flex-start; gap:16px; }
.sm-app .source-editor h2 { font-size:16px; }
.sm-app .source-editor label { width:100%; }
.sm-app .source-editor p { color:#737a82; font-size:12px; line-height:1.6; }
.sm-app .document-preview { min-height:330px; max-height:none; margin:0; border:0; background:transparent; padding:16px 0; font-size:14px; line-height:1.7; }
.sm-app .source-tree { max-height:320px; overflow:auto; }
.sm-app .source-tree ul { list-style:none; margin:0; padding:0; }
.sm-app .source-tree ul ul { margin-left:16px; border-left:1px solid var(--sm-line); padding-left:4px; }
.sm-app .source-tree .file-button { min-width:0; }
.sm-app .native-file-view { --native-gap:16px; --native-tight:8px; padding:24px 0; font-size:13px; line-height:1.6; min-width:0; }
.sm-app .native-view-heading { margin-bottom:24px; }
.sm-app .native-view-heading h2 { margin:0 0 8px; font-size:16px; font-weight:600; }
.sm-app .native-view-heading p, .sm-app .native-field-hint { color:var(--sm-muted); font-size:12px; line-height:1.6; margin:8px 0; }
.sm-app .native-field-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--native-gap); }
.sm-app .native-file-view label { display:flex; flex-direction:column; gap:var(--native-tight); min-width:0; font-size:12px; font-weight:500; }
.sm-app .native-file-view label small { font-size:12px; font-weight:400; color:var(--sm-muted); }
.sm-app .native-file-view input { width:100%; min-width:0; height:36px; font-size:13px; }
.sm-app .native-file-view input[readonly] { color:var(--sm-muted); background:var(--sm-paper); }
.sm-app .native-field-wide { grid-column:1/-1; }
.sm-app .native-list-field { margin-top:24px; padding-top:16px; border-top:1px solid var(--sm-line); }
.sm-app .native-list-field > header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
.sm-app .native-list-field h3, .sm-app .native-node-fields h3, .sm-app .native-branches h3 { margin:0; font-size:13px; font-weight:600; }
.sm-app .native-list-field h3 code { display:block; font-size:12px; color:var(--sm-muted); font-weight:400; background:transparent; }
.sm-app .native-list-item { display:flex; align-items:center; gap:8px; margin-top:8px; }
.sm-app .native-list-item input { flex:1; }
.sm-app .native-file-notice { padding:16px 0; border-bottom:1px solid var(--sm-line); font-size:12px; line-height:1.6; color:var(--sm-muted); }
.sm-app .native-file-notice p { margin:0 0 8px; overflow-wrap:anywhere; }
.sm-app .native-file-notice button { max-width:100%; white-space:normal; }
.sm-app .native-file-error { color:var(--sm-red); margin-top:16px; font-size:12px; }
.sm-app .native-root-field { max-width:320px; margin-bottom:24px; }
.sm-app .native-tree-workspace { display:grid; grid-template-columns:minmax(136px,.65fr) minmax(0,1.35fr); border-top:1px solid var(--sm-line); }
.sm-app .native-tree-outline { padding:16px 16px 16px 0; border-right:1px solid var(--sm-line); min-width:0; }
.sm-app .native-tree-outline ul { padding:0; margin:0; list-style:none; }
.sm-app .native-tree-outline li { padding-left:calc(var(--native-depth,0) * 8px); }
.sm-app .native-tree-outline .file-button { display:flex; gap:8px; align-items:flex-start; padding:8px; font-size:12px; overflow-wrap:anywhere; }
.sm-app .native-tree-outline .file-button small { display:block; font-size:11px; color:var(--sm-muted); font-weight:400; margin-top:4px; }
.sm-app .native-node-fields { padding:16px 0 16px 16px; min-width:0; }
.sm-app .native-node-fields > h3 { margin-bottom:16px; overflow-wrap:anywhere; }
.sm-app .native-node-fields .native-field-grid { grid-template-columns:1fr; }
.sm-app .native-branches { margin-top:24px; }
.sm-app .native-branch { border-top:1px solid var(--sm-line); padding-top:16px; margin-top:16px; }
.sm-app .native-branch h4 { font-size:12px; font-weight:500; color:var(--sm-muted); margin:0 0 16px; }
.sm-app .markdown-preview { font-size:16px; line-height:1.75; overflow-wrap:anywhere; white-space:normal; }
.sm-app .markdown-preview h1 { font-size:24px; line-height:1.35; margin:8px 0 24px; }
.sm-app .markdown-preview h2 { font-size:20px; line-height:1.4; margin:24px 0 16px; }
.sm-app .markdown-preview h3, .sm-app .markdown-preview h4, .sm-app .markdown-preview h5, .sm-app .markdown-preview h6 { font-size:16px; line-height:1.5; margin:24px 0 8px; }
.sm-app .markdown-preview p { margin:8px 0; }
.sm-app .markdown-preview ul, .sm-app .markdown-preview ol { padding-left:24px; margin:8px 0 16px; }
.sm-app .markdown-preview li { margin:4px 0; }
.sm-app .markdown-preview code { font-size:.875em; background:var(--sm-paper); padding:0 4px; }
.sm-app .markdown-preview pre { padding:16px; font-size:13px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
.sm-app .markdown-preview pre code { padding:0; background:transparent; }
@media(max-width:760px) { .sm-app .native-field-grid, .sm-app .native-tree-workspace { grid-template-columns:1fr; } .sm-app .native-tree-outline { border-right:0; border-bottom:1px solid var(--sm-line); max-height:240px; overflow:auto; padding-right:0; } .sm-app .native-node-fields { padding-left:0; } }
.sm-app .sm-list-tools { display:flex; justify-content:space-between; gap:16px; padding:12px 24px; border-bottom:1px solid #eeeae3; }
.sm-app .sm-list-tools > input { min-width:220px; }
.sm-app .sm-master-row { grid-template-columns:32px minmax(0,1fr) auto; }
.sm-app .attention-item, .sm-app .release-item { width:100%; background:transparent; border-left:0; border-right:0; border-top:0; text-align:left; cursor:pointer; font:inherit; }
.sm-app .attention-item:hover, .sm-app .release-item:hover { background:#f6f8fa; }
.sm-app .gate-notice:has(>button) { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.sm-app .gate-notice > div { flex:1; }
.sm-app .gate-notice.error { border-left-color:#bd3e3e; background:#fcf0ef; }
.sm-app .validation-grid .validation-item strong { white-space:normal; overflow-wrap:anywhere; }
@media(max-width:1120px) { .sm-app .review-row { grid-template-columns:minmax(100px,.6fr) minmax(140px,1fr) minmax(140px,1fr); } .sm-app .review-row > button { grid-column:1/-1; justify-self:end; } }
@media(max-width:860px) { .sm-app .review-row { grid-template-columns:1fr; } .sm-app .trace-page .trace-workspace { grid-template-columns:1fr; } .sm-app .trace-list-pane { max-height:280px; overflow:auto; } .sm-app .gate-page-head { flex-wrap:wrap; } }
`
