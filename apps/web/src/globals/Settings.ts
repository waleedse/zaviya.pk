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
        { name: 'start', type: 'text', defaultValue: '00:00' },
        { name: 'end', type: 'text', defaultValue: '24:00' },
      ],
    },
    { name: 'minIntervalMin', type: 'number', defaultValue: 20 },
    {
      name: 'activeModels',
      type: 'group',
      fields: [
        { name: 'triage', type: 'text', defaultValue: 'ollama:qwen3:8b' },
        { name: 'write_en', type: 'text', defaultValue: 'gemini:gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview' },
        { name: 'write_ur', type: 'text', defaultValue: 'gemini:gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview' },
        { name: 'qa', type: 'text', defaultValue: 'ollama:qwen3:8b' },
        { name: 'embed', type: 'text', defaultValue: 'ollama:nomic-embed-text' },
      ],
    },
    { name: 'killSwitch', type: 'checkbox', defaultValue: false },
    { name: 'lastHeartbeat', type: 'date' },
    { name: 'lastHeartbeatMeta', type: 'json' },
  ],
}
