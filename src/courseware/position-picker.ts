import { validations, type PayloadRequest, type RelationshipFieldSingleValidation } from 'payload'
import { positionTitle, shownShortName } from '@/collections/courseware/Positions'
import type { Position } from '@/payload-types'
import { idOf } from './ids'

/** A position as the scenario pickers offer it: "FLM 83 · Falmouth 83". */
export type PositionOption = { id: string; label: string }

export type PositionOptions = {
  /** The positions a search matches, by callsign. */
  options: PositionOption[]
  /** The position already chosen, labelled whatever the search, or null. */
  selected: PositionOption | null
}

export type PositionOptionsQuery = {
  /** Words of a short name, name or callsign, in any case: "flm 83", "falmouth", "IND_83". */
  search?: string
  /** The position already chosen in the form, to label. */
  current?: string
  /** The scenario being edited: the retired position it names in `slot` is still offered. */
  scenario?: string
  /** The picker's field, `studentPosition` or `teacherPosition`. */
  slot?: string
}

/** The two places a scenario names a position. */
export const POSITION_SLOTS = ['studentPosition', 'teacherPosition'] as const
export type PositionSlot = (typeof POSITION_SLOTS)[number]
const isSlot = (value: unknown): value is PositionSlot =>
  (POSITION_SLOTS as readonly unknown[]).includes(value)

type Shown = Pick<Position, 'id' | 'callsign' | 'name' | 'shortName' | 'retired'>

const optionOf = (position: Shown): PositionOption => ({
  id: position.id,
  label: positionTitle(position),
})

/**
 * The position a stored scenario names in this slot, or null. A position vNAS has since dropped
 * stays on the scenario that names it (decision 0060), but only in the slot that names it: it is
 * offered and saved there even when retired, and refused in the other.
 */
async function namedIn(
  req: PayloadRequest,
  scenarioId: string | number | undefined,
  slot: string | undefined,
): Promise<string | null> {
  if (!scenarioId || !isSlot(slot)) return null
  const stored = await req.payload.findByID({
    collection: 'scenarios',
    id: String(scenarioId),
    depth: 0,
    select: { studentPosition: true, teacherPosition: true },
    disableErrors: true,
    req,
  })
  return idOf(stored?.[slot])
}

/**
 * The options of a scenario's position pickers. Payload's own picker searches one stored field
 * and labels by it; these search the short name, name and callsign and label by short name and
 * name. Retired positions are left out, except the one the scenario already names in this slot.
 */
export async function loadPositionOptions(
  req: PayloadRequest,
  { search = '', current, scenario, slot }: PositionOptionsQuery = {},
): Promise<PositionOptions> {
  const [named, { docs }] = await Promise.all([
    namedIn(req, scenario, slot),
    req.payload.find({
      collection: 'positions',
      sort: 'callsign',
      pagination: false,
      depth: 0,
      select: { callsign: true, name: true, shortName: true, retired: true },
      overrideAccess: false,
      user: req.user,
      req,
    }),
  ])
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (position: Shown) => {
    const text = [shownShortName(position), position.name, position.callsign]
      .join(' ')
      .toLowerCase()
    return words.every((word) => text.includes(word))
  }
  const options = docs
    .filter((position) => !position.retired || position.id === named)
    .filter(matches)
    .map(optionOf)
  const chosen = current ? docs.find((position) => position.id === current) : undefined
  return { options, selected: chosen ? optionOf(chosen) : null }
}

export const RETIRED_POSITION = 'This position is retired. Pick one vNAS still lists.'

/**
 * A scenario's student or teacher position: a position in the list, not retired unless the stored
 * scenario already names it in this same slot. Then Payload's own checks (required).
 */
export const pickedPosition =
  (slot: PositionSlot): RelationshipFieldSingleValidation =>
  async (value, options) => {
    const id = idOf(value as string | { id: string } | null | undefined)
    if (id) {
      const { req } = options
      const found = await req.payload.find({
        collection: 'positions',
        where: { id: { equals: id } },
        select: { retired: true },
        depth: 0,
        limit: 1,
        pagination: false,
        req,
      })
      const picked = found.docs[0]
      if (!picked) return req.t('validation:invalidSelection')
      if (picked.retired && (await namedIn(req, options.id, slot)) !== id) return RETIRED_POSITION
    }
    return validations.relationship(value, options)
  }

/** `admin.components` for a scenario's position: the picker, `PositionPicker`. */
export const positionPickerComponents = () => ({
  Field: '/components/admin/positions/PositionPicker#PositionPicker',
})
