import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Fit an entire layout without scrolling or changing its internal geometry. */
export default function ReplayFit({ children, width, height }: {
  children: ReactNode; width: number; height?: number;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;
    const measure = () => setScale(Math.min(1, area.clientWidth / width,
      area.clientHeight / Math.max(1, height ?? content.offsetHeight)));
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [width, height]);
  return <div ref={areaRef} className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
    <div ref={contentRef} style={{ position: 'absolute', left: '50%', top: '50%',
      width, height, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center' }}>
      {children}
    </div>
  </div>;
}
