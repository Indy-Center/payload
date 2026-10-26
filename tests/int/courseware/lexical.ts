import type { LessonPlan } from '@/payload-types'

/** Lexical's serialized nodes, as Payload's editor saves them, for lesson plan bodies. */

export type Body = NonNullable<LessonPlan['body']>

export const node = { direction: 'ltr' as const, format: '' as const, indent: 0, version: 1 }

export function state(children: unknown[]): Body {
  return { root: { ...node, type: 'root', children: children as Body['root']['children'] } }
}

/** `format` is Lexical's bit mask: 1 bold, 2 italic, 4 strikethrough, 8 underline, 16 code, … */
export function text(value: string, format = 0) {
  return { type: 'text', text: value, detail: 0, format, mode: 'normal', style: '', version: 1 }
}

export function paragraph(children: unknown[], format: '' | 'center' | 'end' | 'justify' = '') {
  return { ...node, type: 'paragraph', format, textFormat: 0, textStyle: '', children }
}

export function heading(tag: 'h1' | 'h2' | 'h3' | 'h4', value: string) {
  return { ...node, type: 'heading', tag, children: [text(value)] }
}

export function list(
  listType: 'bullet' | 'number' | 'check',
  items: unknown[][],
  checked?: boolean[],
) {
  return {
    ...node,
    type: 'list',
    listType,
    start: 1,
    tag: listType === 'number' ? 'ol' : 'ul',
    children: items.map((children, index) => ({
      ...node,
      type: 'listitem',
      value: index + 1,
      ...(checked ? { checked: checked[index] } : {}),
      children,
    })),
  }
}

export function link(id: string, fields: Record<string, unknown>, value: string) {
  return { ...node, type: 'link', version: 3, id, fields, children: [text(value)] }
}

export function cell(
  value: string,
  headerState: number,
  span: { colSpan?: number; rowSpan?: number } = {},
) {
  return {
    ...node,
    type: 'tablecell',
    headerState,
    colSpan: span.colSpan ?? 1,
    rowSpan: span.rowSpan ?? 1,
    backgroundColor: null,
    children: [paragraph([text(value)])],
  }
}

export function row(cells: unknown[]) {
  return { ...node, type: 'tablerow', children: cells }
}

export function inline(id: string, blockType: string, fields: Record<string, unknown>) {
  return { type: 'inlineBlock', version: 1, fields: { id, blockType, ...fields } }
}

export function block(id: string, blockType: string, fields: Record<string, unknown>) {
  return {
    type: 'block',
    format: '' as const,
    version: 2,
    fields: { id, blockName: '', blockType, ...fields },
  }
}
