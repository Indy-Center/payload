import type { CollectionConfig, NumberFieldValidation, SelectFieldValidation } from 'payload'
import { number, select } from 'payload/shared'
import { staffAccess } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'

/** The VATSIM controller ratings that can bring a certification with them on arrival. */
export const ARRIVAL_RATINGS = ['S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3'] as const

type Siblings = Record<string, unknown> | undefined
const isEndorsement = (siblingData: unknown) => (siblingData as Siblings)?.kind === 'endorsement'

const rank: NumberFieldValidation = async (value, options) => {
  const valid = number(value, options)
  if (valid !== true) return valid
  if (value === null || value === undefined) return true
  if (isEndorsement(options.siblingData))
    return 'Only a certification has a rank. Clear it for an endorsement.'

  const { docs } = await options.req.payload.find({
    collection: 'credentials',
    where: {
      and: [
        { kind: { equals: 'certification' } },
        { rank: { equals: value } },
        ...(options.id ? [{ id: { not_equals: options.id } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    pagination: false,
    req: options.req,
  })
  return docs.length === 0
    ? true
    : `${docs[0].code} already has rank ${value}. Each certification has its own rank.`
}

const grantedOnArrival: SelectFieldValidation = (value, options) => {
  const valid = select(value, options)
  if (valid !== true) return valid
  if (isEndorsement(options.siblingData) && ((value ?? []) as string[]).length > 0)
    return 'Only a certification is granted on arrival. Clear the ratings for an endorsement.'
  return true
}

/**
 * A certification or endorsement Indy issues, such as the S-GC certification or the T2-CTR
 * endorsement (decision 0054). Copied from training-tools so it can later read the list from here.
 * What a credential needs before enrolling lives on the course that issues it, not here.
 *
 * Kept by the Training Admin and leads; every account may read it. Like all courseware it is never
 * deleted: a credential leaves use by being retired, so records that name it still resolve.
 */
export const Credentials: CollectionConfig = {
  slug: 'credentials',
  admin: {
    useAsTitle: 'code',
    defaultColumns: ['code', 'name', 'kind', 'rank', 'retired'],
    group: 'Training',
    baseFilter: hideRetiredUnlessAsked,
  },
  access: staffAccess,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'code',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          admin: { description: 'Such as S-GC or T2-CTR.' },
        },
        {
          name: 'kind',
          type: 'select',
          required: true,
          options: [
            { label: 'Certification', value: 'certification' },
            { label: 'Endorsement', value: 'endorsement' },
          ],
        },
      ],
    },
    { name: 'name', type: 'text', required: true, admin: { description: 'Without the code.' } },
    { name: 'description', type: 'textarea' },
    {
      type: 'row',
      fields: [
        {
          name: 'rank',
          type: 'number',
          min: 1,
          unique: true,
          validate: rank,
          admin: {
            description:
              'Certifications only: its place on the ladder, higher above lower. No two share one.',
          },
        },
        {
          name: 'grantedOnArrival',
          label: 'Granted on arrival for',
          type: 'select',
          hasMany: true,
          options: [...ARRIVAL_RATINGS],
          validate: grantedOnArrival,
          admin: {
            description:
              'Certifications only: the VATSIM ratings that bring this certification with them.',
          },
        },
      ],
    },
    {
      name: 'retired',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Retired credentials stay where they are named but are no longer issued.',
      },
    },
  ],
}
