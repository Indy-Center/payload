import type { Payload } from 'payload'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  TOKEN as LIBRARY_TOKEN,
  callEndpoint,
  resetCourseware,
  testPayload,
} from '../courseware/helpers'
import { type ResourceRow, saveResources } from './helpers'

const TOKEN = 'test-training-token'
process.env.TRAINING_API_TOKEN = TOKEN

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(() => resetCourseware(payload))

// One test unsets the token.
afterEach(() => {
  process.env.TRAINING_API_TOKEN = TOKEN
})

const read = (token: string | null = TOKEN) =>
  callEndpoint(payload, '/training/resources', { token })

const save = (resources: ResourceRow[]) => saveResources(payload, resources)

describe('GET /api/training/resources', () => {
  it('refuses a missing or wrong token', async () => {
    for (const token of [null, 'wrong', LIBRARY_TOKEN]) {
      expect(await read(token)).toEqual({ status: 401, body: { error: 'Unauthorized' } })
    }
  })

  it('refuses everyone while no token is configured', async () => {
    delete process.env.TRAINING_API_TOKEN

    expect(await read(TOKEN)).toEqual({ status: 401, body: { error: 'Unauthorized' } })
    expect(await read('')).toEqual({ status: 401, body: { error: 'Unauthorized' } })
  })

  it('returns no resources before any are saved', async () => {
    expect(await read()).toEqual({ status: 200, body: { resources: [] } })
  })

  it("returns the resources in the Training Admin's order", async () => {
    await save([
      { title: 'Example handbook', url: 'https://example.com/handbook' },
      { title: 'Example form', url: 'https://example.com/form', newTab: false },
    ])

    expect(await read()).toEqual({
      status: 200,
      body: {
        resources: [
          {
            title: 'Example handbook',
            description: null,
            url: 'https://example.com/handbook',
            newTab: true,
            icon: 'link-variant',
          },
          {
            title: 'Example form',
            description: null,
            url: 'https://example.com/form',
            newTab: false,
            icon: 'link-variant',
          },
        ],
      },
    })
  })

  it("returns each resource's description and icon", async () => {
    await save([
      {
        title: 'Example handbook',
        description: 'Read before your first session.\nAsk if anything is unclear.',
        url: 'https://example.com/handbook',
        icon: 'book-open-variant',
      },
    ])

    const { body } = await read()

    expect(body.resources).toEqual([
      {
        title: 'Example handbook',
        description: 'Read before your first session.\nAsk if anything is unclear.',
        url: 'https://example.com/handbook',
        newTab: true,
        icon: 'book-open-variant',
      },
    ])
  })

  it('returns a cleared or blank description as none', async () => {
    const row = { title: 'Example form', url: 'https://example.com/form' }
    await save([
      { ...row, description: '' },
      { ...row, description: '  \n ' },
    ])

    const { body } = await read()

    expect(body.resources.map((r: { description: unknown }) => r.description)).toEqual([null, null])
  })

  it('leaves out a removed resource', async () => {
    await save([
      { title: 'Example handbook', url: 'https://example.com/handbook' },
      { title: 'Example form', url: 'https://example.com/form' },
    ])
    await save([{ title: 'Example form', url: 'https://example.com/form' }])

    const { body } = await read()

    expect(body.resources.map((row: { title: string }) => row.title)).toEqual(['Example form'])
  })
})
