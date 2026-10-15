import type { GlobalConfig } from 'payload'
import { isAdminOrBot } from '../access'
import { revalidateHome, revalidatePathSafe } from '../lib/revalidate'
import { parsePlan } from '../lib/front-page'

/**
 * The editor's homepage plan (see lib/front-page.ts for the shape). The editor agent owns it;
 * an admin can override it here.
 */
export const FrontPage: GlobalConfig = {
  slug: 'front-page',
  label: 'Front page',
  admin: {
    group: 'Newsroom',
    description:
      'Set by the editor: {"lead":{"id":123,"until":"2026-10-16T18:00:00Z"},"seconds":[{"id":124}],"pins":{"pakistan":[{"id":125}]},"hidden":[99],"order":["pakistan","money","namaz","world-cricket","tech-ai","jobs","stories","more"]}. Empty slots fill themselves with the newest stories.',
  },
  access: {
    read: isAdminOrBot,
    update: isAdminOrBot,
  },
  fields: [
    { name: 'plan', type: 'json' },
    { name: 'note', type: 'textarea', admin: { description: 'Why the editor arranged the page this way (one or two lines).' } },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && 'plan' in data) data.plan = parsePlan(data.plan)
        return data
      },
    ],
    afterChange: [
      async () => {
        await revalidateHome()
        await revalidatePathSafe('/')
        await revalidatePathSafe('/ur')
      },
    ],
  },
}
