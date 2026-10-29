import {
  ValidationError,
  type Condition,
  type Field,
  type FieldAffectingData,
  type FieldHook,
  type GroupField,
  type TabAsField,
} from 'payload'
import { mayActAs, type RoleHolder } from '@/cms-admin'

/**
 * Indy's facts on a position (decision 0060): what Indy knows about a position that vNAS doesn't
 * say. Each is a group field, made by `indyFact`, holding two values of one shape:
 *
 * - `generated`: worked out by the sync from vNAS's data on every run. Read-only in the admin;
 *   nobody writes it but the sync, which writes below access.
 * - `override`: optional, set by a CMS admin. The sync never writes it.
 *
 * The value served is the override if it is set, otherwise the generated value: `servedFact`.
 * The admin shows the two side by side, so a CMS admin sees when the rule has moved on, and
 * clearing the override falls back to the generated value.
 *
 * A new fact is a new `indyFact` field on Positions, its rule in the sync, and a migration.
 */
export type IndyFact<T> = { generated?: T | null; override?: T | null } | null | undefined

/** Only the CMS admin edits an override. */
export const mayOverride = ({ req }: { req: { user?: unknown } }) =>
  mayActAs(req.user as RoleHolder)

/** Any field that holds data, less its name: the shape of a fact's two values. */
type DataField = Exclude<FieldAffectingData, TabAsField>
type ValueField = DataField extends infer F
  ? F extends DataField
    ? Omit<F, 'name'>
    : never
  : never

/** Whether a value counts as set: an empty text or list is as good as none. */
export const isSet = (value: unknown): boolean =>
  value != null &&
  !(typeof value === 'string' && value.trim() === '') &&
  !(Array.isArray(value) && value.length === 0)

/** The fact's value served: the override if set, else the generated value, else null. */
export function servedFact<T>(fact: IndyFact<T>): T | null {
  if (isSet(fact?.override)) return fact!.override!
  return isSet(fact?.generated) ? fact!.generated! : null
}

/**
 * An override saved blank is saved as none, so clearing it falls back. A list is none when empty:
 * Payload's database layer fails on a null in place of a list.
 */
const blankIsNone =
  (none: [] | null): FieldHook =>
  ({ value }) =>
    isSet(value) ? value : none

export function indyFact(options: {
  name: string
  label: string
  /** What the fact is and the rule that generates it. */
  description: string
  /** The field each value is: a text field, an array of rows. */
  value: ValueField
  /**
   * Why an override can't be saved on this position, or null. Run on every save, as a hook: Payload
   * skips a field's validation where its `condition` hides it, and an API call can still send it.
   */
  refuseOverride?: (args: {
    value: unknown
    previousValue: unknown
    position: Record<string, unknown>
  }) => string | null
  /** The override's field where it differs from the generated one: same shape, other checks. */
  overrideValue?: ValueField
  /** Shown only where this holds, as a field's `admin.condition`. */
  condition?: Condition
}): GroupField {
  const { value, refuseOverride } = options
  const overrideValue = options.overrideValue ?? value
  const refuse: FieldHook = ({ value, previousValue, data, originalDoc, collection, req }) => {
    const message = refuseOverride?.({
      value,
      previousValue,
      position: { ...originalDoc, ...data },
    })
    if (message)
      throw new ValidationError({
        collection: collection?.slug,
        errors: [{ path: `${options.name}.override`, message }],
        req,
      })
    return value
  }
  return {
    name: options.name,
    label: options.label,
    type: 'group',
    admin: { description: options.description, condition: options.condition },
    fields: [
      {
        type: 'row',
        fields: [
          {
            ...value,
            name: 'generated',
            label: 'Generated',
            access: { create: () => false, update: () => false },
            admin: {
              ...value.admin,
              readOnly: true,
              description: 'Worked out by each sync from vNAS.',
            },
          } as Field,
          {
            ...overrideValue,
            name: 'override',
            label: 'Override',
            access: { create: mayOverride, update: mayOverride },
            hooks: {
              ...overrideValue.hooks,
              beforeValidate: [blankIsNone(overrideValue.type === 'array' ? [] : null)],
              beforeChange: [refuse],
            },
            admin: {
              ...overrideValue.admin,
              description: 'Set by a CMS admin. Clear it to use the generated value.',
            },
          } as Field,
        ],
      },
    ],
  }
}
