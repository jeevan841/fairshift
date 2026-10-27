# FairShift

[MIT licensed](LICENSE). Fair shifts, clear pay and anonymous safety reporting for shift workers (UN SDG 8),
powered by **NVIDIA Nemotron on Nebius Token Factory**.
One codebase, two sector presets (construction site, college campus), two interfaces (Worker, Admin).

## How Nemotron and Nebius are used
| Feature | Model tier | What it does |
|---|---|---|
| Payslip explainer | Nemotron Nano (fast) | Explains pay in simple Hindi, Tamil or English, read aloud on the phone |
| Report triage agent | Nemotron Nano (fast) | Reads each anonymous report (text only, never the sender), sets severity, summarises and suggests a next step |
| Admin insight | Nemotron Super (strong) | Turns aggregated fatigue and overtime data (no names) into 3 plain-language actions |

Calls use Token Factory's OpenAI-compatible API (`https://api.tokenfactory.nebius.com/v1`). Fast, cheap calls handle
everyday traffic and the larger model is used only for the admin summary. Results are cached, and every AI feature has a deterministic fallback
so the app still works if the API is unavailable. Report text is treated as untrusted input in the prompt.

## Other features
Shift check-in/out with automatic overtime, fatigue alerts (>48 h/week, >12 h shift, <10 h rest), quit-risk score,
report status tracking by anonymous code, CSV export, English / Hindi / Tamil UI, large tap targets and keyboard navigation.

## Run locally
    cp .env.example .env      # add your NEBIUS_API_KEY (create one at tokenfactory.nebius.com)
    export $(grep -v '^#' .env | xargs)
    npm install && npm start  # http://localhost:8080
    npm test

Without `NEBIUS_API_KEY` the app runs in fallback mode. `GET /api/ai/status` shows whether Nemotron is live.
Admin PIN comes from `ADMIN_PIN` (demo fallback `demo-admin`; set your own when deploying).

## Deploy (Google Cloud Run)
    gcloud run deploy fairshift --source . --region asia-south1 --allow-unauthenticated \
      --set-env-vars ADMIN_PIN=<pin>,NEBIUS_API_KEY=<key>

## Industry use cases
- **Construction:** daily-wage workers verify hours and overtime and flag hazards without fear of being identified.
- **College:** facility and hostel staff see pay clearly and report issues; admins spot overworked teams early.

## What was added for this hackathon
FairShift started as a workplace-fairness prototype (shift tracking, payslips, anonymous reports, dashboard). For the
Nebius x NVIDIA hackathon we added the whole AI layer (`src/ai.js`): Nemotron payslip explanations in local languages,
the report-triage agent, the admin insight summary, caching, fallbacks, UI wiring and the tests in `test/ai.test.js`.

## Notes
Data is in-memory for the demo; swap the arrays in `createApp` for a database to persist. Business rules live in
`src/rules.js` (pure, unit-tested).
