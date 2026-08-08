import { defineTheme } from "@astryxdesign/core/theme";
// Source import (not `/built`): defineTheme composes at runtime and injects the
// resulting tokens. The `/built` package is pre-compiled CSS and cannot be
// extended this way — pairing it with defineTheme silently yields base tokens.
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * Envis command-centre theme — graphite palette.
 *
 * Chrome (panels, text, borders, the general interactive accent) is grey/
 * black/white on purpose: this is a life-safety tool, and burning colour on
 * decoration makes it harder to notice colour used for something that
 * actually matters. Error/destructive states are the one deliberate
 * exception — they stay a real red, the same way the map keeps its
 * hazard-type colour coding (src/components/MapDashboard.tsx) even though
 * everything around it went graphite. Red-for-danger is worth keeping even
 * in an otherwise monochrome UI.
 *
 * Tokens take a [light, dark] tuple. The app runs dark-only (see AstryxProvider)
 * so both entries carry the same value — that keeps the palette correct even if
 * someone later switches the provider to "system".
 */
const NEAR_BLACK = "#0a0a0a"; // page background
const CHARCOAL = "#161616"; // panels, cards
const GRAPHITE = "#212121"; // popovers, elevated surfaces
const OFF_WHITE = "#f2f2f2"; // primary text
const LIGHT_GREY = "#a3a3a3"; // secondary text, icons
const MID_GREY = "#6b6b6b"; // disabled text, borders
const ACCENT = "#e5e5e5"; // interactive accent — near-white, not a hue

// Kept red on purpose — see comment above.
const ERROR_RED = "#c1121f";
const ERROR_RED_DEEP = "#780000";

const dual = (v: string): [string, string] => [v, v];

export const envisTheme = defineTheme({
  name: "envis",
  extends: neutralTheme,
  tokens: {
    // Surfaces — layered body → surface → raised
    "--color-background-body": dual(NEAR_BLACK),
    "--color-background-surface": dual(CHARCOAL),
    "--color-background-card": dual(CHARCOAL),
    "--color-background-popover": dual(GRAPHITE),
    "--color-background-muted": dual(GRAPHITE),

    // Text
    "--color-text-primary": dual(OFF_WHITE),
    "--color-text-secondary": dual(LIGHT_GREY),
    "--color-text-disabled": dual(MID_GREY),
    "--color-text-accent": dual(ACCENT),

    // Icons follow the same hierarchy as text
    "--color-icon-primary": dual(OFF_WHITE),
    "--color-icon-secondary": dual(LIGHT_GREY),
    "--color-icon-disabled": dual(MID_GREY),
    "--color-icon-accent": dual(ACCENT),

    // Interactive accent — graphite, not brand-coloured
    "--color-accent": dual(ACCENT),
    "--color-on-accent": dual(NEAR_BLACK), // dark text/icon on the light accent fill
    "--color-accent-muted": dual("rgba(229, 229, 229, 0.18)"),

    // Borders — kept translucent so panel edges read as separation, not outline
    "--color-border": dual("rgba(255, 255, 255, 0.12)"),
    "--color-border-emphasized": dual(MID_GREY),

    // Status — the one place colour survives, deliberately.
    "--color-error": dual(ERROR_RED),
    "--color-error-muted": dual("rgba(193, 18, 31, 0.25)"),
    "--color-on-error": dual(OFF_WHITE),
    "--color-background-error-inverted": dual(ERROR_RED_DEEP),
  },
});
