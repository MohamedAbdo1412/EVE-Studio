import {
  HighlightStyle,
  StreamLanguage,
  foldService,
  syntaxHighlighting,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { snippetCompletion } from '@codemirror/autocomplete';
import { TAG_SPECS } from '../language/languageSpec.js';

const UI_TAG_NAMES = Object.keys(TAG_SPECS);

const tokenTable = {
  tagName: tags.tagName,
  attributeName: tags.attributeName,
  angle: tags.punctuation,
  interpolation: tags.special(tags.variableName),
  expression: tags.special(tags.variableName),
  entity: tags.atom,
};

const eveStreamParser = {
  name: 'eve',
  tokenTable,
  startState() {
    return {
      inTag: false,
      inComment: false,
      closing: false,
      expectTagName: false,
    };
  },
  token(stream, state) {
    if (state.inComment) {
      const end = stream.string.indexOf('-->', stream.pos);
      if (end >= 0) {
        stream.pos = end + 3;
        state.inComment = false;
      } else {
        stream.skipToEnd();
      }
      return 'comment';
    }

    if (stream.match('<!--')) {
      state.inComment = true;
      return 'comment';
    }

    if (!state.inTag && stream.match('${')) {
      // Interpolation outside an attribute value.
      if (!stream.match(/^[^}\n]*\}?/)) stream.skipToEnd();
      return 'interpolation';
    }

    if (!state.inTag && stream.match('<')) {
      state.inTag = true;
      state.expectTagName = true;
      state.closing = Boolean(stream.match('/'));
      return 'angle';
    }

    if (state.inTag) {
      if (stream.match('/>') || stream.match('>')) {
        state.inTag = false;
        state.expectTagName = false;
        state.closing = false;
        return 'angle';
      }
      if (stream.match(/\s+/)) return null;
      if (state.expectTagName && stream.match(/^[A-Za-z_][A-Za-z0-9_-]*/)) {
        state.expectTagName = false;
        return 'tagName';
      }
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_-]*/)) return 'attributeName';
      if (stream.match('=')) return 'operator';
      if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) {
        return 'string';
      }
      if (stream.match(/^[^\s>/=]+/)) return 'attributeName';
      stream.next();
      return null;
    }

    if (stream.match(/^&(?:#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/)) {
      return 'entity';
    }
    if (stream.match(/^[^<$&]+/)) return null;
    stream.next();
    return null;
  },
};

export const eveLanguage = StreamLanguage.define(eveStreamParser);

export const eveHighlightStyle = HighlightStyle.define([
  { tag: tags.tagName, color: '#6cb6ff', fontWeight: '600' },
  { tag: tags.attributeName, color: '#d6b36a' },
  { tag: tags.string, color: '#8fd68f' },
  { tag: tags.comment, color: '#5b6b7c', fontStyle: 'italic' },
  { tag: tags.punctuation, color: '#7c8ea3' },
  { tag: tags.operator, color: '#a7b7c8' },
  { tag: tags.special(tags.variableName), color: '#c792ea', fontWeight: '600' },
  { tag: tags.atom, color: '#e2a76f' },
  { tag: tags.number, color: '#f0b45b' },
  { tag: tags.bool, color: '#f0b45b' },
  { tag: tags.null, color: '#f0b45b' },
  { tag: tags.variableName, color: '#7fd5e8' },
  { tag: tags.controlKeyword, color: '#c792ea' },
]);

/* ------------------------------------------------------------------------- */
/* Tag matching decorations                                                  */
/* ------------------------------------------------------------------------- */

function findTags(docText) {
  const result = [];
  const pattern = /<(\/?)([A-Za-z_][A-Za-z0-9_-]*)\b[^<>]*?(\/?)>/g;
  let match;
  let comment = false;
  let commentEnd = 0;
  while ((match = pattern.exec(docText))) {
    if (!comment) {
      const previousOpen = docText.lastIndexOf('<!--', match.index);
      const previousClose = docText.lastIndexOf('-->', match.index);
      comment = previousOpen >= 0 && previousOpen > previousClose;
    }
    if (comment) {
      if (match.index + match[0].length >= commentEnd) comment = false;
      continue;
    }
    result.push({
      closing: Boolean(match[1]),
      selfClosing: Boolean(match[3]),
      name: match[2],
      start: match.index,
      end: match.index + match[0].length,
      nameStart: match.index + 1 + match[1].length,
      nameEnd: match.index + 1 + match[1].length + match[2].length,
    });
  }
  return result;
}

function tagAtPosition(tagsList, position) {
  return tagsList.find((tag) => position >= tag.start && position <= tag.end);
}

function companionFor(tagsList, index) {
  const tag = tagsList[index];
  if (!tag || tag.selfClosing) return null;
  if (tag.closing) {
    let depth = 0;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = tagsList[cursor];
      if (candidate.name !== tag.name) continue;
      if (candidate.closing) depth += 1;
      else if (candidate.selfClosing) continue;
      else if (depth === 0) return candidate;
      else depth -= 1;
    }
    return null;
  }
  let depth = 0;
  for (let cursor = index + 1; cursor < tagsList.length; cursor += 1) {
    const candidate = tagsList[cursor];
    if (candidate.name !== tag.name) continue;
    if (candidate.selfClosing) continue;
    if (!candidate.closing) depth += 1;
    else if (depth === 0) return candidate;
    else depth -= 1;
  }
  return null;
}

