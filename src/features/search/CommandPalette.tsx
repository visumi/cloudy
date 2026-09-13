import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Clock3, Command, LoaderCircle, Search, X } from "lucide-react";
import { FallbackImage } from "../items/ItemGraph";
import { EMPTY_CATEGORY_COLOR, getCategoryColorStyle } from "../items/category-colors";
import type { CloudyItem } from "../../types/api";

interface CommandPaletteProps {
  open: boolean;
  items: CloudyItem[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onSelect: (item: CloudyItem) => void;
}

export function CommandPalette({ open, items, isLoading, error, onClose, onRetry, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => rankItems(items, deferredQuery).slice(0, 9), [deferredQuery, items]);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const activeOption = listRef.current?.querySelector<HTMLElement>(`[data-command-index="${activeIndex}"]`);
    if (activeOption && typeof activeOption.scrollIntoView === "function") activeOption.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current + 1) % results.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (event.key === "Home" && results.length) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && results.length) {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      onSelect(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return createPortal((
    <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title" aria-describedby="command-palette-description">
        <div className="command-palette-topline" aria-hidden="true">
          <span className="command-palette-orbit"><Search strokeWidth={2.2} /></span>
          <span className="command-palette-shortcut"><Command strokeWidth={2.2} /><kbd>K</kbd></span>
        </div>
        <div className="command-palette-heading">
          <div>
            <h2 id="command-palette-title">Encontrar na nuvem</h2>
            <p id="command-palette-description">Pesquise por título, categoria ou anotação.</p>
          </div>
          <button className="command-palette-close" type="button" onClick={onClose} aria-label="Fechar busca" title="Fechar busca"><X aria-hidden="true" /></button>
        </div>

        <div className="command-input-wrap">
          <Search className="command-input-icon" aria-hidden="true" strokeWidth={2.1} />
          <input
            ref={inputRef}
            className="command-input"
            type="search"
            value={query}
            placeholder="O que você quer reencontrar?"
            aria-label="Pesquisar referências"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-activedescendant={results[activeIndex] ? `command-result-${results[activeIndex].id}` : undefined}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && <button className="command-input-clear" type="button" onClick={() => setQuery("")} aria-label="Limpar busca" title="Limpar busca"><X aria-hidden="true" /></button>}
          <kbd className="command-input-escape">Esc</kbd>
        </div>

        <div className="command-results" id="command-results" ref={listRef} role="listbox" aria-label={hasQuery ? "Resultados da busca" : "Referências recentes"}>
          {isLoading && <div className="command-state" role="status"><LoaderCircle aria-hidden="true" /><span>Abrindo sua nuvem...</span></div>}
          {!isLoading && error && <div className="command-state command-state--error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>Tentar novamente</button></div>}
          {!isLoading && !error && results.length > 0 && (
            <>
              <div className="command-results-label"><span>{hasQuery ? "Resultados" : "Recentemente salvos"}</span><span>{results.length}{items.length > results.length ? "+" : ""}</span></div>
              {results.map((item, index) => (
                <button
                  className={`command-result${index === activeIndex ? " command-result--active" : ""}`}
                  id={`command-result-${item.id}`}
                  data-command-index={index}
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelect(item)}
                >
                  <FallbackImage src={item.imageUrl || item.faviconUrl} alt="" className="command-result-image" loading="lazy" />
                  <span className="command-result-copy">
                    <strong>{item.name}</strong>
                    <span className="command-result-meta"><span className="command-result-category" style={getCategoryColorStyle(item.category?.color ?? EMPTY_CATEGORY_COLOR)}><span aria-hidden="true" />{item.category?.name ?? "Vazio"}</span>{item.observation && <span className="command-result-observation">{item.observation}</span>}</span>
                  </span>
                  {index === activeIndex ? <ArrowRight className="command-result-arrow" aria-hidden="true" /> : <Clock3 className="command-result-clock" aria-hidden="true" />}
                </button>
              ))}
            </>
          )}
          {!isLoading && !error && results.length === 0 && <div className="command-empty"><span className="command-empty-mark" aria-hidden="true"><Search /></span><strong>{hasQuery ? "Nada apareceu por aqui" : "Sua nuvem ainda está vazia"}</strong><p>{hasQuery ? "Tente outro título, categoria ou termo da anotação." : "Salve uma referência e ela aparecerá aqui."}</p></div>}
        </div>
        <div className="command-footer" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></div>
      </section>
    </div>
  ), document.body);
}

function rankItems(items: CloudyItem[], query: string): CloudyItem[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [...items].sort(compareRecent).slice(0, 9);

  return items
    .map((item, index) => {
      const name = normalize(item.name);
      const category = normalize(item.category?.name ?? "");
      const observation = normalize(item.observation ?? "");
      const url = normalize(item.url ?? "");
      let score = -1;
      if (name === normalizedQuery) score = 100;
      else if (name.startsWith(normalizedQuery)) score = 80;
      else if (name.includes(normalizedQuery)) score = 60;
      else if (category.startsWith(normalizedQuery)) score = 45;
      else if (category.includes(normalizedQuery)) score = 35;
      else if (observation.includes(normalizedQuery)) score = 25;
      else if (url.includes(normalizedQuery)) score = 15;
      return { item, index, score };
    })
    .filter(({ score }) => score >= 0)
    .sort((first, second) => second.score - first.score || compareRecent(first.item, second.item) || first.index - second.index)
    .map(({ item }) => item);
}

function compareRecent(first: CloudyItem, second: CloudyItem): number {
  return second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id);
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}
