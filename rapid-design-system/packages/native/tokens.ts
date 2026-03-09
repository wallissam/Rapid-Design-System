// Rapid Design System — React Native Tokens
// AUTO-GENERATED — DO NOT EDIT

export const rapidTokens = {
  colorBrandPrimary: "#0f6cbd",
  colorBrandSecondary: "#115ea3",
  colorBrandTertiary: "#0078d4",
  colorSurfaceBase: "#ffffff",
  colorSurfaceRaised: "#fafafa",
  colorSurfaceOverlay: "#f5f5f5",
  colorSurfaceDisabled: "#f0f0f0",
  colorTextPrimary: "#242424",
  colorTextSecondary: "#616161",
  colorTextDisabled: "#a0a0a0",
  colorTextOnBrand: "#ffffff",
  colorTextLink: "#0f6cbd",
  colorTextLinkHover: "#115ea3",
  colorBorderDefault: "#d1d1d1",
  colorBorderStrong: "#ababab",
  colorFocusRing: "#0f6cbd",
  colorStatusInfo: "#0078d4",
  colorStatusSuccess: "#0e7a0d",
  colorStatusWarning: "#f7630c",
  colorStatusDanger: "#b10e1c",
  spacingXs: "4px",
  spacingSm: "8px",
  spacingMd: "16px",
  spacingLg: "24px",
  spacingXl: "32px",
  spacing2xl: "48px",
  fontFamilyBase: "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', 'Helvetica Neue', sans-serif",
  fontFamilyMono: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  fontSizeXs: "10px",
  fontSizeSm: "12px",
  fontSizeMd: "14px",
  fontSizeLg: "18px",
  fontSizeXl: "24px",
  fontSize2xl: "32px",
  fontWeightRegular: "400",
  fontWeightSemibold: "600",
  fontWeightBold: "700",
  fontLineHeightTight: "1.2",
  fontLineHeightNormal: "1.5",
  fontLineHeightRelaxed: "1.75",
  fontLetterSpacingTight: "-0.02em",
  fontLetterSpacingNormal: "0em",
  fontLetterSpacingWide: "0.05em",
  radiusSm: "2px",
  radiusMd: "4px",
  radiusLg: "8px",
  radiusXl: "12px",
  radiusRound: "9999px",
  borderWidthThin: "1px",
  borderWidthThick: "2px",
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.12)",
  shadowMd: "0 2px 4px rgba(0, 0, 0, 0.14)",
  shadowLg: "0 8px 16px rgba(0, 0, 0, 0.14)",
  focusWidth: "2px",
  focusOffset: "2px",
  opacityDisabled: "0.4",
  opacityHover: "0.9",
  opacitySubtle: "0.7",
  durationFast: "100ms",
  durationNormal: "200ms",
  durationSlow: "400ms",
  zDropdown: "1000",
  zSticky: "1100",
  zOverlay: "1300",
  zModal: "1400",
  zToast: "1500",
} as const;

export const rapidDarkTokens: Partial<typeof rapidTokens> = {
  colorBrandPrimary: "#479ef5",
  colorBrandSecondary: "#62abf5",
  colorBrandTertiary: "#2886de",
  colorSurfaceBase: "#1b1b1b",
  colorSurfaceRaised: "#2d2d2d",
  colorSurfaceOverlay: "#383838",
  colorSurfaceDisabled: "#2a2a2a",
  colorTextPrimary: "#e0e0e0",
  colorTextSecondary: "#adadad",
  colorTextDisabled: "#5c5c5c",
  colorTextOnBrand: "#ffffff",
  colorTextLink: "#479ef5",
  colorTextLinkHover: "#62abf5",
  colorBorderDefault: "#484848",
  colorBorderStrong: "#6a6a6a",
  colorFocusRing: "#479ef5",
  colorStatusInfo: "#479ef5",
  colorStatusSuccess: "#54b054",
  colorStatusWarning: "#f98845",
  colorStatusDanger: "#e34e5e",
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.40)",
  shadowMd: "0 2px 4px rgba(0, 0, 0, 0.44)",
  shadowLg: "0 8px 16px rgba(0, 0, 0, 0.44)",
} as const;

export type RapidTokenKey = keyof typeof rapidTokens;

/**
 * Returns the active token set based on the colour scheme.
 * Usage with React Native:
 *   import { useColorScheme } from "react-native";
 *   const tokens = useRapidTokens(useColorScheme() ?? "light");
 */
export function useRapidTokens(scheme: "light" | "dark"): typeof rapidTokens {
  if (scheme === "dark") {
    return { ...rapidTokens, ...rapidDarkTokens };
  }
  return rapidTokens;
}