function buildTagMatchDecorations(state, position) {
  const text = state.doc.toString();
  const tagsList = findTags(text);
  const current = tagAtPosition(tagsList, position);
  if (!current) return Decoration.none;
  const index = tagsList.indexOf(current);
  const companion = companionFor(tagsList, index);
  if (!companion) return Decoration.none;
  const mark = Decoration.mark({ class: 'cm-eve-match-tag' });
  const ranges = [
    mark.range(current.start, current.end),
    mark.range(companion.start, companion.end),
  ].sort((a, b) => a.from - b.from);
  return Decoration.set(ranges, true);
}

export const eveTagMatching = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildTagMatchDecorations(view.state, view.state.selection.main.head);
    }

    update(update) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildTagMatchDecorations(update.state, update.state.selection.main.head);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/* ------------------------------------------------------------------------- */
/* Folding                                                                   */
/* ------------------------------------------------------------------------- */

function foldEveTag(state, lineStart, lineEnd) {
  const text = state.doc.toString();
  const tagsList = findTags(text);
  const opening = tagsList.find(
    (tag) => !tag.closing && !tag.selfClosing && tag.start >= lineStart && tag.start <= lineEnd,
  );
  if (!opening) return null;
  const index = tagsList.indexOf(opening);
  const companion = companionFor(tagsList, index);
  if (!companion) return null;
  if (companion.start <= lineEnd) return null;
  return { from: lineEnd, to: companion.start };
}

export const eveFoldService = foldService.of(foldEveTag);

/* ------------------------------------------------------------------------- */
/* Autocomplete                                                              */
/* ------------------------------------------------------------------------- */

const TAG_INFO = Object.fromEntries(
  UI_TAG_NAMES.map((name) => [name, TAG_SPECS[name]?.summary || '']),
);

function tagOptions() {
  return UI_TAG_NAMES.map((name) => ({
    label: name,
    type: 'keyword',
    detail: `<${name}>`,
    info: TAG_INFO[name],
    boost: name === 'text' ? 2 : 0,
  }));
}

function attributeOptions(tagName, existingText) {
  const spec = TAG_SPECS[tagName];
  if (!spec) return [];
  return Object.entries(spec.attributes).map(([name, attribute]) => ({
    label: name,
    type: 'property',
    detail: `${attribute.type}${attribute.required ? ' · required' : ''}`,
    info: attribute.dynamic
      ? 'Static value or a ${...} expression.'
      : 'Static compile-time value.',
    boost: attribute.required ? 3 : 0,
    apply: existingText.includes(`${name}=`) ? undefined : name,
  }));
}

function variableOptions(variables) {
  return (variables || []).map((entry) => ({
    label: entry.path,
    type: entry.type === 'number' ? 'constant' : entry.type === 'boolean' ? 'bool' : 'variable',
    detail: entry.type,
    info: `Initial value: ${String(entry.initialValue)}`,
    boost: -1,
  }));
}

function expressionOptions(variables) {
  return [
    ...variableOptions(variables),
    { label: 'true', type: 'keyword', detail: 'boolean' },
    { label: 'false', type: 'keyword', detail: 'boolean' },
    { label: 'null', type: 'keyword', detail: 'null' },
  ];
}

function pageOptions(pages) {
  return (pages || []).map((page) => ({
    label: page.id,
    type: 'text',
    detail: page.title || 'page',
    info: 'Navigation target',
  }));
}

function assetOptions(assets) {
  return Object.keys(assets || {}).map((path) => ({
    label: path,
    type: 'text',
    detail: assets[path]?.type || 'asset',
    info: assets[path]?.name || path,
  }));
}

function actionSnippets(pages, variables) {
  const firstPage = pages?.[0]?.id || 'home';
  const firstVariable = variables?.[0]?.path || 'variable';
  const booleanVariable = variables?.find((entry) => entry.type === 'boolean')?.path || firstVariable;
  return [
    snippetCompletion(`navigate('\${${firstPage}}')`, {
      label: 'navigate',
      detail: 'Navigate to a page',
      type: 'function',
      info: 'navigate(pageId) pushes the current page onto the history stack.',
    }),
    snippetCompletion('back()', {
      label: 'back',
      detail: 'Return to the previous page',
      type: 'function',
      info: 'back() pops the navigation history stack.',
    }),
    snippetCompletion(`set(\${${firstVariable}}, \${value})`, {
      label: 'set',
      detail: 'Assign a variable',
      type: 'function',
      info: 'set(path, expression) evaluates and assigns a typed value.',
    }),
    snippetCompletion(`toggle(\${${booleanVariable}})`, {
      label: 'toggle',
      detail: 'Flip a boolean variable',
      type: 'function',
      info: 'toggle(path) requires a boolean variable.',
    }),
    snippetCompletion(`reset(\${${firstVariable}})`, {
      label: 'reset',
      detail: 'Restore a variable initial value',
      type: 'function',
      info: 'reset(path) restores the declared initial value.',
    }),
  ];
}

