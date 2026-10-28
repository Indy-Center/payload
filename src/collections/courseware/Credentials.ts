import type { CollectionConfig, NumberFieldValidation, SelectFieldValidation } from 'payload'
import { number, select } from 'payload/shared'
import { staffAccess } from '@/courseware/access'
import { hideRetiredUnlessAsked } from '@/courseware/retired'

/** The VATSIM controller ratings that can bring a certification with them on arrival. */
export const ARRIVAL_RATINGS = ['S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3'] as const

type Siblings = Record<string, unknown> | undefined
const isEndorsement = (siblingData: unknown) => (siblingData as Siblings)?.kind === 'endorsement'

export const rank: NumberFieldValidation = async (value, options) => {
  const valid = number(value, options)
  if (valid !== true) return valid
  const hasRank = value !== null && value !== undefined
  if (isEndorsement(options.siblingData))
    return hasRank ? 'Only a certification has a rank. Clear it for an endorsement.' : true
  if (!hasRank) {
    // Until a kind is chosen, the kind's own "required" is the fault to show.
    return (options.siblingData as Siblings)?.kind === 'certification'
      ? 'A certification needs a rank. Give it its place on the ladder.'
      : true
  }

  // The admin form runs validators in the browser, where there is no database to ask; the
  // server checks again on save.
  if (!options.req?.payload) return true
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

export const grantedOnArrival: SelectFieldValidation = async (value, options) => {
  const valid = select(value, options)
  if (valid !== true) return valid
  const ratings = (value ?? []) as string[]
  if (ratings.length === 0) return true
  if (isEndorsement(options.siblingData))
    return 'Only a certification is granted on arrival. Clear the ratings for an endorsement.'

  // Each VATSIM rating brings one certification, so training-tools can map it back. The browser
  // has no database to ask; the server checks again on save.
  if (!options.req?.payload) return true
  const { docs } = await options.req.payload.find({
    collection: 'credentials',
    where: {
      and: [
        { grantedOnArrival: { in: ratings } },
        ...(options.id ? [{ id: { not_equals: options.id } }] : []),
      ],
    },
    sort: 'code',
    pagination: false,
    depth: 0,
    req: options.req,
  })
  const clashes = ratings.flatMap((rating) => {
    const holder = docs.find((other) =>
      (other.grantedOnArrival as string[] | null)?.includes(rating),
    )
    return holder
      ? [
          `${holder.code} is already granted on arrival for ${rating}. Each rating brings one certification.`,
        ]
      : []
  })
  return clashes.length === 0 ? true : clashes.join(' ')
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
    // Kept from the Courses list's Credentials tab, not the nav (ticket 22). Its pages still open
    // by link; `hidden` would take them away too.
    group: false,
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
              'Certifications only, and each needs one: its place on the ladder, higher above lower. No two share one.',
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
