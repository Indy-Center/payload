import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'
import { testPayload } from './helpers'

const FORM_GUARD = '/components/admin/LeaveGuard#FormLeaveGuard'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

describe('the leave guard in the config', () => {
  it("is in every collection's document form", () => {
    const missing = payload.config.collections
      .filter(
        (collection) =>
          !collection.admin.components?.edit?.beforeDocumentControls?.includes(FORM_GUARD),
      )
      .map((collection) => collection.slug)

    // Payload's own internal collections have no admin screen of their own to guard.
    expect(missing.filter((slug) => !slug.startsWith('payload-'))).toEqual([])
  })

  it("is in every global's document form", () => {
    const missing = payload.config.globals
      .filter(
        (global) =>
          !global.admin.components?.elements?.beforeDocumentControls?.includes(FORM_GUARD),
      )
      .map((global) => global.slug)

    expect(missing.filter((slug) => !slug.startsWith('payload-'))).toEqual([])
  })

  it("keeps a collection's own document slot", () => {
    const tasks = payload.config.collections.find((collection) => collection.slug === 'tasks')!

    expect(tasks.admin.components?.edit?.beforeDocumentControls).toEqual([
      '/components/admin/TaskTitle#TaskTitle',
      FORM_GUARD,
    ])
  })
})
