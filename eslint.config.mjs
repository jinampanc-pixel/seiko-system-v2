import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    ".vite-cache/**",
    "next-env.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // These two checks are React-Compiler adoption guidance. Keep them visible
      // while the existing large label components are decomposed, but do not
      // confuse compiler optimization eligibility with runtime correctness.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    files: ["app/orders.tsx"],
    // One pre-consolidation <details defaultOpen> remains in the large OrderSetup
    // component. Keep it visible until that component is split and formatted.
    rules: {
      "react/no-unknown-property": "warn",
    },
  },
  {
    files: ["app/labels/create/page.tsx"],
    // This route intentionally renders the exact supplied business logo asset.
    // Next image optimisation can transform that brand asset, so native <img>
    // is the same deliberate choice already used by the main business header.
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