function findOpenTagBefore(text) {
  const lastOpen = text.lastIndexOf('<');
  const lastClose = text.lastIndexOf('>');
  if (lastOpen <= lastClose) return null;
  const fragment = text.slice(lastOpen);
  const match = fragment.match(/^<\/?([A-Za-z_][A-Za-z0-9_-]*)/);
  return { fragment, tagName: match?.[1] || '', nameStarted: Boolean(match) };
}

function buildCompletionSource({ getVariables, getAssets, getPages }) {
  return (context) => {
    const position = context.pos;
    const doc = context.state.doc;
    const beforeWindow = doc.sliceString(Math.max(0, position - 400), position);
    const lineBefore = doc.sliceString(doc.lineAt(position).from, position);

    // Inside ${ ... } — variables and literal keywords.
    const interpolationIndex = beforeWindow.lastIndexOf('${');
    const interpolationClose = beforeWindow.lastIndexOf('}');
    if (interpolationIndex > interpolationClose) {
      return {
        from: position - (beforeWindow.length - interpolationIndex - 2),
        options: expressionOptions(getVariables()),
        validFor: /^[A-Za-z_][A-Za-z0-9_.]*$/,
      };
    }

    const openTag = findOpenTagBefore(beforeWindow);
    if (openTag) {
      const quoteMatch = openTag.fragment.match(/([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*["']([^"']*)$/);
      if (quoteMatch) {
        const attribute = quoteMatch[1];
        const typed = quoteMatch[2];
        let options = [];
        if (typed.startsWith('${') || attribute === 'visible' || attribute === 'disabled') {
          options = expressionOptions(getVariables());
        } else if (attribute === 'src') {
          options = assetOptions(getAssets());
        } else if (attribute === 'onPress') {
          options = actionSnippets(getPages(), getVariables());
        } else {
          options = [
            ...expressionOptions(getVariables()).slice(0, 8),
            ...(attribute === 'id' ? [] : []),
          ];
        }
        return {
          from: position - typed.length,
          options,
          validFor: /^[^"']*$/,
        };
      }

      if (!openTag.tagName) {
        const typed = openTag.fragment.slice(1).replace(/^\//, '');
        return {
          from: position - typed.length,
          options: tagOptions(),
          validFor: /^[A-Za-z0-9_-]*$/,
        };
      }

      const afterTagName = openTag.fragment.replace(/^<\/?[A-Za-z_][A-Za-z0-9_-]*/, '');
      const attributeMatch = lineBefore.match(/([A-Za-z_][A-Za-z0-9_-]*)$/);
      if (!attributeMatch) {
        return {
          from: position,
          options: attributeOptions(openTag.tagName, afterTagName),
          validFor: /^$/,
        };
      }
      return {
        from: position - attributeMatch[1].length,
        options: attributeOptions(openTag.tagName, afterTagName),
        validFor: /^[A-Za-z0-9_-]*$/,
      };
    }

    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_.]*$/);
    if (!word && !context.explicit) return null;
    return {
      from: word ? word.from : position,
      options: [
        ...tagOptions(),
        ...expressionOptions(getVariables()),
        ...pageOptions(getPages()),
        ...assetOptions(getAssets()),
      ],
      validFor: /^[A-Za-z0-9_./-]*$/,
    };
  };
}

export function createEveCompletionSource(accessors) {
  return buildCompletionSource(accessors);
}

export const eveEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0b1118',
    color: '#c6d3e0',
    height: '100%',
    fontSize: '13px',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
    padding: '12px 0 48px',
    caretColor: '#6cb6ff',
  },
  '.cm-gutters': {
    backgroundColor: '#0b1118',
    color: '#435063',
    border: 'none',
    paddingRight: '6px',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(108, 182, 255, 0.045)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(108, 182, 255, 0.08)', color: '#8fa7bd' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(49, 116, 173, 0.38)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#6cb6ff' },
  '.cm-foldGutter .cm-gutterElement': { color: '#54657a' },
  '.cm-foldPlaceholder': {
    backgroundColor: '#182332',
    border: '1px solid #2c4055',
    color: '#8fa7bd',
  },
  '.cm-tooltip': {
    backgroundColor: '#111b26',
    border: '1px solid #2c3e53',
    color: '#c6d3e0',
    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: '#1f3d5c',
    color: '#ffffff',
  },
  '.cm-panels': { backgroundColor: '#0e1721', color: '#aebdcc' },
  '.cm-searchMatch': { backgroundColor: 'rgba(255, 180, 84, 0.28)' },
  '.cm-eve-match-tag': {
    backgroundColor: 'rgba(108, 182, 255, 0.14)',
    outline: '1px solid rgba(108, 182, 255, 0.34)',
    borderRadius: '2px',
  },
  '.cm-lint-marker-error': { content: '""' },
});

export const eveEditorExtensions = [
  eveLanguage,
  syntaxHighlighting(eveHighlightStyle),
  eveTagMatching,
  eveFoldService,
];

export { UI_TAG_NAMES };
