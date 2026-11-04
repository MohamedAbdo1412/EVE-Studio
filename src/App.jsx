import React from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BookOpen, Boxes, Circle, FlaskConical, Sparkles, Cpu } from 'lucide-react';
import { ProjectProvider, useProject } from './project/ProjectContext.jsx';
import StudioPage from './studio/StudioPage.jsx';
import DocsPage from './docs/DocsPage.jsx';
import ExamplesPage from './examples/ExamplesPage.jsx';
import HardwarePage from './hardware/HardwarePage.jsx';

function HeaderStatus() {
  const { compilerStatus } = useProject();
  const status = compilerStatus?.status || 'ready';
  const tone =
    status === 'error'
      ? 'error'
      : status === 'warning'
        ? 'warning'
        : status === 'success'
          ? 'success'
          : status === 'busy'
            ? 'busy'
            : 'idle';
  return (
    <div className={`eve-header-status ${tone}`} title={compilerStatus?.message || 'Compiler idle'}>
      <Circle size={8} fill="currentColor" />
      <span>{compilerStatus?.label || 'Ready'}</span>
      {compilerStatus?.errors ? <em>{compilerStatus.errors}E</em> : null}
      {compilerStatus?.warnings ? <em>{compilerStatus.warnings}W</em> : null}
    </div>
  );
}

function Header() {
  const location = useLocation();
  const docsActive = location.pathname.startsWith('/docs');
  const hardwareActive = location.pathname.startsWith('/hardware');
  return (
    <header className="eve-app-header">
      <NavLink to="/" className="eve-brand" aria-label="EVE Studio home">
        <span className="eve-brand-mark">
          <Sparkles size={18} />
        </span>
        <span className="eve-brand-copy">
          <strong>EVE Studio</strong>
          <small>UI Language Workbench</small>
        </span>
        <span className="eve-version-pill">0.1</span>
      </NavLink>

      <nav className="eve-main-nav" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <Boxes size={15} />
          Studio
        </NavLink>
        <NavLink to="/docs" className={docsActive ? 'is-active' : ''}>
          <BookOpen size={15} />
          Documentation
        </NavLink>
        <NavLink to="/hardware" className={hardwareActive ? 'is-active' : ''}>
          <Cpu size={15} />
          Hardware
        </NavLink>
        <NavLink to="/examples" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <FlaskConical size={15} />
          Examples
        </NavLink>
      </nav>

      <div className="eve-header-right">
        <HeaderStatus />
        <span className="eve-browser-badge" title="This is a browser prototype, not FPGA hardware">
          Browser prototype
        </span>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <div className="eve-app">
        <a className="eve-skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        <div className="eve-app-content" id="main-content">
          <Routes>
            <Route path="/" element={<StudioPage />} />
            <Route path="/docs/*" element={<DocsPage />} />
            <Route path="/hardware" element={<HardwarePage />} />
            <Route path="/examples" element={<ExamplesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </ProjectProvider>
  );
}
