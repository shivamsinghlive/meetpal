# MeetPal Build Swarm

A live meeting copilot prototype that:

- accepts a video upload
- transcribes the conversation with a configurable speech-to-text provider
- routes technical context to a specialist build swarm
- renders coordinated agent guidance in a visual browser dashboard

## Run it

1. Add your API keys:

```bash
export OPENAI_API_KEY=your_transcription_key_here
export CHAT_API_KEY=your_wandb_or_openai_compatible_chat_key_here
export CHAT_BASE_URL=https://api.inference.wandb.ai/v1
export CHAT_PROJECT=your-team/your-project
export CHAT_MODEL=openai/gpt-oss-120b
```

2. Start the app:

```bash
npm start
```

3. Open [http://localhost:3000](http://localhost:3000)

## Architecture

- `transcription`: OpenAI-compatible speech-to-text, configured separately from chat/orchestration
- `agent reasoning`: W&B Inference via the OpenAI-compatible `CHAT_*` variables
- `observability + evals`: Weave tracing and evaluation logging
- `development loop`: W&B MCP is the intended inspection/debug workflow
- `heavier workloads`: CoreWeave-backed compute is the natural next step for diarization, custom ranking, batch evals, or fine-tuning

## API routes

- `POST /api/build-swarm`
  - runs signal extraction, specialist agents, and a coordinator through W&B Inference
  - returns the signal analysis, specialist outputs, and merged coordinator recommendation
- `POST /api/evals/build-swarm`
  - runs a small routing evaluation dataset through the build swarm
  - logs eval traces/summaries to Weave
- `POST /api/transcribe-timeline`
  - creates a timestamped transcript for uploaded audio/video files

## Notes

- The current transcription endpoint limit is 25 MB per file according to the official OpenAI speech-to-text docs.
- Chat/orchestration runs through W&B Inference by setting `CHAT_BASE_URL`, `CHAT_API_KEY`, `CHAT_PROJECT`, and `CHAT_MODEL`.
- Weave tracing uses `CHAT_PROJECT` by default, or `WEAVE_PROJECT` if you want a separate tracing project.
- The backend will first try structured JSON schema output for orchestration. If the chat model does not support that mode, it falls back to strict JSON prompting automatically.
- The build swarm currently includes specialist agents for Frontend, Backend, ML, LLMOps, and MLOps, plus a coordinator layer.
- This prototype sends the uploaded file directly to the transcription API, then uses structured JSON outputs to create agent recommendations and live orchestration guidance.
- Supported upload types in the UI match the current documented audio transcription formats: `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, and `webm`.
