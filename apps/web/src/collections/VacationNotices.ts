import type { CollectionConfig } from 'payload'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { validateDay } from '../lib/day-field'
import { revalidateResults } from '../hooks/revalidate'

type Sibling = { status?: string; sourceUrl?: string; sourceNote?: string }

/** Winter vacation 2026-27 for one province / Islamabad. Dates only from a notification or a named report. */
export const VacationNotices: CollectionConfig = {
  slug: 'vacation-notices',
  admin: { useAsTitle: 'region', group: 'Results', defaultColumns: ['region', 'status', 'startDate', 'endDate', 'updatedAt'], description: 'Winter vacations 2026-27. A date needs a source.' },
  access: { read: publicRead, create: botCanCreateUpdateNotDelete, update: botCanCreateUpdateNotDelete, delete: adminOnlyDelete },
  hooks: { afterChange: [revalidateResults] },
  fields: [
    { name: 'region', type: 'select', required: true, unique: true, options: ['punjab', 'sindh', 'kp', 'balochistan', 'islamabad'].map((v) => ({ label: v, value: v })) },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'not_announced',
      options: [
        { label: 'Not announced yet', value: 'not_announced' },
        { label: 'Reported (not yet notified)', value: 'reported' },
        { label: 'Officially notified', value: 'notified' },
      ],
    },
    { name: 'startDate', type: 'text', admin: { description: 'First day of the break, YYYY-MM-DD' }, validate: validateDay },
    { name: 'endDate', type: 'text', admin: { description: 'Last day of the break, YYYY-MM-DD' }, validate: validateDay },
    {
      name: 'sourceUrl',
      type: 'text',
      validate: (_: unknown, o: { siblingData?: Sibling & { startDate?: string; endDate?: string } }) => {
        const d = o.siblingData
        const needs = Boolean(d?.startDate || d?.endDate || (d?.status && d.status !== 'not_announced'))
        return !needs || d?.sourceUrl || d?.sourceNote ? true : 'A date or status needs a source: add a source link or a source note'
      },
    },
    { name: 'sourceNote', type: 'text', admin: { description: 'e.g. "School Education Department notification, 4 Dec 2026"' } },
    { name: 'sourceDate', type: 'text', admin: { description: 'YYYY-MM-DD the source was published' }, validate: validateDay },
    {
      name: 'lastYear',
      type: 'group',
      admin: { description: 'Last winter break (2025-26), shown clearly marked as last year' },
      fields: [
        { name: 'startDate', type: 'text', validate: validateDay },
        { name: 'endDate', type: 'text', validate: validateDay },
        { name: 'note', type: 'textarea' },
        { name: 'sourceUrl', type: 'text' },
      ],
    },
    { name: 'notes', type: 'textarea', admin: { description: 'Extra detail shown on the page (private schools, board classes, exceptions)' } },
  ],
}
