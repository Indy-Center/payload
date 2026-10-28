import { ValidationError, type PayloadRequest } from 'payload'
import { idOf } from './ids'

/** Whether a minimum is a point on a scale of this many points: a whole number from 1 up. */
export function inScale(position: number | null | undefined, points: number): boolean {
  return position != null && Number.isInteger(position) && position >= 1 && position <= points
}

/**
 * A lesson plan's minimum and an edition's default minimum are points on the edition's grading
 * scale (decision 0028, asked again on ticket 09), checked whenever either is saved, published or
 * not. Refuses against the field named by `path`. An edition with no scale yet has nothing to check
 * against: the publishing check still requires a scale and then checks every minimum.
 */
export async function refuseMinimumOffScale(
  req: PayloadRequest,
  path: 'minimum' | 'defaultMinimum',
  minimum: number | null | undefined,
  gradingScale: string | { id: string } | null | undefined,
): Promise<void> {
  const scaleId = idOf(gradingScale)
  if (minimum == null || !scaleId) return
  const scale = await req.payload.findByID({
    collection: 'grading-scales',
    id: scaleId,
    depth: 0,
    req,
  })
  const points = scale.points.length
  if (inScale(minimum, points)) return
  throw new ValidationError({
    errors: [
      {
        path,
        message: `${minimum} is not a point on ${scale.name}, which has ${points} points. Choose 1 to ${points}.`,
      },
    ],
  })
}
