import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  FileCode2,
  FlaskConical,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { EXAMPLES } from '../project/examples.js';
import { useProject } from '../project/ProjectContext.jsx';
import { compile } from '../language/compiler/compile.js';
import EveSnippet from '../docs/EveSnippet.jsx';

const CATEGORY_TONES = {
  Fundamentals: 'blue',
  Starter: 'green',
  Interaction: 'amber',
  Bindings: 'violet',
  Assets: 'cyan',
};

function placeholderAssets(example) {
  return Object.fromEntries(
    (example.assetPaths || []).map((path) => [
      path,
      {
        id: path,
        path,
        name: path.split('/').pop(),
        type: 'image/png',
        size: 0,
        width: null,
        height: null,
        dataUrl: '',
        source: 'sample',
      },
    ]),
  );
}

function analyseExample(example) {
  const result = compile(example.source, { assets: placeholderAssets(example) });
  return {
    valid: result.valid,
    counts: result.counts,
    pages: result.layoutStats.pages,
    components: result.layoutStats.components,
    variables: result.registry.length,
    bindings: result.bindings.bindings.length,
    initialPage: result.initialPage,
    durationMs: result.durationMs,
    lines: example.source.replace(/\s+$/, '').split('\n').length,
  };
}

export default function ExamplesPage() {
  const navigate = useNavigate();
  const { loadExample } = useProject();
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [loadingId, setLoadingId] = useState(null);

  const examples = useMemo(
    () =>
      EXAMPLES.map((example) => ({
        ...example,
        analysis: analyseExample(example),
      })),
    [],
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(EXAMPLES.map((example) => example.category)))],
    [],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return examples.filter((example) => {
      if (category !== 'All' && example.category !== category) return false;
      if (!needle) return true;
      return `${example.title} ${example.description} ${example.category} ${example.source}`
        .toLowerCase()
        .includes(needle);
    });
  }, [examples, category, query]);

  const toggleExpanded = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openExample = (example) => {
    setLoadingId(example.id);
    const loaded = loadExample(example);
    setLoadingId(null);
    if (loaded) navigate('/');
  };

  return (
    <div className="eve-examples-page">
      <div className="eve-examples-shell">
        <header className="eve-examples-hero">
          <div className="eve-examples-hero-copy">
            <span className="eve-examples-eyebrow">
              <FlaskConical size={13} /> Example Library
            </span>
            <h1>Working EVE projects, ready to open.</h1>
            <p>
              Every example is a complete EVE document compiled by the same browser pipeline as the
              Studio. Open one to replace the current project, then edit variables and press its
              buttons in the live simulator.
            </p>
            <div className="eve-examples-hero-actions">
              <Link to="/" className="eve-button primary">
                <Play size={14} /> Open Studio
              </Link>
              <Link to="/docs/acceptance" className="eve-button ghost">
                <BookOpen size={14} /> Acceptance scenario
              </Link>
            </div>
          </div>
          <div className="eve-examples-hero-stats">
            <div>
              <strong>{EXAMPLES.length}</strong>
              <span>complete projects</span>
            </div>
            <div>
              <strong>{categories.length - 1}</strong>
              <span>categories</span>
            </div>
            <div>
              <strong>
                {examples.reduce((total, example) => total + example.analysis.pages, 0)}
              </strong>
              <span>compiled pages</span>
            </div>
            <div>
              <strong>
                {examples.reduce((total, example) => total + example.analysis.components, 0)}
              </strong>
              <span>resolved components</span>
            </div>
          </div>
        </header>

        <div className="eve-examples-controls">
          <div className="eve-example-filters" role="tablist" aria-label="Example categories">
            {categories.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={category === entry}
                className={category === entry ? 'is-active' : ''}
                onClick={() => setCategory(entry)}
              >
                {entry}
                <em>
                  {entry === 'All'
                    ? examples.length
                    : examples.filter((example) => example.category === entry).length}
                </em>
              </button>
            ))}
          </div>
          <label className="eve-example-search">
            <Search size={14} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, tags or source"
              aria-label="Search examples"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={13} />
              </button>
            ) : null}
          </label>
        </div>

        <div className="eve-examples-result-line">
          <span>
            {filtered.length} example{filtered.length === 1 ? '' : 's'}
            {category !== 'All' ? ` in ${category}` : ''}
            {query ? ` matching “${query}”` : ''}
          </span>
          <span className="eve-examples-hint">
            <Sparkles size={12} /> Opening an example keeps a local backup of the current project.
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="eve-examples-empty">
            <Search size={28} />
            <h2>No examples match</h2>
            <p>Clear the search or choose a different category.</p>
            <button
              type="button"
              className="eve-button ghost"
              onClick={() => {
                setQuery('');
                setCategory('All');
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="eve-example-grid">
            {filtered.map((example) => {
              const isExpanded = expanded.has(example.id);
              const tone = CATEGORY_TONES[example.category] || 'blue';
              const analysis = example.analysis;
              return (
                <article className="eve-example-card" key={example.id}>
                  <header className="eve-example-card-head">
                    <div className={`eve-example-glyph ${tone}`}>
                      <LayoutTemplate size={18} />
                    </div>
                    <div className="eve-example-title-block">
                      <div className="eve-example-badges">
                        <span className={`eve-category-badge ${tone}`}>{example.category}</span>
                        {analysis.valid ? (
                          <span className="eve-compile-chip success">
                            <CheckCircle2 size={11} /> compiles clean
                          </span>
                        ) : (
                          <span className="eve-compile-chip error">
                            <AlertTriangle size={11} /> {analysis.counts.error} error
                            {analysis.counts.error === 1 ? '' : 's'}
                          </span>
                        )}
                        {analysis.counts.warning > 0 ? (
                          <span className="eve-compile-chip warning">
                            <AlertTriangle size={11} /> {analysis.counts.warning}w
                          </span>
                        ) : null}
                      </div>
                      <h2>{example.title}</h2>
                      <p>{example.description}</p>
                    </div>
                  </header>

                  <div className="eve-example-stats">
                    <span title="Compiled pages">
                      <Layers size={12} /> {analysis.pages} pages
                    </span>
                    <span title="Resolved components">
                      <Code2 size={12} /> {analysis.components} components
                    </span>
                    <span title="Runtime variables">
                      <SlidersHorizontal size={12} /> {analysis.variables} vars
                    </span>
                    <span title="Dynamic bindings">
                      <FileCode2 size={12} /> {analysis.bindings} bindings
                    </span>
                    {example.assetPaths.length ? (
                      <span title="Sample assets">
                        <ImageIcon size={12} /> {example.assetPaths.length} assets
                      </span>
                    ) : null}
                  </div>

                  <div className="eve-example-source">
                    <EveSnippet
                      code={example.source}
                      maxLines={isExpanded ? undefined : 8}
                      showLineNumbers={isExpanded}
                    />
                  </div>

                  <footer className="eve-example-actions">
                    <button
                      type="button"
                      className="eve-text-button"
                      onClick={() => toggleExpanded(example.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isExpanded ? 'Hide full source' : `Show full source · ${analysis.lines} lines`}
                    </button>
                    <button
                      type="button"
                      className="eve-button primary small"
                      onClick={() => openExample(example)}
                      disabled={loadingId === example.id}
                    >
                      <Play size={13} />
                      {loadingId === example.id ? 'Opening…' : 'Open in Studio'}
                      <ArrowRight size={13} />
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
