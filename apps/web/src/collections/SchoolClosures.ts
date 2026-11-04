import type { CollectionConfig } from 'payload'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { validateDay } from '../lib/day-field'
import { revalidateResults } from '../hooks/revalidate'

/** One school closure (smog, rain, security...) for the "schools closed tomorrow" tracker. Needs a source. */
export const SchoolClosures: CollectionConfig = {
  slug: 'school-closures',
  admin: { useAsTitle: 'scope', group: 'Results', defaultColumns: ['scope', 'region', 'date', 'endDate', 'status', 'updatedAt'], description: 'Schools closed tomorrow tracker. Needs a source.' },
  access: { read: publicRead, create: botCanCreateUpdateNotDelete, update: botCanCreateUpdateNotDelete, delete: adminOnlyDelete },
  hooks: { afterChange: [revalidateResults] },
  fields: [
    { name: 'region', type: 'select', required: true, options: ['punjab', 'sindh', 'kp', 'balochistan', 'islamabad'].map((v) => ({ label: v, value: v })) },
    { name: 'scope', type: 'text', required: true, admin: { description: 'Who is closed, e.g. "All schools in Lahore division"' } },
    { name: 'date', type: 'text', required: true, admin: { description: 'First closed day, YYYY-MM-DD' }, validate: (v: unknown) => (typeof v === 'string' && v ? validateDay(v) : 'Required') },
    { name: 'endDate', type: 'text', admin: { description: 'Last closed day if more than one day, YYYY-MM-DD' }, validate: validateDay },
    { name: 'reason', type: 'select', required: true, defaultValue: 'smog', options: ['smog', 'rain', 'weather', 'security', 'other'].map((v) => ({ label: v, value: v })) },
    { name: 'status', type: 'select', required: true, defaultValue: 'announced', options: [{ label: 'Announced', value: 'announced' }, { label: 'Extended', value: 'extended' }, { label: 'Cancelled / reopened', value: 'cancelled' }] },
    {
      name: 'sourceUrl',
      type: 'text',
      validate: (_: unknown, o: { siblingData?: { sourceUrl?: string; sourceNote?: string } }) => (o.siblingData?.sourceUrl || o.siblingData?.sourceNote ? true : 'A closure needs a source: add a source link or a source note'),
    },
    { name: 'sourceNote', type: 'text' },
    { name: 'notes', type: 'textarea' },
  ],
}
