import type { CollectionConfig } from 'payload'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { validateDay } from '../lib/day-field'
import { revalidateResults } from '../hooks/revalidate'

type Sibling = { status?: string; sourceUrl?: string; sourceNote?: string }

/**
 * One document per board + class + session + year. Rule: a date is never entered without a source.
 * With status "Not announced yet" the page shows exactly that and no date.
 */
export const ResultExams: CollectionConfig = {
  slug: 'result-exams',
  admin: { useAsTitle: 'label', group: 'Results', defaultColumns: ['board', 'classLevel', 'session', 'year', 'status', 'updatedAt'], description: 'Result dates. A date needs a source link or a source note.' },
  access: { read: publicRead, create: botCanCreateUpdateNotDelete, update: botCanCreateUpdateNotDelete, delete: adminOnlyDelete },
  hooks: {
    afterChange: [revalidateResults],
    beforeValidate: [
      ({ data }) => {
        if (data) data.label = `${data.classLevel ?? ''}-${data.session ?? ''}-${data.year ?? ''}`
        return data
      },
    ],
  },
  fields: [
    { name: 'label', type: 'text', admin: { hidden: true } },
    { name: 'board', type: 'relationship', relationTo: 'result-boards', required: true, index: true },
    { name: 'classLevel', type: 'select', required: true, options: ['9', '10', '11', '12'].map((v) => ({ label: `Class ${v}`, value: v })) },
    { name: 'session', type: 'select', required: true, defaultValue: 'annual', options: [{ label: 'Annual', value: 'annual' }, { label: 'Supplementary', value: 'supplementary' }] },
    { name: 'year', type: 'number', required: true, min: 2020, max: 2100 },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'not_announced',
      options: [
        { label: 'Not announced yet', value: 'not_announced' },
        { label: 'Date expected (sourced)', value: 'expected' },
        { label: 'Result announced', value: 'announced' },
      ],
    },
    { name: 'expectedDate', type: 'text', admin: { description: 'YYYY-MM-DD, only from a source' }, validate: (v: unknown, o: { siblingData?: Sibling }) => (validateDay(v) === true ? (v && o.siblingData?.status === 'not_announced' ? 'Status is "Not announced yet": clear the date or change the status' : true) : validateDay(v)) },
    { name: 'announcedDate', type: 'text', admin: { description: 'YYYY-MM-DD the result came out' }, validate: validateDay },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: { description: 'Link to the board notice or the news report the date comes from' },
      validate: (_: unknown, o: { siblingData?: Sibling & { expectedDate?: string; announcedDate?: string } }) => {
        const d = o.siblingData
        const hasDate = Boolean(d?.expectedDate || d?.announcedDate || (d?.status && d.status !== 'not_announced'))
        return !hasDate || d?.sourceUrl || d?.sourceNote ? true : 'A date or status needs a source: add a source link or a source note'
      },
    },
    { name: 'sourceNote', type: 'text', admin: { description: 'e.g. "BISE Multan notice dated 2 Sep 2026"' } },
    { name: 'resultLink', type: 'text', admin: { description: 'Direct link to this result on the board site' } },
    { name: 'gazetteUrl', type: 'text', admin: { description: 'Gazette / position holders PDF' } },
    { name: 'positionHolders', type: 'textarea', admin: { description: 'One per line: "1. Name, school, marks". Only from the gazette or board notice.' } },
    { name: 'passPercentage', type: 'text', admin: { description: 'e.g. "78.4%". Only from the board.' } },
    { name: 'notes', type: 'textarea' },
    { name: 'checkedAt', type: 'text', admin: { description: 'YYYY-MM-DD last checked on the board site' }, validate: validateDay },
  ],
}
