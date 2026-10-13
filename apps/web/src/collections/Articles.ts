import type { CollectionConfig } from 'payload'
import { CATEGORY_SLUGS, PRIORITIES } from '@zaviya/shared'
import {
  publishedArticleRead,
  botCanCreateUpdateNotDelete,
  adminOnlyDelete,
  adminOnlyFieldRead,
} from '../access'
import {
  articleAfterChangeHooks,
  articleReadingTime,
  articleSlugUnique,
  keepHeroImage,
} from '../hooks/articles'

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    group: 'Newsroom',
    defaultColumns: ['title', 'category', 'workflow', '_status', 'publishedAt'],
    listSearchableFields: ['title'],
  },
  versions: {
    drafts: true,
  },
  access: {
    read: publishedArticleRead,
    create: botCanCreateUpdateNotDelete,
    update: botCanCreateUpdateNotDelete,
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeValidate: [articleSlugUnique, articleReadingTime],
    beforeChange: [keepHeroImage],
    afterChange: articleAfterChangeHooks,
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    {
      name: 'titleVariants',
      type: 'array',
      localized: true,
      fields: [{ name: 'variant', type: 'text' }],
    },
    { name: 'slug', type: 'text', required: true, localized: true, index: true },
    { name: 'dek', type: 'textarea', localized: true },
    {
      name: 'keyPoints',
      type: 'array',
      localized: true,
      fields: [{ name: 'point', type: 'text' }],
    },
    { name: 'body', type: 'richText', localized: true },
    { name: 'whatItMeans', type: 'richText', localized: true },
    {
      name: 'faqs',
      type: 'array',
      localized: true,
      fields: [
        { name: 'q', type: 'text', required: true },
        { name: 'a', type: 'textarea', required: true },
      ],
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      filterOptions: {
        slug: { in: CATEGORY_SLUGS },
      },
    },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'author', type: 'relationship', relationTo: 'authors' },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    {
      name: 'sources',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
        { name: 'tier', type: 'number', required: true, min: 1, max: 3 },
        { name: 'publishedAt', type: 'date' },
      ],
    },
    {
      name: 'embeds',
      type: 'array',
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          options: [
            { label: 'X', value: 'x' },
            { label: 'Instagram', value: 'instagram' },
            { label: 'YouTube', value: 'youtube' },
          ],
        },
        { name: 'url', type: 'text', required: true },
      ],
    },
    { name: 'storyCluster', type: 'relationship', relationTo: 'story-clusters' },
    { name: 'isLive', type: 'checkbox', defaultValue: false },
    {
      name: 'updates',
      type: 'array',
      fields: [
        { name: 'at', type: 'date', required: true },
        {
          name: 'text',
          type: 'group',
          fields: [
            { name: 'en', type: 'textarea' },
            { name: 'ur', type: 'textarea' },
          ],
        },
      ],
    },
    { name: 'isBreaking', type: 'checkbox', defaultValue: false },
    {
      name: 'priority',
      type: 'select',
      defaultValue: 'normal',
      options: PRIORITIES.map((p) => ({ label: p, value: p })),
    },
    {
      name: 'workflow',
      type: 'select',
      defaultValue: 'draft',
      options: ['draft', 'in_review', 'approved', 'published', 'retracted'].map((v) => ({
        label: v,
        value: v,
      })),
    },
    { name: 'publishedAt', type: 'date', index: true },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'metaTitle', type: 'text', localized: true },
        { name: 'metaDescription', type: 'textarea', localized: true },
        { name: 'ogImage', type: 'upload', relationTo: 'media' },
        { name: 'canonical', type: 'text', localized: true },
        { name: 'noindex', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'ai',
      type: 'group',
      access: {
        read: adminOnlyFieldRead,
        update: adminOnlyFieldRead,
      },
      fields: [
        { name: 'model', type: 'text' },
        { name: 'promptVersion', type: 'text' },
        { name: 'triageScore', type: 'number' },
        { name: 'qaScore', type: 'number' },
        { name: 'originality', type: 'number' },
        { name: 'generatedAt', type: 'date' },
        { name: 'tokens', type: 'number' },
      ],
    },
    {
      name: 'corrections',
      type: 'array',
      fields: [
        { name: 'at', type: 'date', required: true },
        { name: 'note', type: 'textarea', required: true, localized: true },
      ],
    },
    { name: 'readingTime', type: 'number', admin: { readOnly: true } },
  ],
}
