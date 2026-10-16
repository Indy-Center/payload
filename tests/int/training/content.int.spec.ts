import type { Payload } from 'payload'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetCourseware, testPayload } from '../courseware/helpers'
import { invalid } from '../partners/helpers'
import { type ResourceRow, saveResources } from './helpers'

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

beforeEach(() => resetCourseware(payload))

const save = (resources: ResourceRow[]) => saveResources(payload, resources)

describe('a teacher resource', () => {
  it('opens in a new tab unless told not to', async () => {
    const saved = await save([
      { title: 'Example handbook', url: 'https://example.com/handbook' },
      { title: 'Example form', url: 'https://example.com/form', newTab: false },
    ])

    expect(saved.resources?.map((row) => row.newTab)).toEqual([true, false])
  })

  it('needs a title and an https address', async () => {
    for (const url of ['http://example.com', 'javascript:alert(1)', 'example.com', '']) {
      expect(await invalid(save([{ title: 'Example handbook', url }]))).toEqual([
        'Enter a web address starting with https://.',
      ])
    }
    expect(await invalid(save([{ title: '', url: 'https://example.com' }]))).toEqual([
      'This field is required.',
    ])
  })

  it('takes only an icon from the list', async () => {
    const row = { title: 'Example handbook', url: 'https://example.com/handbook' }

    const saved = await save([{ ...row, icon: 'discord' }])
    expect(saved.resources?.map((r) => r.icon)).toEqual(['discord'])

    for (const icon of ['rocket-launch', '']) {
      expect(await invalid(save([{ ...row, icon: icon as ResourceRow['icon'] }])), icon).toEqual([
        'This field has an invalid selection.',
      ])
    }
  })
})
