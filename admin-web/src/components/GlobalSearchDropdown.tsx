import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2, Users, CheckSquare, UsersRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../core/auth/AuthContext';
import type { SearchResult, SearchResultType } from '../../../shared/types';

const ICONS: Record<SearchResultType, typeof Users> = {
  user: Users,
  task: CheckSquare,
  group: UsersRound,
};

const LABELS: Record<SearchResultType, string> = {
  user: 'Users',
  task: 'Tasks',
  group: 'Groups',
};

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-blue-600">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

export function GlobalSearchDropdown() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);
  const validQuery = debouncedQuery && debouncedQuery.length >= 2;

  useEffect(() => {
    if (!validQuery || !profile) return;
    let cancelled = false;

    const doSearch = async () => {
      setLoading(true);
      setOpen(true);
      const likeQuery = `%${debouncedQuery}%`;

      const [profilesRes, tasksRes, groupsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, email, role')
          .or(`display_name.ilike.${likeQuery},email.ilike.${likeQuery}`)
          .is('deleted_at', null)
          .limit(10),
        supabase
          .from('tasks')
          .select('id, title, description')
          .or(`title.ilike.${likeQuery},description.ilike.${likeQuery}`)
          .limit(5),
        supabase
          .from('groups')
          .select('id, name, description')
          .or(`name.ilike.${likeQuery},description.ilike.${likeQuery}`)
          .limit(5),
      ]);

      if (cancelled) return;
      setLoading(false);

      if (profilesRes.error) console.error('profiles search error:', profilesRes.error);
      if (tasksRes.error) console.error('tasks search error:', tasksRes.error);
      if (groupsRes.error) console.error('groups search error:', groupsRes.error);

      const combined: SearchResult[] = [];

      if (profilesRes.data) {
        for (const p of profilesRes.data) {
          combined.push({
            result_type: 'user',
            result_id: p.id,
            title: p.display_name ?? p.email ?? 'Unknown',
            subtitle: p.email ?? p.display_name ?? '',
            url_path:
              p.role === 'teacher' ? `/teachers` :
              p.role === 'student' ? `/students` :
              p.role === 'coordinator' ? `/coordinators` :
              `/users`,
          });
        }
      }

      if (tasksRes.data) {
        for (const t of tasksRes.data) {
          combined.push({
            result_type: 'task',
            result_id: t.id,
            title: t.title,
            subtitle: t.description ?? '',
            url_path: `/tasks`,
          });
        }
      }

      if (groupsRes.data) {
        for (const g of groupsRes.data) {
          combined.push({
            result_type: 'group',
            result_id: g.id,
            title: g.name,
            subtitle: g.description ?? '',
            url_path: `/groups`,
          });
        }
      }

      setResults(combined);
    };

    doSearch();
    return () => { cancelled = true; };
  }, [debouncedQuery, profile, validQuery]);

  useEffect(() => {
    if (validQuery) return;
    const id = setTimeout(() => {
      setResults([]);
      setLoading(false);
      setOpen(false);
    }, 0);
    return () => clearTimeout(id);
  }, [validQuery]);

  const grouped = useMemo(() => {
    const map = new Map<SearchResultType, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.result_type)) map.set(r.result_type, []);
      map.get(r.result_type)!.push(r);
    }
    return Array.from(map.entries());
  }, [results]);

  const totalCount = results.length;

  const navigateTo = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery('');
      setResults([]);
      navigate(result.url_path);
    },
    [navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((prev) => (prev < totalCount - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((prev) => (prev > 0 ? prev - 1 : totalCount - 1));
      } else if (e.key === 'Enter' && focusedIdx >= 0 && focusedIdx < totalCount) {
        e.preventDefault();
        let idx = 0;
        for (const [, items] of grouped) {
          for (const item of items) {
            if (idx === focusedIdx) { navigateTo(item); return; }
            idx++;
          }
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [open, totalCount, focusedIdx, grouped, navigateTo],
  );

  const handleBlur = useCallback(() => {
    setTimeout(() => setOpen(false), 200);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }, []);

  if (!profile) return null;

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search users, tasks, groups..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setFocusedIdx(-1);
        }}
        onFocus={() => { if (results.length > 0 || loading) setOpen(true); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-72 rounded-xl border border-gray-100 bg-gray-50 py-2 pl-9 pr-9 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-50"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {loading && (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && debouncedQuery.length >= 2 && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No results found for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2">
              {(() => {
                let globalIdx = 0;
                return grouped.map(([type, items]) => (
                  <div key={type}>
                    <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {LABELS[type]}
                    </div>
                    {items.map((item) => {
                      const idx = globalIdx++;
                      const Icon = ICONS[item.result_type];
                      return (
                        <button
                          key={`${item.result_type}-${item.result_id}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); navigateTo(item); }}
                          onMouseEnter={() => setFocusedIdx(idx)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                            idx === focusedIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-gray-900">
                              {highlightMatch(item.title, debouncedQuery)}
                            </div>
                            {item.subtitle && (
                              <div className="truncate text-xs text-gray-500">
                                {highlightMatch(item.subtitle, debouncedQuery)}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
