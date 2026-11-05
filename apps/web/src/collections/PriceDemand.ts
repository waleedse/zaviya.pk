import type { CollectionConfig } from 'payload'
import { APPLIANCE_CATEGORIES } from '@zaviya/shared'
import { adminOnlyDelete, botCanCreateUpdateNotDelete, isStaffOrBot } from '../access'

/**
 * Price searches people in Pakistan make ("honda cd 70 price", "atta 20 kg price lahore"), 6 Nov 2026.
 * The research agent refreshes the list every month (POST /api/pipeline/prices/demand). The daily hot-score job
 * matches each search to the items we list: matched searches lift those items ("Trending prices", compare pages),
 * unmatched ones are the to-do list of sources to add (GET /api/pipeline/prices/coverage). docs/PRICE-ENGINE.md
 */
export const PriceDemand: CollectionConfig = {
  slug: 'price-demand',
  labels: { singular: 'Price search', plural: 'Price searches' },
  admin: {
    useAsTitle: 'query',
    group: 'Prices',
    defaultColumns: ['query', 'priority', 'category', 'matched', 'updatedAt'],
    listSearchableFields: ['query'],
  },
  access: {
    read: isStaffOrBot,
    create: botCanCreateUpdateNotDelete,
    update: botCanCreateUpdateNotDelete,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'query', type: 'text', required: true, unique: true, index: true },
    { name: 'category', type: 'text', admin: { description: `One of: ${APPLIANCE_CATEGORIES.map((c) => c.slug).join(', ')}` } },
    { name: 'priority', type: 'number', required: true, defaultValue: 50, min: 1, max: 100, index: true },
    { name: 'origin', type: 'text', defaultValue: 'research' },
    { name: 'sourceHint', type: 'text', admin: { description: 'Official site that could give this price' } },
    { name: 'note', type: 'text' },
    { name: 'matched', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'How many listed items match this search (0 = not covered yet)' } },
    { name: 'matchedSlugs', type: 'text', admin: { readOnly: true } },
  ],
}
