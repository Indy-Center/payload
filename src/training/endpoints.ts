import type { Endpoint, PayloadRequest } from 'payload'
import { hasBearerToken, unauthorized } from '@/bearer-token'
import type { TeacherResourcesDocument } from './document'

/**
 * The teacher resources. Only the Training Admin may read the Global, so this reads past access and
 * decides itself what training-tools gets.
 */
export async function buildTeacherResourcesDocument(
  req: PayloadRequest,
): Promise<TeacherResourcesDocument> {
  const global = await req.payload.findGlobal({
    slug: 'teacher-resources',
    depth: 0,
    overrideAccess: true,
    req,
  })
  return {
    resources: (global.resources ?? []).map(({ title, description, url, newTab, icon }) => ({
      title,
      description: description?.trim() ? description : null,
      url,
      // A checkbox may be stored empty; empty means its default, on.
      newTab: newTab ?? true,
      icon,
    })),
  }
}

export const trainingEndpoints: Endpoint[] = [
  {
    path: '/training/resources',
    method: 'get',
    handler: async (req) => {
      if (!hasBearerToken(req, process.env.TRAINING_API_TOKEN)) return unauthorized()
      return Response.json(await buildTeacherResourcesDocument(req))
    },
  },
]
