export const MANAGEMENT_PAGES_CSS: string = `
.management-page { padding: 0; background: #fffefa; }
.management-form-guard { display: block; min-width: 0; margin: 0; padding: 0; border: 0; }
.management-page h1 { font-size: 20px; font-weight: 650; }
.management-page .gate-page-head p { padding-top: 5px; font-size: 12px; color: #737a82; }
.management-page .sm-button { min-height: 32px; white-space: nowrap; }
.management-workspace { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: 600px; }
.management-directory { border-right: 1px solid #dcd9d1; background: #faf9f6; }
.management-directory-tools { display: grid; gap: 10px; padding: 16px; border-bottom: 1px solid #dcd9d1; }
.management-directory-row { width: 100%; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 5px 8px; padding: 15px 16px; border: 0; border-bottom: 1px solid #e9e6df; background: transparent; text-align: left; color: #30363b; cursor: pointer; }
.management-directory-row strong { grid-column: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.management-directory-row small { grid-column: 1; color: #737a82; font-size: 11px; }
.management-directory-row .gate-status { grid-column: 2; grid-row: 1 / 3; align-self: center; }
.management-directory-row.selected { background: #e7effb; box-shadow: inset 3px 0 #2267c7; }
.management-content { min-width: 0; }
.management-section { border-bottom: 1px solid #dcd9d1; }
.management-section-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 18px 24px 14px; border-bottom: 1px solid #eeeae3; }
.management-section-head h2 { font-size: 15px; font-weight: 650; }
.management-section-head p { margin-top: 5px; color: #737a82; font-size: 11px; line-height: 1.6; }
.management-form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px 24px; padding: 20px 24px; }
.management-field { display: grid; gap: 6px; min-width: 0; color: #5e6872; font-size: 12px; }
.management-field.wide { grid-column: 1 / -1; }
.management-page input:not([type=checkbox]), .management-page select, .management-page textarea { min-width: 0; min-height: 34px; border: 1px solid #dcd9d1; border-radius: 4px; background: #fff; color: #30363b; font-family:inherit; font-size:12px; line-height:1.5; padding: 6px 9px; }
.management-page textarea { resize: vertical; }
.management-page input:focus-visible, .management-page select:focus-visible, .management-page textarea:focus-visible, .management-page button:focus-visible, .management-page summary:focus-visible { outline: 2px solid #2267c7; outline-offset: 2px; }
.management-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.management-actions > span { color: #737a82; font-size: 11px; }
.management-error { display: flex; align-items: flex-start; gap: 12px; }
.management-error > span { flex: 1; white-space: pre-wrap; overflow-wrap: anywhere; }
.management-empty { padding: 18px 24px; color: #737a82; font-size: 12px; line-height: 1.6; }
.management-skill-list { padding: 0 24px; }
.management-skill-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(130px,1fr); gap: 16px; padding: 13px 0; border-bottom: 1px solid #eeeae3; }
.management-skill-row strong, .management-skill-row small { display: block; }
.management-skill-row strong { color: #30363b; font-size: 12px; }
.management-skill-row small { color: #899199; font: 10px ui-monospace, monospace; padding-top: 5px; }
.management-page summary { cursor: pointer; font-size: 12px; color: #5e6872; }
.management-page pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; color: #5e6872; background: #f7f6f2; padding: 10px; margin-top: 8px; }
.management-sample { padding: 16px 24px; border-bottom: 1px solid #eeeae3; }
.management-sample summary span { margin-left: 16px; color: #737a82; }
.management-sample p, .management-sample > small { display: block; margin: 10px 0; font-size: 11px; color: #737a82; }
.management-table-scroll { overflow: auto; }
.management-page table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
.management-page th, .management-page td { padding: 11px 16px; border-bottom: 1px solid #e9e6df; vertical-align: top; overflow-wrap: anywhere; }
.management-page th { color: #737a82; font-size: 11px; font-weight: 500; background: #faf9f6; }
.management-page td small { display: block; color: #899199; font: 10px ui-monospace, monospace; margin-top: 5px; }
.management-rule-tabs { display: flex; flex-wrap: wrap; padding: 12px 24px; gap: 8px; }
.management-rule-tabs button { display: flex; gap: 8px; align-items: center; padding: 6px 9px; border: 1px solid #dcd9d1; border-radius: 4px; background: transparent; cursor: pointer; font-size: 12px; }
.management-rule-tabs button[aria-pressed=true] { border-color: #2267c7; background: #e7effb; }
.management-rule-editor { padding-bottom: 20px; }
.management-rule-editor > .management-actions { padding: 16px 24px 0; }
.management-layout { margin: 8px 24px 20px; padding: 0; border: 1px solid #dcd9d1; }
.management-layout legend { margin-left: 14px; padding: 0 6px; color: #737a82; font: 11px ui-monospace, monospace; }
.management-layout .management-form-grid { padding: 14px; }
.management-layout select { width: 100%; }
.management-diff { padding: 8px 24px; }
.management-diff > div { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; }
.management-diff h3 { font-size: 12px; }
.management-regression { margin: 0 24px 20px; padding: 14px; border: 1px solid #dcd9d1; background: #faf9f6; }
.management-regression h3 { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.management-regression > div { display: flex; flex-wrap: wrap; gap: 16px; padding-top: 12px; font-size: 11px; color: #5e6872; }
.management-health-ledger > div { display: grid; grid-template-columns: 130px 110px minmax(0,1fr); gap: 18px; align-items: center; padding: 14px 24px; border-bottom: 1px solid #eeeae3; }
.management-health-ledger strong { font-size: 12px; font-weight: 500; }
.management-health-ledger .gate-status { justify-self: start; }
.management-health-ledger > div > span:last-child { color: #737a82; font-size: 11px; overflow-wrap: anywhere; }
.management-settings-columns { display: grid; grid-template-columns: 1fr 1fr; }
.management-settings-columns > section:first-child { border-right: 1px solid #dcd9d1; }
.management-settings-form { display: grid; gap: 16px; padding: 20px 24px; }
.management-settings-form > p { color: #737a82; font-size: 11px; line-height: 1.7; }
.management-settings-form .management-field { max-width: 230px; }
.management-facts > div { display: grid; grid-template-columns: 75px minmax(0,1fr); gap: 16px; padding: 8px 0; font-size: 12px; }
.management-facts dt { color: #737a82; }.management-facts dd { margin: 0; overflow-wrap: anywhere; }
.management-audit-filters { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 16px; padding: 20px 24px; align-items: end; }
@media (max-width: 1050px) { .management-workspace { grid-template-columns: 210px minmax(0,1fr); }.management-section-head { align-items: flex-start; flex-wrap: wrap; }.management-settings-columns { grid-template-columns: 1fr; }.management-settings-columns > section:first-child { border-right: 0; } }
@media (max-width: 760px) { .management-workspace { grid-template-columns: 1fr; }.management-directory { max-height: 230px; overflow: auto; border-right: 0; border-bottom: 1px solid #dcd9d1; }.management-form-grid, .management-audit-filters { grid-template-columns: 1fr; }.management-health-ledger > div { grid-template-columns: 1fr auto; }.management-health-ledger > div > span:last-child { grid-column: 1 / -1; }.management-skill-row, .management-diff > div { grid-template-columns: 1fr; } }
`
