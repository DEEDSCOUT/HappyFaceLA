import js from "@eslint/js";
import tseslint from "typescript-eslint";

const payoutTypeScript = [
  "src/lib/artist-payouts/**/*.ts",
  "src/lib/stripe-api-version.ts",
  "functions/internal/artist-payouts.ts",
  "functions/api/internal/artist-payouts/**/*.ts",
  "functions/api/stripe/connect-*.ts",
  "functions/artist/payout-onboarding/**/*.ts",
];

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".wrangler/**"],
  },
  {
    files: payoutTypeScript,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "no-undef": "off",
      "no-control-regex": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
);
