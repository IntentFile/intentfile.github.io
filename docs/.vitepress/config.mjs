import { defineConfig } from 'vitepress'

// Vite plugin: pre-process .md files to escape angle-bracket patterns that Vue
// would misparse as HTML/component tags (e.g. <Entity>, <name>, <TABLE>_LANG).
const KNOWN_HTML = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl',
  'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input',
  'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta',
  'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p',
  'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'section',
  'select', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time',
  'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
])

function escapeLineNonHtml(line) {
  const parts = line.split('`')
  return parts
    .map((part, idx) => {
      if (idx % 2 !== 0) return part // inside a backtick span -> leave alone
      return part.replace(
        /<\/?([A-Za-z][A-Za-z0-9_.-]*)(\s[^>]*)?>|<([A-Za-z][A-Za-z0-9_.-]*)>/g,
        (match, tag1, _attrs, tag2) => {
          const tag = (tag1 || tag2 || '').toLowerCase()
          if (KNOWN_HTML.has(tag)) return match
          return match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        },
      )
    })
    .join('`')
}

function escapeMdAngleBrackets() {
  return {
    name: 'escape-md-angle-brackets',
    transform(code, id) {
      if (!id.endsWith('.md')) return
      const lines = code.split('\n')
      let inFence = false
      const out = []
      for (const line of lines) {
        if (/^```/.test(line)) {
          inFence = !inFence
          out.push(line)
          continue
        }
        out.push(inFence ? line : escapeLineNonHtml(line))
      }
      const result = out.join('\n')
      return result !== code ? { code: result } : null
    },
  }
}

// Heading slugs: strip punctuation (including em-dashes) so an "abortOn — cancel ..."
// heading anchors as #aborton-cancel-... - the form every internal link uses. The default
// slugifier keeps the em-dash, silently breaking those anchors.
const slugify = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\u2000-\u206f\u2e00-\u2e7f\\'!"#$%&()*+,.\/:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

export default defineConfig({
  title: 'Intent File',
  markdown: {
    anchor: { slugify },
  },
  description:
    'The Intent File Specification - one declarative YAML file that describes a whole application, one altitude above the models a generator produces from it.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    plugins: [escapeMdAngleBrackets()],
  },
  head: [
    // Google Analytics (gtag.js)
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-RFXCE7HRB2' }],
    [
      'script',
      {},
      "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-RFXCE7HRB2');",
    ],
    ['meta', { name: 'theme-color', content: '#6d5efc' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'The Intent File Specification' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'One declarative YAML file describes a whole application. A conforming generator turns it into a running system - deterministically.',
      },
    ],
  ],
  themeConfig: {
    siteTitle: 'Intent File',
    nav: [
      { text: 'Specification', link: '/spec/', activeMatch: '/spec/' },
      { text: 'Reference', link: '/reference', activeMatch: '/reference' },
      { text: 'Examples', link: '/examples', activeMatch: '/examples' },
      { text: 'Manifesto', link: '/manifesto', activeMatch: '/manifesto' },
      { text: 'v1.2', link: '/spec/' },
    ],
    sidebar: {
      '/': [
        {
          text: 'Specification',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/spec/' },
            { text: 'Entities & fields', link: '/spec/entities' },
            { text: 'Relations & multi-model', link: '/spec/relations' },
            { text: 'Processes & forms', link: '/spec/processes' },
            { text: 'Presentation', link: '/spec/presentation' },
            { text: 'Declarative glue', link: '/spec/glue' },
            { text: 'Scoped surfaces & roles', link: '/spec/surfaces' },
            { text: 'Data, seeds & naming', link: '/spec/data' },
          ],
        },
        {
          text: 'More',
          collapsed: false,
          items: [
            { text: 'DSL reference', link: '/reference' },
            { text: 'Examples', link: '/examples' },
            { text: 'Manifesto', link: '/manifesto' },
            { text: 'The scope boundary', link: '/boundary' },
          ],
        },
      ],
    },
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/IntentFile/intentfile.github.io' },
    ],
    search: { provider: 'local' },
    footer: {
      message: 'Released under the Apache License 2.0.',
      copyright: 'The Intent File Specification',
    },
    editLink: {
      pattern:
        'https://github.com/IntentFile/intentfile.github.io/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
