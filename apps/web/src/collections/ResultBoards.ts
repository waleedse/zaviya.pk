import type { CollectionConfig } from 'payload'
import { publicRead, botCanCreateUpdateNotDelete, adminOnlyDelete } from '../access'
import { validateDay } from '../lib/day-field'
import { revalidateResults } from '../hooks/revalidate'
import { RESULT_BOARDS } from '../lib/result-boards'

/** One document per education board: the links and how-to-check details. Dates live in `result-exams`. */
export const ResultBoards: CollectionConfig = {
  slug: 'result-boards',
  admin: { useAsTitle: 'name', group: 'Results', defaultColumns: ['name', 'region', 'officialSite', 'updatedAt'], description: 'Boards shown at /results. Dates go in "Result exams".' },
  access: { read: publicRead, create: botCanCreateUpdateNotDelete, update: botCanCreateUpdateNotDelete, delete: adminOnlyDelete },
  hooks: { afterChange: [revalidateResults] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { description: 'URL: /results/<slug>. Do not change once live.' } },
    {
      name: 'region',
      type: 'select',
      required: true,
      options: ['federal', 'punjab', 'sindh', 'kp', 'balochistan', 'ajk'].map((v) => ({ label: v, value: v })),
    },
    { name: 'city', type: 'text' },
    { name: 'officialSite', type: 'text', admin: { description: "The board's own website. Only a link you opened and checked." } },
    { name: 'resultUrl', type: 'text', admin: { description: "The board's own result-checking page, if it has one separate from the home page." } },
    { name: 'smsCode', type: 'text', admin: { description: 'Short code the board publishes for result by SMS, e.g. 800291. Leave empty if the board publishes none.' } },
    { name: 'smsHowTo', type: 'textarea', admin: { description: 'e.g. "Type the roll number and send it to 800291."' } },
    { name: 'gazetteUrl', type: 'text', admin: { description: 'Link to the latest gazette / position-holder list on the board site.' } },
    { name: 'notes', type: 'textarea', admin: { description: 'Anything readers need to know about this board (shown on its page).' } },
    {
      name: 'faqs',
      type: 'array',
      admin: { description: 'Extra questions for this board. Standard ones are added automatically.' },
      fields: [
        { name: 'q', type: 'text', required: true },
        { name: 'a', type: 'textarea', required: true },
      ],
    },
    { name: 'checkedAt', type: 'text', admin: { description: 'YYYY-MM-DD the board site was last checked' }, validate: validateDay },
  ],
}

export const RESULT_BOARD_SLUGS = RESULT_BOARDS.map((b) => b.slug)
