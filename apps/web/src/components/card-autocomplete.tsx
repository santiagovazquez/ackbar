"use client";
import { useEffect, useId, useState } from "react";
import { apiUrl } from "../lib/api";

interface CardSuggestion {
  id: string;
  name: string;
  subtitle?: string | null;
  set_code?: string | null;
  card_number?: string | null;
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
  useEffect(() => {
    if (value.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${apiUrl}/listings/cards/search?q=${encodeURIComponent(value)}`,
          { signal: controller.signal },
        );
        if (response.ok) setSuggestions(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);
  const visibleSuggestions = value.trim().length < 1 ? [] : suggestions;
  function change(nextValue: string) {
    const match = suggestions.find((card) => card.name === nextValue);
    onSelect(
      match
        ? { id: match.id, name: match.name }
        : { id: nextValue.toLowerCase().trim().replaceAll(/\s+/g, "-"), name: nextValue },
    );
  }
  return (
    <>
      <input
        required
        list={listId}
        value={value}
        onChange={(event) => change(event.target.value)}
        placeholder="Luke Skywalker"
      />
      <datalist id={listId}>
        {visibleSuggestions.map((card) => (
          <option key={card.id} value={card.name}>
            {[card.subtitle, card.set_code && `${card.set_code} #${card.card_number}`]
              .filter(Boolean)
              .join(" · ")}
          </option>
        ))}
      </datalist>
    </>
  );
}
