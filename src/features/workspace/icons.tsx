import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </Icon>
);

export const NeedleIcon = () => (
  <Icon>
    <path d="M4 20l6-6" />
    <path d="M9 9l6 6" />
    <path d="M14 4l6 6-5 5-6-6z" />
  </Icon>
);

export const HandIcon = () => (
  <Icon>
    <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 15.5a1.6 1.6 0 0 1 2.4-2L8 15" />
  </Icon>
);

export const RotateLeftIcon = () => (
  <Icon>
    <path d="M3 4v6h6" />
    <path d="M3.5 10A9 9 0 1 1 6 17.5" />
  </Icon>
);

export const RotateRightIcon = () => (
  <Icon>
    <path d="M21 4v6h-6" />
    <path d="M20.5 10A9 9 0 1 0 18 17.5" />
  </Icon>
);
