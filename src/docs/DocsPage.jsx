import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileCode2,
  Hash,
  Info,
  Layers,
  ListChecks,
  Search,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import {
  COMPONENT_DOCS,
  DIAGNOSTIC_GROUPS,
  DOC_GROUPS,
  DOC_SECTIONS,
  LANGUAGE_LAWS,
  getDocNeighbours,
  getDocSection,
} from './docsContent.js';
import { LANGUAGE_VERSION, COMPILER_VERSION } from '../language/languageSpec.js';
import EveSnippet from './EveSnippet.jsx';
import CodeViewer from '../components/ui/CodeViewer.jsx';

const SECTION_ALIASES = {
  language: 'syntax',
  reference: 'components',
  api: 'cpp',
};

const NOTE_META = {
  info: { icon: Info, label: 'Note' },
  warning: { icon: AlertTriangle, label: 'Boundary' },
  success: { icon: CheckCircle2, label: 'Confirmed' },
  danger: { icon: ShieldAlert, label: 'Warning' },
};

const SEVERITY_LABEL = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  'runtime error': 'runtime',
};

function CodeBlock({ block }) {
  if (block.language === 'eve') {
    return <EveSnippet code={block.code} title={block.title} />;
  }
  if (block.language === 'cpp' || block.language === 'json') {
    return (
      <div className="eve-doc-code">
        {block.title ? <div className="eve-doc-code-title">{block.title}</div> : null}
        <CodeViewer code={block.code} language={block.language} />
      </div>
    );
  }
  return (
    <div className="eve-doc-code">
      {block.title ? <div className="eve-doc-code-title">{block.title}</div> : null}
      <pre className="eve-doc-pre">
        <code>{block.code}</code>
      </pre>
    </div>
  );
}

function NoteBlock({ block }) {
  const meta = NOTE_META[block.tone] || NOTE_META.info;
  const Icon = meta.icon;
  return (
    <aside className={`eve-doc-note ${block.tone || 'info'}`}>
      <span className="eve-doc-note-icon">
        <Icon size={15} />
      </span>
      <div>
        <strong>{block.title || meta.label}</strong>
        <p>{block.text}</p>
      </div>
    </aside>
  );
}

function ListBlock({ block }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag className={`eve-doc-list${block.ordered ? ' is-ordered' : ''}`}>
      {block.items.map((item, index) => (
        <li key={`${index}-${String(item).slice(0, 24)}`}>
          <span>{item}</span>
        </li>
      ))}
    </Tag>
  );
}

