import { useCallback, useEffect, useLayoutEffect, useRef, useState } from './preact.js';
import { call } from './api.js';
import { useStore } from './store.js';
import { Spring, prefersReducedMotion } from './spring.js';

/**
 * Fetch from the main process and keep the result fresh.
 *
 * While new data loads, the previous result stays on screen (no flash, no
 * layout jump), and a slow response can never overwrite a newer one. The
 * query re-runs when its parameters change or any data is written.
 */
export function useQuery(method, params = {}, { enabled = true } = {}) {
  const dataVersion = useStore((s) => s.dataVersion);
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const sequence = useRef(0);
  const key = JSON.stringify(params);

  const run = useCallback(() => {
    if (!enabled) return;
    sequence.current += 1;
    const ticket = sequence.current;
    setState((s) => ({ ...s, loading: true }));
    call(method, JSON.parse(key)).then(
      (data) => ticket === sequence.current && setState({ data, error: null, loading: false }),
      (error) => ticket === sequence.current && setState((s) => ({ ...s, error, loading: false })),
    );
  }, [method, key, enabled]);

  useEffect(run, [run, dataVersion]);
  return { ...state, reload: run };
}

/** Pages of a list that grow as the user scrolls. Resets when the query changes. */
export function usePagedQuery(method, params, pageSize = 60) {
  const dataVersion = useStore((s) => s.dataVersion);
  const [state, setState] = useState({ rows: [], summary: null, loading: true, error: null });
  const sequence = useRef(0);
  const loaded = useRef(pageSize);
  const key = JSON.stringify(params);

  const fetchPage = useCallback((limit) => {
    sequence.current += 1;
    const ticket = sequence.current;
    setState((s) => ({ ...s, loading: true }));
    call(method, { ...JSON.parse(key), limit, offset: 0 }).then(
      ({ rows, ...summary }) => {
        if (ticket !== sequence.current) return;
        setState({ rows, summary, loading: false, error: null });
      },
      (error) => ticket === sequence.current && setState((s) => ({ ...s, loading: false, error })),
    );
  }, [method, key]);

  // A new query starts from the first page; a data change refetches what is shown.
  useEffect(() => {
    loaded.current = pageSize;
  }, [key, pageSize]);
  useEffect(() => fetchPage(loaded.current), [fetchPage, dataVersion]);

  const hasMore = state.summary ? state.rows.length < state.summary.count : false;
  const loadMore = useCallback(() => {
    if (!hasMore || state.loading) return;
    loaded.current += pageSize;
    fetchPage(loaded.current);
  }, [hasMore, state.loading, fetchPage, pageSize]);

  return { ...state, hasMore, loadMore };
}

/** Calls `onVisible` when the returned ref's element scrolls into view. */
export function useInView(onVisible) {
  const ref = useRef(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && callback.current(),
      { rootMargin: '300px' });
    observer.observe(element);
    return () => observer.disconnect();
  });
  return ref;
}

/**
 * Drive an element's entrance and exit with a spring.
 *
 * `apply(progress)` writes styles for progress 0 (hidden) to 1 (shown).
 * Returns `close()`, which animates out — from wherever the entrance
 * currently is — and then calls `onClosed`.
 */
export function usePresence(apply, onClosed, { response = 0.34, damping = 1 } = {}) {
  const spring = useRef(null);
  const closing = useRef(false);
  const handlers = useRef({ apply, onClosed });
  handlers.current = { apply, onClosed };

  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    spring.current = new Spring({
      value: 0,
      response: reduced ? 0.18 : response,
      damping,
      onUpdate: (value) => handlers.current.apply(Math.max(0, value), reduced),
      onRest: (value) => {
        if (closing.current && value === 0) handlers.current.onClosed?.();
      },
    });
    handlers.current.apply(0, reduced);
    spring.current.set(1);
    return () => spring.current.stop();
  }, []);

  return useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    spring.current.set(0);
  }, []);
}

/** A number that springs to new values instead of snapping (dashboard figures). */
export function useAnimatedNumber(value, format) {
  const ref = useRef(null);
  const spring = useRef(null);
  const formatter = useRef(format);
  formatter.current = format;

  useLayoutEffect(() => {
    const write = (v) => {
      if (ref.current) ref.current.textContent = formatter.current(v);
    };
    if (!spring.current) {
      spring.current = new Spring({
        value: 0, response: 0.7, damping: 1, precision: Math.max(0.01, Math.abs(value) / 2000), onUpdate: write,
      });
    }
    if (prefersReducedMotion()) spring.current.jump(value);
    else spring.current.set(value);
    write(spring.current.value);
  }, [value]);

  useEffect(() => () => spring.current?.stop(), []);
  return ref;
}

/** Run a handler for a keyboard shortcut while the component is mounted. */
export function useKey(key, handler, { mod = false } = {}) {
  const callback = useRef(handler);
  callback.current = handler;
  useEffect(() => {
    const listener = (event) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (mod !== (event.metaKey || event.ctrlKey)) return;
      callback.current(event);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [key, mod]);
}
