"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures an element so charts can render text at a fixed size while the plot
 * scales. Scaling an SVG viewBox instead would stretch the labels.
 */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = (entry: { width: number; height: number }) => {
      setSize((previous) =>
        Math.abs(previous.width - entry.width) < 0.5 &&
        Math.abs(previous.height - entry.height) < 0.5
          ? previous
          : { width: entry.width, height: entry.height },
      );
    };

    update(node.getBoundingClientRect());

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) update({ width: box.width, height: box.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size } as const;
}
