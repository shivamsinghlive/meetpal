# Client Persona Simulation Studio

A small prototype that:

- accepts a video upload
- transcribes the conversation with OpenAI speech-to-text
- generates multiple buyer/client personas as distinct simulated agents
- renders their coordinated reactions in a visual browser dashboard

## Run it

1. Add your API key:

```bash
export OPENAI_API_KEY=your_key_here
```

2. Start the app:

```bash
npm start
```

3. Open [http://localhost:3000](http://localhost:3000)

## Notes

- The current transcription endpoint limit is 25 MB per file according to the official OpenAI speech-to-text docs.
- This prototype sends the uploaded file directly to the transcription API, then uses structured JSON outputs to create persona agents and a harmony timeline.
- Supported upload types in the UI match the current documented audio transcription formats: `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, and `webm`.
