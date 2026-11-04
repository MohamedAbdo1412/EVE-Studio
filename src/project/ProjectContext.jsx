import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { STARTER_SOURCE } from './starter.js';
import { getDemoAssets } from '../assets/demoAssets.js';

const STORAGE_KEY = 'eve.studio.project.v1';
const BACKUP_KEY = 'eve.studio.backup.project.v1';

const ProjectContext = createContext(null);

function loadInitialProject() {
  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }
  if (saved?.source && typeof saved.source === 'string') {
    return {
      source: saved.source,
      assets: saved.assets && typeof saved.assets === 'object' ? saved.assets : {},
      projectName: saved.projectName || 'EVE Room Monitor',
      restored: true,
    };
  }
  const demoAssets = getDemoAssets(['assets/room-icon.png']);
  return {
    source: STARTER_SOURCE,
    assets: demoAssets,
    projectName: 'EVE Room Monitor',
    restored: false,
  };
}

export function ProjectProvider({ children }) {
  const initial = useRef(null);
  if (!initial.current) initial.current = loadInitialProject();
  const [source, setSource] = useState(initial.current.source);
  const [assets, setAssets] = useState(initial.current.assets);
  const [projectName, setProjectName] = useState(initial.current.projectName);
  const [saveState, setSaveState] = useState('saved');
  const [lastSavedAt, setLastSavedAt] = useState(() => new Date());
  const [saveError, setSaveError] = useState('');
  const [compilerStatus, setCompilerStatusState] = useState({
    status: 'ready',
    label: 'Ready',
    errors: 0,
    warnings: 0,
    message: 'Compiler idle',
  });
  const [loadNonce, setLoadNonce] = useState(0);
  const timerRef = useRef(null);
  const lastSavedRef = useRef({ source, assets, projectName });
  const skipFirstSave = useRef(true);

  const persist = useCallback(
    (nextSource, nextAssets, nextName) => {
      const payload = {
        source: nextSource,
        assets: nextAssets,
        projectName: nextName,
        savedAt: new Date().toISOString(),
        languageVersion: '0.1',
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        lastSavedRef.current = { source: nextSource, assets: nextAssets, projectName: nextName };
        setSaveState('saved');
        setSaveError('');
        setLastSavedAt(new Date());
      } catch (error) {
        setSaveState('error');
        setSaveError(
          error?.name === 'QuotaExceededError'
            ? 'Local storage quota exceeded. Remove a large asset or export before continuing.'
            : 'Could not save the project to local storage.',
        );
      }
    },
    [],
  );

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      persist(source, assets, projectName);
      return undefined;
    }
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      persist(source, assets, projectName);
    }, 650);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [source, assets, projectName, persist]);

  const updateSource = useCallback((nextSource) => {
    setSource(nextSource);
    setSaveState('unsaved');
  }, []);

  const updateAssets = useCallback((updater) => {
    setAssets((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      return next || {};
    });
    setSaveState('unsaved');
  }, []);

  const addAssets = useCallback((newAssets) => {
    setAssets((current) => ({ ...current, ...newAssets }));
    setSaveState('unsaved');
  }, []);

  const removeAsset = useCallback((path) => {
    setAssets((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    setSaveState('unsaved');
  }, []);

  const saveNow = useCallback(() => {
    setSaveState('saving');
    persist(source, assets, projectName);
  }, [persist, source, assets, projectName]);

  const setCompilerStatus = useCallback((status) => {
    setCompilerStatusState((current) => ({ ...current, ...status }));
  }, []);

  const loadExample = useCallback(
    (example) => {
      const hasCurrentWork = source.trim() !== STARTER_SOURCE.trim();
      if (hasCurrentWork) {
        const confirmed = window.confirm(
          `Load "${example.title}" and replace the current source?\n\nThe current project is saved in local storage, and a backup copy will be kept in this browser.`,
        );
        if (!confirmed) return false;
      }
      try {
        localStorage.setItem(
          BACKUP_KEY,
          JSON.stringify({
            source,
            assets,
            projectName,
            backedUpAt: new Date().toISOString(),
          }),
        );
      } catch {
        // A backup is a convenience; the explicit confirmation is the safety gate.
      }
      const demo = getDemoAssets(example.assetPaths || []);
      setSource(example.source);
      setAssets((current) => ({ ...current, ...demo }));
      setProjectName(example.title);
      setLoadNonce((value) => value + 1);
      setSaveState('unsaved');
      return true;
    },
    [source, assets, projectName],
  );

  const restoreBackup = useCallback(() => {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (!raw) return false;
      const backup = JSON.parse(raw);
      if (!backup?.source) return false;
      setSource(backup.source);
      setAssets(backup.assets || {});
      setProjectName(backup.projectName || 'Restored Project');
      setLoadNonce((value) => value + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const hasBackup = useMemo(() => {
    try {
      return Boolean(localStorage.getItem(BACKUP_KEY));
    } catch {
      return false;
    }
  }, [loadNonce]);

  const value = useMemo(
    () => ({
      source,
      assets,
      projectName,
      saveState,
      lastSavedAt,
      saveError,
      compilerStatus,
      loadNonce,
      restored: initial.current.restored,
      updateSource,
      updateAssets,
      addAssets,
      removeAsset,
      saveNow,
      setCompilerStatus,
      loadExample,
      restoreBackup,
      hasBackup,
      setProjectName,
    }),
    [
      source,
      assets,
      projectName,
      saveState,
      lastSavedAt,
      saveError,
      compilerStatus,
      loadNonce,
      updateSource,
      updateAssets,
      addAssets,
      removeAsset,
      saveNow,
      setCompilerStatus,
      loadExample,
      restoreBackup,
      hasBackup,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used inside ProjectProvider.');
  return context;
}

export { STORAGE_KEY, BACKUP_KEY };
