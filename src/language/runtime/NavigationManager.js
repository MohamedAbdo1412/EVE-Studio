/**
 * A page navigation history stack. Only one page is active at a time. Runtime
 * variables are owned by RuntimeState and therefore survive navigation.
 */
export class NavigationManager {
  constructor(scene, initialPage) {
    this.pages = new Map();
    this.activePage = null;
    this.history = [];
    this.listeners = new Set();
    this.configure(scene, { initialPage, reset: true });
  }

  configure(scene, { initialPage, reset = false } = {}) {
    if (!scene) return;
    this.pages = new Map(scene.pages.map((page) => [page.id, page]));
    const target =
      (initialPage && this.pages.has(initialPage) && initialPage) ||
      (scene.initialPage && this.pages.has(scene.initialPage) && scene.initialPage) ||
      scene.pages[0]?.id ||
      null;
    if (reset || !this.activePage || !this.pages.has(this.activePage)) {
      this.activePage = target;
      this.history = [];
    } else {
      this.history = this.history.filter((pageId) => this.pages.has(pageId));
    }
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this.snapshot());
  }

  hasPage(pageId) {
    return this.pages.has(pageId);
  }

  getPage(pageId = this.activePage) {
    return this.pages.get(pageId) || null;
  }

  navigate(pageId) {
    if (!this.pages.has(pageId)) {
      return { ok: false, changed: false, reason: `Navigation target "${pageId}" does not exist.` };
    }
    if (pageId === this.activePage) {
      return { ok: true, changed: false, pageId };
    }
    if (this.activePage) this.history.push(this.activePage);
    this.activePage = pageId;
    this.emit();
    return { ok: true, changed: true, pageId };
  }

  back() {
    if (this.history.length === 0) {
      return { ok: true, changed: false, reason: 'Navigation history is empty.' };
    }
    const pageId = this.history.pop();
    if (!this.pages.has(pageId)) return this.back();
    this.activePage = pageId;
    this.emit();
    return { ok: true, changed: true, pageId };
  }

  reset(initialPage) {
    const target =
      (initialPage && this.pages.has(initialPage) && initialPage) ||
      this.pages.values().next().value?.id ||
      null;
    this.activePage = target;
    this.history = [];
    this.emit();
    return target;
  }

  canGoBack() {
    return this.history.length > 0;
  }

  breadcrumb() {
    const ids = [...this.history, this.activePage].filter(Boolean);
    return ids.map((id) => {
      const page = this.pages.get(id);
      return { id, title: page?.title || id };
    });
  }

  snapshot() {
    return {
      activePage: this.activePage,
      history: [...this.history],
      canGoBack: this.canGoBack(),
      breadcrumb: this.breadcrumb(),
    };
  }
}
