"use client";

import { Theme } from "@astryxdesign/core/theme";
import { envisTheme } from "@/lib/envisTheme";

/**
 * Mounts the Astryx theme at the app root so every component below reads the
 * same token set. Client component because Theme provides React context.
 *
 * Mode is forced "dark": the Envis palette is a high-contrast control-room
 * treatment designed for a dark canvas, and the map style is dark to match.
 * See src/lib/envisTheme.ts for the token definitions.
 */
export default function AstryxProvider({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={envisTheme} mode="dark">
      {children}
    </Theme>
  );
}
