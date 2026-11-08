# backend-cbt

## Generate question explanations

Run `node explaination.js` from this directory to:

1. Find questions in MongoDB that do not yet have a complete explanation.
2. Generate a detailed, SSS1-friendly explanation with Gemini and save it to each question's `explanation` field.
3. If `ALOC_API_KEY` is configured, continue importing new questions from ALOC and generate their explanations with Gemini as well. ALOC's explanation endpoint is not used.

Configure these values in `backend-cbt/.env`:

```dotenv
DATA_BASE=your-mongodb-connection-string
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.8-flash
ALOC_API_KEY=your-aloc-api-key
```

`ALOC_API_KEY` is optional when you only want to backfill questions already in MongoDB. Questions with existing explanations are skipped. Failed generations are reported and remain eligible for a later run.

## Repair missing question options from source data

The option repair script only fills null or blank option fields when a
non-empty value is present in that question's stored `rawData.options`. It
does not overwrite populated options or invent missing choices. Preview the
repair first, then apply it:

```powershell
npm.cmd run repair-question-options
npm.cmd run repair-question-options -- --apply
```

## Classify question topics and difficulty

The Gemini classifier assigns a concise syllabus topic and an `easy`, `medium`,
or `hard` difficulty, and records confidence/review metadata. It sends up to
100 questions per Gemini request, requires one valid JSON result per exact
`sourceId`, and saves only after the entire response has been validated. It only
processes questions with a missing topic or difficulty. The default run sends
up to one 100-question batch:

```powershell
npm.cmd run classify-questions
```

To classify all remaining questions, explicitly use `-- --all`; the worker
continues to send batches of up to 100 and resumes safely after interruption.
If Gemini rejects a batch, use `-- --all --batch-size=5` to retry with smaller
JSON responses.
To restrict the run to a subject or exam type, add `-- --subject=physics` or
`-- --exam-type=jamb`. Use `-- --limit=200` to send at most two batches.
Gemini API usage may incur charges; check your Google AI plan before running a
large batch.

## Generate missing explanations with Puter

The Puter worker uses the same tutor prompt and output validation as the Gemini
worker, sends one question per request, and saves each successful result
immediately. It only selects questions with neither a detailed nor simplified
explanation, so existing explanation data is not overwritten.

The worker opens Puter's browser sign-in if `PUTER_AUTH_TOKEN` is not set.
Alternatively, add your auth token to `.env` locally; never commit or share it:

```dotenv
PUTER_AUTH_TOKEN=your-puter-auth-token
PUTER_MODEL=gpt-5-nano
```

Run a five-question test first:

```powershell
npm.cmd run explain-missing-puter
```

After reviewing those explanations, process all remaining questions:

```powershell
npm.cmd run explain-missing-puter -- --all
```

You can use `-- --limit=20` to set a batch size, or set
`PUTER_TEST_LIMIT` in `.env` to change the default five-question test limit.
The worker resumes safely on later runs and reports failed questions without
removing them from the remaining queue. Puter requires a user auth token and
applies the signed-in account's usage allowance; free usage may be limited, so
processing every question is not guaranteed to remain free or complete in one
run.

## Generate explanations for existing questions with AI

The resumable MongoDB-only worker is separate from the ALOC importer and does
not call ALOC. It uses the provider adapter in
`services/ai/explanationService.js`; the current adapter requires the Gemini
Developer API and `GEMINI_API_KEY`. Set `GEMINI_MODEL` optionally to select a
supported Gemini model (the default is `gemini-3.8-flash`).

From `backend-cbt`, run the first test with exactly five candidates:

```powershell
$env:TEST_LIMIT = "5"
node scripts\generate-explanations.js
```

The worker defaults to five if `TEST_LIMIT` is unset. Set `TEST_LIMIT=0` only
when you have reviewed the test explanations and explicitly want to process all
remaining questions. Each successful explanation is saved immediately. Failed
questions are logged and remain eligible for a later run; questions with an
existing non-empty `explanation.explanation` are skipped.
