import { apply } from './index.js'

;(window as unknown as Record<string, unknown>).__SKILL_MANAGER_PREVIEW__ = true
const root = document.getElementById('skill-manager-root') || document.body
root.id = 'skill-manager-root'
apply({})