function TableBlock({ block }) {
  return (
    <div className="eve-doc-table-wrap">
      <table className="eve-doc-table">
        <thead>
          <tr>
            {block.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th scope="row" key={cellIndex}>
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardsBlock({ block }) {
  return (
    <div className="eve-doc-cards">
      {block.items.map((item) => (
        <article className="eve-doc-card" key={item.title}>
          <div className="eve-doc-card-mark">
            <Sparkles size={14} />
          </div>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </article>
      ))}
    </div>
  );
}

function ComponentReference() {
  return (
    <div className="eve-component-reference">
      <div className="eve-component-jump">
        {COMPONENT_DOCS.map((component) => (
          <a key={component.tag} href={`#component-${component.tag}`}>
            &lt;{component.tag}&gt;
          </a>
        ))}
      </div>
      {COMPONENT_DOCS.map((component) => (
        <article
          className="eve-component-card"
          id={`component-${component.tag}`}
          key={component.tag}
        >
          <header className="eve-component-head">
            <div>
              <h3>
                <span className="eve-component-sig">&lt;{component.tag}&gt;</span>
                {component.experimental ? (
                  <span className="eve-component-badge warning">preview only</span>
                ) : null}
                {component.textOnly ? (
                  <span className="eve-component-badge">text content</span>
                ) : null}
              </h3>
              <p>{component.summary}</p>
            </div>
            <div className="eve-component-meta">
              <span>
                <Layers size={12} />
                {component.children.length ? component.children.join(', ') : 'no child elements'}
              </span>
            </div>
          </header>

          <div className="eve-doc-table-wrap">
            <table className="eve-doc-table component-attrs">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Default</th>
                  <th>Dynamic</th>
                  <th>Allowed values</th>
                </tr>
              </thead>
              <tbody>
                {component.attributes.map((attribute) => (
                  <tr key={attribute.name}>
                    <th scope="row">
                      <code>{attribute.name}</code>
                    </th>
                    <td>
                      <span className={`eve-attr-type ${attribute.type}`}>{attribute.type}</span>
                    </td>
                    <td>{attribute.required ? <span className="eve-yes">yes</span> : '—'}</td>
                    <td>
                      <code className="eve-muted-code">{attribute.defaultValue}</code>
                    </td>
                    <td>
                      {attribute.dynamic ? (
                        <span className="eve-yes">${'{…}'}</span>
                      ) : (
                        <span className="eve-no">static</span>
                      )}
                    </td>
                    <td>{attribute.allowed || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {component.examples.length ? (
            <div className="eve-component-examples">
              <EveSnippet code={component.examples.join('\n')} showLineNumbers={false} />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function DiagnosticsReference() {
  return (
    <div className="eve-diag-groups">
      {DIAGNOSTIC_GROUPS.map((group) => (
        <article className="eve-diag-group" key={group.id} id={`diagnostics-${group.id}`}>
          <header>
            <h3>{group.title}</h3>
            <p>{group.description}</p>
          </header>
          <div className="eve-doc-table-wrap">
            <table className="eve-doc-table diag-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Severity</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {group.codes.map(([code, severity, message]) => (
                  <tr key={code}>
                    <th scope="row">
                      <code className="eve-diag-code-pill">{code}</code>
                    </th>
                    <td>
                      <span className={`eve-severity ${SEVERITY_LABEL[severity] || severity}`}>
                        {severity}
                      </span>
                    </td>
                    <td>{message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {group.reserved ? (
            <p className="eve-diag-reserved">
              <Info size={13} /> {group.reserved}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function LawsReference() {
  return (
    <div className="eve-law-grid">
      {LANGUAGE_LAWS.map((law) => (
        <article className="eve-law-card" key={law.code}>
          <div className="eve-law-code">{law.code}</div>
          <div>
            <h3>{law.title}</h3>
            <p>{law.text}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function Block({ block }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2 className="eve-doc-h2" id={String(block.text).toLowerCase().replace(/[^a-z0-9]+/g, '-')}>
          {block.text}
        </h2>
      );
    case 'p':
      return <p className="eve-doc-p">{block.text}</p>;
    case 'code':
      return <CodeBlock block={block} />;
    case 'note':
      return <NoteBlock block={block} />;
    case 'list':
      return <ListBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    case 'cards':
      return <CardsBlock block={block} />;
    case 'components':
      return <ComponentReference />;
    case 'diagnostics':
      return <DiagnosticsReference />;
    case 'laws':
      return <LawsReference />;
    default:
      return null;
  }
}

function DocsSidebar({ activeId }) {
  const [query, setQuery] = useState('');
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return DOC_GROUPS.map((group) => ({
      ...group,
      sections: group.sections.filter((sectionId) => {
        if (!needle) return true;
        const section = getDocSection(sectionId);
        return (
          section &&
          `${section.title} ${section.lead}`.toLowerCase().includes(needle)
        );
      }),
    })).filter((group) => group.sections.length > 0);
  }, [query]);

  return (
    <aside className="eve-docs-sidebar" aria-label="Documentation sections">
      <div className="eve-docs-sidebar-head">
        <div>
          <BookOpen size={15} />
          <span>EVE Manual</span>
        </div>
        <span className="eve-docs-version">v{LANGUAGE_VERSION}</span>
      </div>
      <label className="eve-docs-search">
        <Search size={13} />
        <input
          type="search"
          value={query}
          placeholder="Find a section"
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search documentation sections"
        />
      </label>
      <nav className="eve-docs-nav">
        {filteredGroups.length === 0 ? (
          <p className="eve-docs-nav-empty">No section matches “{query}”.</p>
        ) : (
          filteredGroups.map((group) => (
            <div className="eve-docs-group" key={group.id}>
              <div className="eve-docs-group-label">{group.title}</div>
              {group.sections.map((sectionId) => {
                const section = getDocSection(sectionId);
                if (!section) return null;
                return (
                  <NavLink
                    key={section.id}
                    to={`/docs/${section.id}`}
                    className={section.id === activeId ? 'is-active' : ''}
                  >
                    <ChevronRight size={12} />
                    <span>{section.title}</span>
                  </NavLink>
                );
              })}
            </div>
          ))
        )}
      </nav>
      <div className="eve-docs-sidebar-foot">
        <Cpu size={13} />
        <span>
          Language {LANGUAGE_VERSION}
          <br />
          Compiler {COMPILER_VERSION}
        </span>
      </div>
    </aside>
  );
}

function DocsPager({ sectionId }) {
  const { previous, next } = getDocNeighbours(sectionId);
  return (
    <nav className="eve-docs-pager" aria-label="Documentation paging">
      {previous ? (
        <Link to={`/docs/${previous.id}`} className="eve-docs-pager-link previous">
          <ArrowLeft size={15} />
          <span>
            <small>Previous</small>
            <strong>{previous.title}</strong>
          </span>
        </Link>
      ) : (
        <span className="eve-docs-pager-spacer" />
      )}
      {next ? (
        <Link to={`/docs/${next.id}`} className="eve-docs-pager-link next">
          <span>
            <small>Next</small>
            <strong>{next.title}</strong>
          </span>
          <ArrowRight size={15} />
        </Link>
      ) : (
        <span className="eve-docs-pager-spacer" />
      )}
    </nav>
  );
}

export default function DocsPage() {
  const location = useLocation();
  const scrollRef = useRef(null);
  const rawPath = decodeURIComponent(
    location.pathname.replace(/^\/docs\/?/, '').replace(/\/+$/, ''),
  );
  const requested = rawPath || 'overview';
  const resolvedId = SECTION_ALIASES[requested] || requested;
  const section = getDocSection(resolvedId);
  const index = section ? DOC_SECTIONS.findIndex((entry) => entry.id === section.id) : -1;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [resolvedId]);

  return (
    <div className="eve-docs-page">
      <DocsSidebar activeId={section?.id || resolvedId} />
      <main className="eve-docs-main" ref={scrollRef}>
        {section ? (
          <article className="eve-docs-article">
            <header className="eve-docs-header">
              <div className="eve-docs-eyebrow">
                <Hash size={12} />
                <span>Section {index + 1} of {DOC_SECTIONS.length}</span>
                <span className="eve-docs-eyebrow-sep">·</span>
                <span>EVE UI Language {LANGUAGE_VERSION}</span>
              </div>
              <h1>{section.title}</h1>
              <p className="eve-docs-lead">{section.lead}</p>
              <div className="eve-docs-header-tags">
                <span>
                  <TerminalSquare size={12} /> Browser-side toolchain
                </span>
                <span>
                  <FileCode2 size={12} /> Generated C++ draft
                </span>
                <span>
                  <ListChecks size={12} /> Real diagnostics
                </span>
              </div>
            </header>

            <div className="eve-docs-blocks">
              {section.blocks.map((block, blockIndex) => (
                <Block block={block} key={`${section.id}-${blockIndex}`} />
              ))}
            </div>

            {section.id === 'overview' ? (
              <div className="eve-docs-quick-links">
                <Link to="/docs/syntax" className="eve-quick-link">
                  <Boxes size={16} />
                  <span>
                    <strong>Language and syntax</strong>
                    <small>Document shape, dynamic values and tag semantics.</small>
                  </span>
                  <ArrowRight size={14} />
                </Link>
                <Link to="/docs/components" className="eve-quick-link">
                  <Layers size={16} />
                  <span>
                    <strong>Component reference</strong>
                    <small>Generated from the compiler language specification.</small>
                  </span>
                  <ArrowRight size={14} />
                </Link>
                <Link to="/docs/diagnostics" className="eve-quick-link">
                  <ShieldAlert size={16} />
                  <span>
                    <strong>Diagnostics</strong>
                    <small>Every emitted code, severity and compiler stage.</small>
                  </span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            ) : null}

            <DocsPager sectionId={section.id} />
          </article>
        ) : (
          <div className="eve-docs-missing">
            <ShieldAlert size={30} />
            <h1>Section not found</h1>
            <p>
              “{requested}” is not part of the EVE documentation. Available sections are listed in
              the manual navigation.
            </p>
            <Link to="/docs/overview" className="eve-button primary">
              <BookOpen size={14} /> Open the overview
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
