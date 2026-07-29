import { defineTheme } from "@astryxdesign/core/theme";
// Source import (not `/built`): defineTheme composes at runtime and injects the
// resulting tokens. The `/built` package is pre-compiled CSS and cannot be
// extended this way — pairing it with defineTheme silently yields base tokens.
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * Envis command-centre theme.
 *
 * The brand palette (Deep Space Blue, Flag Red, Steel Blue, Papaya Whip) was
 * previously applied as ~75 scattered inline `style={{ color: "#..." }}` props.
 * That fought the design system: components lost their token-driven colours,
 * and structural components with built-in padding got replaced by bare divs to
 * make room for the hand-styling — which is why sidebar headers ended up with
 * no padding at all.
 *
 * Declaring the palette once as theme tokens fixes both problems. Every Astryx
 * component now resolves these colours automatically, so the inline styles are
 * redundant and the layout primitives can be used as intended.
 *
 * Tokens take a [light, dark] tuple. The app runs dark-only (see AstryxProvider)
 * so both entries carry the same value — that keeps the palette correct even if
 * someone later switches the provider to "system".
 */
const DEEP_SPACE = "#001d2e"; // page background
const SURFACE = "#002438"; // panels, cards
const RAISED = "#003049"; // popovers, elevated surfaces
const FLAG_RED = "#c1121f"; // brand accent, destructive
const DEEP_RED = "#780000"; // pressed/darker accent
const STEEL_BLUE = "#669bbc"; // secondary text, icons
const PAPAYA = "#fdf0d5"; // primary text
const MUTED_STEEL = "#4a6573"; // disabled text, borders

const dual = (v: string): [string, string] => [v, v];

export const envisTheme = defineTheme({
  name: "envis",
  extends: neutralTheme,
  tokens: {
    // Surfaces — layered body → surface → raised
    "--color-background-body": dual(DEEP_SPACE),
    "--color-background-surface": dual(SURFACE),
    "--color-background-card": dual(SURFACE),
    "--color-background-popover": dual(RAISED),
    "--color-background-muted": dual(RAISED),

    // Text
    "--color-text-primary": dual(PAPAYA),
    "--color-text-secondary": dual(STEEL_BLUE),
    "--color-text-disabled": dual(MUTED_STEEL),
    "--color-text-accent": dual(FLAG_RED),

    // Icons follow the same hierarchy as text
    "--color-icon-primary": dual(PAPAYA),
    "--color-icon-secondary": dual(STEEL_BLUE),
    "--color-icon-disabled": dual(MUTED_STEEL),
    "--color-icon-accent": dual(FLAG_RED),

    // Interactive accent
    "--color-accent": dual(FLAG_RED),
    "--color-on-accent": dual(PAPAYA),
    "--color-accent-muted": dual("rgba(193, 18, 31, 0.30)"),

    // Borders — kept translucent so panel edges read as separation, not outline
    "--color-border": dual("rgba(102, 155, 188, 0.22)"),
    "--color-border-emphasized": dual(MUTED_STEEL),

    // Status. Error reuses the brand red so alerts stay on-palette.
    "--color-error": dual(FLAG_RED),
    "--color-error-muted": dual("rgba(193, 18, 31, 0.25)"),
    "--color-on-error": dual(PAPAYA),
    "--color-background-error-inverted": dual(DEEP_RED),
  },
});
