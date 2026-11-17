import type { CSSProperties } from "react";
import sprite from "@vscode/codicons/dist/codicon.svg?url";
import { pathIcons, spriteIcons, type IconName } from "./icons";

export type { IconName };

export default function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {name in pathIcons ? (
        <path d={pathIcons[name as keyof typeof pathIcons]} />
      ) : (
        <use
          href={`${sprite}#${spriteIcons[name as keyof typeof spriteIcons]}`}
        />
      )}
    </svg>
  );
}
