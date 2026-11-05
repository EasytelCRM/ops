import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A note's text, clamped to the line count the stylesheet sets for wherever it is
 * (3 lines on jobs, 6 on the client profile), with "Show more" only where the clamp
 * actually hides something. The single-file app measured this with a sweep over the
 * whole list after each render; here each note measures itself.
 */
export function NoteText({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(true);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // offsetParent is null while the tab is hidden: nothing to measure yet
      if (!el.offsetParent) return;
      if (el.classList.contains('clamp')) setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, clamped]);

  return (
    <>
      <div className={`jn-text${clamped ? ' clamp' : ''}`} ref={ref}>
        {text}
      </div>
      {overflows && (
        <button className="jn-more" onClick={() => setClamped((c) => !c)}>
          {clamped ? 'Show more' : 'Show less'}
        </button>
      )}
    </>
  );
}
