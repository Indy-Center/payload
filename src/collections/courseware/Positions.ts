import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { hideRetiredUnlessAsked } from '@/courseware/retired'
import type { Position } from '@/payload-types'

/**
 * The short name a position is shown and found by: vNAS's own (`FLM 83`), or null. Everything that
 * shows or searches a short name reads it here.
 */
export const servedShortName = (position: Pick<Position, 'shortName'>): string | null =>
  position.shortName || null

/** "FLM 83 · Falmouth 83", or "ZID_TMU · ZID TMU" where there is no short name. */
export const positionTitle = (position: Pick<Position, 'shortName' | 'callsign' | 'name'>) =>
  `${servedShortName(position) ?? position.callsign} · ${position.name}`

const setTitle: CollectionBeforeChangeHook<Position> = ({ data, originalDoc }) => ({
  ...data,
  title: positionTitle({ ...originalDoc, ...data } as Position),
})

const fromVnas = { readOnly: true }

/**
 * ZID's positions, copied from vNAS Data Admin by the sync (`src/positions/`) once a day and when
 * a CMS admin presses "Sync from vNAS" (decision 0060). What vNAS supplies is shown, never edited:
 * a fix goes to Data Admin, where every vNAS user gets it. A position vNAS drops is retired, never
 * deleted, so records that name it still read.
 *
 * Every CMS account reads them; nobody creates, edits or deletes one by hand. The sync writes
 * below access.
 */
export const Positions: CollectionConfig = {
  slug: 'positions',
  defaultSort: 'callsign',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'callsign', 'radioName', 'frequency', 'facilityName', 'retired'],
    listSearchableFields: ['title', 'callsign', 'name', 'shortName'],
    group: 'Training',
    baseFilter: hideRetiredUnlessAsked,
    description: 'Copied from vNAS Data Admin each day. Fix a position in Data Admin, then sync.',
    components: {
      beforeListTable: ['/components/admin/positions/SyncPositionsButton#SyncPositionsButton'],
    },
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: { beforeChange: [setTitle] },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
      admin: { hidden: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'callsign',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          admin: { ...fromVnas, description: 'Such as IND_83_CTR.' },
        },
        { name: 'name', type: 'text', required: true, admin: { ...fromVnas } },
        {
          name: 'shortName',
          label: 'Short name',
          type: 'text',
          admin: { ...fromVnas, description: 'vNAS’s own, where it has one: FLM 83.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'radioName',
          label: 'Radio name',
          type: 'text',
          required: true,
          admin: { ...fromVnas },
        },
        {
          name: 'frequency',
          type: 'number',
          required: true,
          min: 1,
          admin: {
            ...fromVnas,
            description: 'In MHz.',
            components: {
              Field: '/components/admin/positions/Frequency#FrequencyField',
              Cell: '/components/admin/positions/Frequency#FrequencyCell',
            },
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'facilityId',
          label: 'Facility id',
          type: 'text',
          required: true,
          admin: { ...fromVnas, description: 'Such as SDF.' },
        },
        {
          name: 'facilityName',
          label: 'Facility',
          type: 'text',
          required: true,
          admin: { ...fromVnas },
        },
      ],
    },
    {
      name: 'vnasId',
      label: 'vNAS id',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { ...fromVnas, position: 'sidebar' },
    },
    {
      name: 'starred',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        ...fromVnas,
        position: 'sidebar',
        description: 'One of its facility’s main positions.',
      },
    },
    {
      name: 'retired',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        ...fromVnas,
        position: 'sidebar',
        description:
          'vNAS no longer lists it. The sync sets this, and clears it if vNAS restores it.',
      },
    },
  ],
}
