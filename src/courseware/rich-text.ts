import type { Block, Field, PopulateType, TextFieldSingleValidation } from 'payload'
import {
  BlocksFeature,
  EXPERIMENTAL_TableFeature,
  HeadingFeature,
  lexicalEditor,
  LinkFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'

/**
 * The editor lesson plan bodies are written in, and what the course-version document fills into
 * them. Its blocks are `@indy-center/svelte`'s, whose `RichText` draws the body: each block's
 * fields are its component's props, written here by hand from design-system's documents 02
 * (decision 0011 for citations). The library's type test catches drift.
 */

/** The collection a citation's source is a record of. */
export const SOURCES = 'references'

/**
 * What a linked record carries in the course-version document: only the fields the page draws.
 * Server-side reads skip access checks, so without this a link could carry a whole record to the
 * browser. Payload selects by collection, so a source's attached file carries the media fields.
 */
export const BODY_POPULATE = {
  'lesson-plans': { code: true, title: true },
  // Payload makes `url` from `filename`, so a file's url needs its name.
  media: { url: true, filename: true, alt: true, width: true, height: true, sizes: true },
  [SOURCES]: { name: true, edition: true, url: true, document: true },
} satisfies PopulateType

/** Deep enough to fill in a citation's source and the file attached to it. */
export const BODY_DEPTH = 2

const CONTROLLER_RATINGS = [
  'INAC',
  'SUS',
  'OBS',
  'S1',
  'S2',
  'S3',
  'C1',
  'C2',
  'C3',
  'I1',
  'I2',
  'I3',
  'SUP',
  'ADM',
]
const PILOT_RATINGS = ['NEW', 'PPL', 'IR', 'CMEL', 'ATPL', 'FI', 'FE']

const focusable: Field = {
  name: 'focusable',
  type: 'checkbox',
  admin: { description: 'Reachable with the keyboard, for its tooltip.' },
}

const airportGroup = (required: boolean): Field => ({
  name: 'airport',
  type: 'group',
  fields: [
    { name: 'code', type: 'text', required, admin: { description: 'Such as KIND.' } },
    { name: 'name', type: 'text' },
  ],
})

type Sibling = Record<string, unknown> | undefined

/** One of `value` and `callsign`, never both: either can be left empty for the other. */
const oneOf =
  (other: string): TextFieldSingleValidation =>
  (value, { siblingData }) => {
    const otherValue = (siblingData as Sibling)?.[other]
    if (value && otherValue) return 'Give a frequency or a callsign, not both.'
    if (!value && !otherValue) return 'Give a frequency or a callsign.'
    return true
  }

/**
 * An either-or field hides once the other is given, unless it has a value itself: Payload skips
 * validating a hidden field, so both stay shown, and refused, when both are given.
 */
const shownBeside = (siblingData: Sibling, field: string, other: string) =>
  !siblingData?.[other] || Boolean(siblingData?.[field])

/** A daily Zulu time of day, as four digits: `"2300"`. */
const zuluTime: TextFieldSingleValidation = (value) =>
  !value || /^([01]\d|2[0-3])[0-5]\d$/.test(value) || 'A time is four digits, such as 2300.'

const position: Block = {
  slug: 'position',
  fields: [
    { name: 'callsign', type: 'text', required: true, admin: { description: 'Such as IND_CTR.' } },
    {
      name: 'show',
      type: 'select',
      hasMany: true,
      options: ['shortName', 'airport', 'radioName', 'name', 'frequency'],
    },
    { name: 'airportAt', type: 'select', options: ['right', 'under'] },
    airportGroup(false),
  ],
}

const frequency: Block = {
  slug: 'frequency',
  fields: [
    {
      name: 'value',
      type: 'text',
      admin: {
        description: 'Megahertz as written, such as 128.225.',
        condition: (_, siblingData) => shownBeside(siblingData, 'value', 'callsign'),
      },
      validate: oneOf('callsign'),
    },
    {
      name: 'callsign',
      type: 'text',
      admin: {
        description: 'Or a position’s callsign, to show its frequency.',
        condition: (_, siblingData) => shownBeside(siblingData, 'callsign', 'value'),
      },
      validate: oneOf('value'),
    },
  ],
}

const airport: Block = {
  slug: 'airport',
  fields: [
    airportGroup(true),
    { name: 'nameAt', type: 'select', options: ['inline', 'tooltip'] },
    focusable,
  ],
}

const rating: Block = {
  slug: 'rating',
  fields: [
    {
      name: 'kind',
      type: 'select',
      options: ['controller', 'pilot'],
      admin: { description: 'A controller’s rating unless chosen.' },
    },
    {
      name: 'rating',
      type: 'select',
      required: true,
      options: [...CONTROLLER_RATINGS, ...PILOT_RATINGS],
      filterOptions: ({ options, siblingData }) => {
        const codes =
          (siblingData as Sibling)?.kind === 'pilot' ? PILOT_RATINGS : CONTROLLER_RATINGS
        return options.filter((option) =>
          codes.includes(typeof option === 'string' ? option : option.value),
        )
      },
      validate: (value: string | null | undefined, { siblingData }: { siblingData: unknown }) => {
        if (!value) return 'Choose a rating.'
        const pilot = (siblingData as Sibling)?.kind === 'pilot'
        const codes = pilot ? PILOT_RATINGS : CONTROLLER_RATINGS
        return (
          codes.includes(value) || `${value} is not a ${pilot ? 'pilot' : 'controller'} rating.`
        )
      },
    },
    focusable,
  ],
}

const flightCategory: Block = {
  slug: 'flightCategory',
  fields: [
    { name: 'category', type: 'select', required: true, options: ['VFR', 'MVFR', 'IFR', 'LIFR'] },
    focusable,
  ],
}

const time: Block = {
  slug: 'time',
  fields: [
    {
      name: 'value',
      type: 'text',
      required: true,
      admin: { description: 'Zulu, four digits: 2300.' },
      validate: zuluTime,
    },
    {
      name: 'end',
      type: 'text',
      admin: { description: 'Optional. Before the start, it is the next day.' },
      validate: zuluTime,
    },
  ],
}

const citation: Block = {
  slug: 'citation',
  fields: [
    { name: 'source', type: 'relationship', relationTo: SOURCES, required: true },
    {
      name: 'at',
      type: 'text',
      required: true,
      admin: { description: 'Where in the source, as it numbers itself: 3-7-2, Chapter 4.' },
    },
  ],
}

const inlineBlocks = [position, frequency, airport, rating, flightCategory, time, citation]

/**
 * Lexical's defaults with relationship and indent off, headings `h2`–`h4` (the page has the
 * `h1`), internal links to lesson plans only, uploads from public media only, and tables.
 */
function features(blocks: Block[]) {
  return lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures.filter(
        (feature) => !['relationship', 'indent', 'heading', 'link', 'upload'].includes(feature.key),
      ),
      HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
      LinkFeature({ enabledCollections: ['lesson-plans'] }),
      // Images go to the public media store, where the library can show them.
      UploadFeature({ enabledCollections: ['media'] }),
      EXPERIMENTAL_TableFeature(),
      BlocksFeature({ blocks, inlineBlocks }),
    ],
  })
}

/** A callout's or disclosure's content: the body's features, with inline blocks only. */
const nestedEditor = features([])

const callout: Block = {
  slug: 'callout',
  fields: [
    {
      name: 'level',
      type: 'select',
      required: true,
      options: ['info', 'caution', 'danger', 'reference'],
    },
    { name: 'label', type: 'text' },
    { name: 'content', type: 'richText', required: true, editor: nestedEditor },
  ],
}

const disclosure: Block = {
  slug: 'disclosure',
  fields: [
    { name: 'summary', type: 'text', required: true },
    { name: 'content', type: 'richText', required: true, editor: nestedEditor },
  ],
}

/** A lesson plan's body. */
export const lessonPlanBodyEditor = features([callout, disclosure])
