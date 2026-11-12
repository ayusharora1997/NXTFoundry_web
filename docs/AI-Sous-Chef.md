# AI sous-chef (reconciliation tool)

The tool's ✦ chips mark where AI helps. They are honest about their state:

| State | What visitors see |
|---|---|
| **Switched off** (no API key) | Dimmed ✦ chips saying **"in training"**. Clicking explains what the feature will do. The product page shows "✦ AI sous-chef: in training". |
| **Switched on** (`ANTHROPIC_API_KEY` set in Vercel) | ✦ **Explain this gap** (dashboard, a vendor with a difference) and ✦ **Read this PDF** (credit mapping, after attaching a PDF) work for real. ✦ *Why this match?* stays "in training". |

Switching on needs no code change or redeploy beyond the env var. Vercel picks it up on the next deployment, and `GET /api/assist` then reports `enabled: true`.

## Turning it on

1. Create an API key at **console.anthropic.com → API keys**. Use a separate workspace for the website if you can.
2. **Set a monthly spend limit for that workspace** in the Console (Limits). This is the hard cost cap.
3. In Vercel, open **Settings → Environment Variables** and add `ANTHROPIC_API_KEY` (Production only, marked **Sensitive**). Then redeploy, or push any commit.
4. On the live site, open the tool and expand a vendor with a difference on the dashboard. **✦ Explain this gap** should now be a solid chip without "in training".

To turn it off, delete the env var and redeploy. The chips go back to "in training".

## What it does

- **Explain this gap:** the dashboard sends the engine's own figures for one vendor and period (closing balances, difference, annexures, adjustments; demo data). Claude writes 2–4 sentences. **The server rejects any explanation that contains a number not in those figures**, so it cannot invent amounts.
- **Read this PDF:** the attached PDF (max 3 MB) goes to Claude, which returns the document type, number, date, parties, GSTINs, the original document referred to, taxable value, GST and total, as schema-checked JSON. The tool shows them **for the user to check**, with an arithmetic check (taxable + GST = total) and a confidence level. Nothing is filled in or saved automatically.

## Safeguards (OWASP Top 10 for LLM applications)

| Risk | Control |
|---|---|
| Prompt injection (LLM01) | PDF text is treated as data; the system prompt tells the model to ignore instructions inside documents. Output is structured JSON only. |
| Sensitive information (LLM02) | Only the demo's figures and the user's own PDF are sent. Nothing is stored by us; the UI says the PDF goes to our AI provider. |
| Improper output handling (LLM05) | Numbers in explanations must match the engine's figures. Extracted fields are only displayed, never applied, and are checked arithmetically. |
| Excessive agency (LLM06) | The AI can't match, post, send or change anything. |
| Unbounded consumption (LLM10) | Origin allowlist; visitor IP required (hashed); 12 requests per visitor per 10 min, per server instance (best effort); input caps (facts 6 KB, PDF 3 MB); short outputs, low effort; **the workspace spend limit in the Anthropic Console is the hard cap.** |
| Supply chain (LLM03) | Official `@anthropic-ai/sdk`, pinned exactly; covered by Dependabot and CI. |

Errors shown to visitors are generic; logs record only categories, never content.

**Model:** `claude-opus-5-5` at low effort, with the server-side refusal fallback on (`fallbacks: "default"`).

## Testing

```bash
npm run test:assist
```

This runs the real function and SDK against a local fake of the Claude API, so no key and no cost. It covers:
- the switched-off state;
- request guards: origin, IP, size, PDF check;
- the exact request sent to Claude;
- the grounding check;
- structured output and the arithmetic check;
- refusals, upstream errors and rate limits.

To try it locally with a real key, add `ANTHROPIC_API_KEY` and `ENQUIRY_ALLOWED_ORIGINS=http://localhost:5173` to `.env.local`, then run `npm run dev`.
