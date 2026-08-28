"use client";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { apiUrl } from "../lib/api";

interface CardSuggestion {
  id: string;
  name: string;
  subtitle?: string | null;
  set_code?: string | null;
  card_number?: string | null;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const matchIndex = text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());
  if (matchIndex === -1 || !query.trim()) return text;
  const matchEnd = matchIndex + query.trim().length;
  return (
    <Fragment>
      {text.slice(0, matchIndex)}
      <mark>{text.slice(matchIndex, matchEnd)}</mark>
      {text.slice(matchEnd)}
    </Fragment>
  );
}

export function CardAutocomplete({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (card: { id: string; name: string }) => void;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedCard, setSelectedCard] = useState<CardSuggestion | null>(null);
  const selectedValue = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (!query) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    if (query === selectedValue.current) {
      selectedValue.current = null;
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${apiUrl}/listings/cards/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Card search failed");
        const results = (await response.json()) as CardSuggestion[];
        setSuggestions(results.slice(0, 3));
        setIsOpen(true);
        setActiveIndex(-1);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
          setIsOpen(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  function change(nextValue: string) {
    selectedValue.current = null;
    setSelectedCard(null);
    onSelect({
      id: nextValue.toLowerCase().trim().replaceAll(/\s+/g, "-"),
      name: nextValue,
    });
  }

  function select(card: CardSuggestion) {
    selectedValue.current = card.name.trim();
    setSelectedCard(card);
    onSelect({ id: card.id, name: card.name });
    setIsOpen(false);
    setActiveIndex(-1);
  }

  const visibleSuggestions = isOpen ? suggestions : [];

  return (
    <div className="card-autocomplete">
      <input
        required
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={visibleSuggestions.length > 0}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => change(event.target.value)}
        onFocus={() => value.trim() && setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (!visibleSuggestions.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % visibleSuggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) =>
              current <= 0 ? visibleSuggestions.length - 1 : current - 1,
            );
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            select(visibleSuggestions[activeIndex]!);
          } else if (event.key === "Escape") {
            setIsOpen(false);
            setActiveIndex(-1);
          }
        }}
        placeholder="Luke Skywalker"
      />
      {selectedCard && (
        <small className="selected-card-details">
          {selectedCard.subtitle && <span>{selectedCard.subtitle}</span>}
          {selectedCard.set_code && (
            <span>
              {selectedCard.set_code}
              {selectedCard.card_number && ` #${selectedCard.card_number}`}
            </span>
          )}
        </small>
      )}
      {visibleSuggestions.length > 0 && (
        <ul className="autocomplete-results" id={listId} role="listbox">
          {visibleSuggestions.map((card, index) => {
            const details = [
              card.subtitle,
              card.set_code && `${card.set_code}${card.card_number ? ` #${card.card_number}` : ""}`,
            ].filter((detail): detail is string => Boolean(detail));

            return (
              <li
                className={index === activeIndex ? "active" : undefined}
                id={`${listId}-${index}`}
                key={card.id}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(card)}
              >
                <span>
                  <HighlightedText text={card.name} query={value} />
                </span>
                {details.length > 0 && (
                  <small>
                    {details.map((detail, detailIndex) => (
                      <Fragment key={`${detail}-${detailIndex}`}>
                        {detailIndex > 0 && " · "}
                        <HighlightedText text={detail} query={value} />
                      </Fragment>
                    ))}
                  </small>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
