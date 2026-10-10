import type { GlobalConfig } from 'payload'
import { isAdmin, isAdminOrBot } from '../access'

export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Settings',
  admin: {
    group: 'System',
  },
  access: {
    read: isAdminOrBot,
    update: isAdmin,
  },
  fields: [
    {
      name: 'thresholds',
      type: 'group',
      fields: [
        { name: 'publish', type: 'number', defaultValue: 0.72, required: true },
        { name: 'review', type: 'number', defaultValue: 0.5, required: true },
      ],
    },
    {
      name: 'dailyCaps',
      type: 'group',
      fields: [
        { name: 'facebook', type: 'number', defaultValue: 15 },
        { name: 'instagram', type: 'number', defaultValue: 8 },
        { name: 'x', type: 'number', defaultValue: 12 },
      ],
    },
    {
      name: 'publishWindow',
      type: 'group',
      fields: [
        { name: 'start', type: 'text', defaultValue: '08:00' },
        { name: 'end', type: 'text', defaultValue: '00:00' },
      ],
    },
    { name: 'minIntervalMin', type: 'number', defaultValue: 45 },
    {
      name: 'activeModels',
      type: 'group',
      fields: [
        { name: 'triage', type: 'text', defaultValue: 'ollama:qwen3:4b' },
        { name: 'write_en', type: 'text', defaultValue: 'ollama:qwen3:8b' },
        { name: 'write_ur', type: 'text', defaultValue: 'ollama:qalb:8b-q4' },
        { name: 'qa', type: 'text', defaultValue: 'ollama:qwen3:4b' },
        { name: 'embed', type: 'text', defaultValue: 'ollama:nomic-embed-text' },
      ],
    },
    { name: 'killSwitch', type: 'checkbox', defaultValue: false },
    { name: 'lastHeartbeat', type: 'date' },
    { name: 'lastHeartbeatMeta', type: 'json' },
  ],
}
