import type { Endpoint, PayloadRequest } from 'payload'

/**
 * A public read at `/api/public/v1/<name>`: anyone may GET it, with no sign-in and no token
 * (decision 0005). Every route under `/api/public/` goes through this, so they all answer alike.
 *
 * What `build` returns is a contract with apps we don't deploy, so `T` is a type written for the
 * route, never a `payload-types` type: a renamed field in a collection must not change it.
 * Adding a field is fine; callers ignore fields they don't know. Removing, renaming or retyping a
 * field, changing its units or meaning, or changing which rows are included needs a `/v2/` route,
 * with v1 still served. Order is not part of the contract.
 *
 * Only GET is registered, so any other method gets Payload's own 404. CORS stays off.
 */
export function publicRead<T>(
  name: string,
  build: (req: PayloadRequest) => Promise<T>,
  { maxAge }: { maxAge: number },
): Endpoint {
  return {
    path: `/public/v1/${name}`,
    method: 'get',
    handler: async (req) => {
      let body: T
      try {
        body = await build(req)
      } catch (error) {
        // Never a stale copy and never the error's own text: keeping a last good copy is the
        // caller's job, and the log is where the cause goes.
        req.payload.logger.error(
          { err: error },
          `Public read /api/public/v1/${name} could not be built.`,
        )
        return Response.json(
          { errors: [{ message: `Could not build ${name}.` }] },
          {
            status: 500,
            headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
          },
        )
      }
      return Response.json(body, {
        headers: {
          'Cache-Control': `public, max-age=${maxAge}`,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    },
  }
}
