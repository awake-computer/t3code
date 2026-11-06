import { useId, type SVGProps } from "react";

/**
 * Awake's mark, a sunrise window in oak, as Awake's design system draws it. Its colors are the
 * brand's own and stay the same in every theme, as assets/awake/awake-mark.svg has them.
 */
export function AwakeMark(props: SVGProps<SVGSVGElement>) {
  const idPrefix = useId().replaceAll(":", "");
  const windowId = `${idPrefix}-awake-window`;
  const dawnId = `${idPrefix}-awake-dawn`;
  return (
    <svg {...props} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={windowId}>
          <rect width="100" height="100" rx="22" />
        </clipPath>
        <linearGradient id={dawnId} x1="0.281" y1="-0.103" x2="0.719" y2="1.103">
          <stop offset="0" stopColor="#f1c9a3" />
          <stop offset="0.6" stopColor="#d9946a" />
          <stop offset="1" stopColor="#c27a50" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${windowId})`}>
        <rect width="100" height="100" fill="#834a2b" />
        <circle cx="50" cy="91" r="32" fill={`url(#${dawnId})`} />
        <rect x="18" y="66" width="64" height="7" rx="3.5" fill="#fff7ee" fillOpacity="0.9" />
      </g>
    </svg>
  );
}
