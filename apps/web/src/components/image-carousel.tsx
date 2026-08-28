"use client";

import { useRef, useState } from "react";

export function ImageCarousel({ urls }: { urls: string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  function goTo(index: number) {
    trackRef.current?.scrollTo({
      left: index * trackRef.current.clientWidth,
      behavior: "smooth",
    });
  }

  return (
    <section className="image-carousel" aria-label="Imágenes de la publicación">
      <div
        ref={trackRef}
        className="image-carousel-track"
        onScroll={(event) => {
          const track = event.currentTarget;
          setCurrent(Math.round(track.scrollLeft / track.clientWidth));
        }}
      >
        {urls.map((url, index) => (
          <div className="image-carousel-slide" key={url}>
            <img
              src={url}
              alt={`Cartas de la publicación ${index + 1}`}
              loading={index === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {urls.length > 1 && (
        <>
          {current > 0 && (
            <button
              className="image-carousel-arrow previous"
              type="button"
              aria-label="Imagen anterior"
              onClick={() => goTo(current - 1)}
            >
              ‹
            </button>
          )}
          {current < urls.length - 1 && (
            <button
              className="image-carousel-arrow next"
              type="button"
              aria-label="Imagen siguiente"
              onClick={() => goTo(current + 1)}
            >
              ›
            </button>
          )}
          <div
            className="image-carousel-dots"
            aria-label={`Imagen ${current + 1} de ${urls.length}`}
          >
            {urls.map((url, index) => (
              <button
                key={url}
                type="button"
                className={index === current ? "active" : ""}
                aria-label={`Ver imagen ${index + 1}`}
                aria-current={index === current ? "true" : undefined}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
