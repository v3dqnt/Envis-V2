"use client";

import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/**
 * Mounts the Astryx theme at the app root so every component below reads the
 * same token set. Client component because Theme provides React context.
 *
 * Mode is forced "dark" because the full palette (Deep Space Blue, Molten Lava,
 * Flag Red, Steel Blue, Papaya Whip) is designed for a high-contrast control-room
 * command center aesthetic. The map layers, sidebar chrome, and all CSS variable
 * overrides assume a dark canvas.
 */
export default function AstryxProvider({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="dark">
      {children}
    </Theme>
  );
}
