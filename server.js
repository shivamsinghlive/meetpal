const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai");

loadLocalEnv();

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.post("/api/simulate", upload.single("video"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        error: "Missing OPENAI_API_KEY in your environment.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a video file.",
      });
    }

    const context = req.body.context?.trim();
    const desiredPersonaCount = Number.parseInt(req.body.personaCount || "3", 10);
    const personaCount = Math.max(2, Math.min(6, Number.isNaN(desiredPersonaCount) ? 3 : desiredPersonaCount));

    if (!context) {
      return res.status(400).json({
        error: "Please describe what client angles the simulation should focus on.",
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const transcription = await client.audio.transcriptions.create({
      file: await toFile(req.file.buffer, req.file.originalname, {
        type: req.file.mimetype,
      }),
      model: "gpt-4o-mini-transcribe",
    });

    const transcriptText = typeof transcription === "string" ? transcription : transcription.text;

    const simulationBrief = await createStructuredCompletion(client, {
      schemaName: "simulation_brief",
      schema: buildBriefSchema(personaCount),
      messages: [
        {
          role: "system",
          content:
            "You are a sharp GTM strategist. Read the transcript and produce a JSON brief for simulating multiple client personas. Stay grounded in the transcript. Infer carefully and never invent product facts that are unsupported.",
        },
        {
          role: "user",
          content: [
            `Client simulation focus:\n${context}`,
            `Requested persona count: ${personaCount}`,
            "Return JSON only.",
            `Transcript:\n${transcriptText}`,
          ].join("\n\n"),
        },
      ],
    });

    const personas = await Promise.all(
      simulationBrief.personaSeeds.map((seed, index) =>
        createStructuredCompletion(client, {
          schemaName: `persona_agent_${index + 1}`,
          schema: buildPersonaSchema(),
          messages: [
            {
              role: "system",
              content:
                "You are simulating one client persona. Return JSON only. Stay consistent with the transcript and the persona seed. Sound like a realistic buyer, not a caricature.",
            },
            {
              role: "user",
              content: [
                `Simulation focus:\n${context}`,
                `Shared transcript summary:\n${simulationBrief.transcriptSummary}`,
                `Key client themes:\n${simulationBrief.clientThemes.join(", ")}`,
                `Persona seed:\n${JSON.stringify(seed, null, 2)}`,
                "Create one fully-formed client persona JSON object.",
              ].join("\n\n"),
            },
          ],
        }),
      ),
    );

    const harmonySimulation = await createStructuredCompletion(client, {
      schemaName: "harmony_simulation",
      schema: buildHarmonySchema(),
      messages: [
        {
          role: "system",
          content:
            "You are orchestrating a buyer committee simulation made of several distinct client personas. Return JSON only. Preserve disagreement where it exists, but show how the group evolves toward alignment.",
        },
        {
          role: "user",
          content: [
            `Simulation focus:\n${context}`,
            `Transcript summary:\n${simulationBrief.transcriptSummary}`,
            `Evidence-backed opportunities:\n${simulationBrief.opportunities.join("\n")}`,
            `Evidence-backed risks:\n${simulationBrief.risks.join("\n")}`,
            `Persona outputs:\n${JSON.stringify(personas, null, 2)}`,
            "Create the shared simulation scene and the conversation timeline.",
          ].join("\n\n"),
        },
      ],
    });

    res.json({
      source: {
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
      transcript: transcriptText,
      brief: simulationBrief,
      personas,
      harmony: harmonySimulation,
    });
  } catch (error) {
    const status = error?.status || 500;
    const message =
      error?.error?.message ||
      error?.message ||
      "Something went wrong while building the persona simulation.";

    res.status(status).json({ error: message });
  }
});

app.post("/api/transcribe-timeline", upload.single("video"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({
        error: "Missing OPENAI_API_KEY in your environment.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a video file.",
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const transcription = await client.audio.transcriptions.create({
      file: await toFile(req.file.buffer, req.file.originalname, {
        type: req.file.mimetype,
      }),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    const segments = (transcription.segments || [])
      .map((segment) => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
      }))
      .filter((segment) => segment.text);

    res.json({
      duration: transcription.duration,
      language: transcription.language,
      transcript: transcription.text,
      segments,
    });
  } catch (error) {
    const status = error?.status || 500;
    const message =
      error?.error?.message ||
      error?.message ||
      "Something went wrong while creating the timestamped transcript.";

    res.status(status).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`Persona simulation app listening on http://localhost:${port}`);
});

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function createStructuredCompletion(client, { messages, schemaName, schema }) {
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  const content = completion.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`No content returned for schema ${schemaName}.`);
  }

  return JSON.parse(content);
}

function buildBriefSchema(personaCount) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "transcriptSummary",
      "clientThemes",
      "opportunities",
      "risks",
      "recommendedVisualMood",
      "personaSeeds",
    ],
    properties: {
      title: { type: "string" },
      transcriptSummary: { type: "string" },
      clientThemes: {
        type: "array",
        items: { type: "string" },
      },
      opportunities: {
        type: "array",
        items: { type: "string" },
      },
      risks: {
        type: "array",
        items: { type: "string" },
      },
      recommendedVisualMood: { type: "string" },
      personaSeeds: {
        type: "array",
        minItems: personaCount,
        maxItems: personaCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "segment",
            "role",
            "archetype",
            "buyingStage",
            "coreNeed",
            "hiddenConcern",
            "decisionStyle",
          ],
          properties: {
            name: { type: "string" },
            segment: { type: "string" },
            role: { type: "string" },
            archetype: { type: "string" },
            buyingStage: { type: "string" },
            coreNeed: { type: "string" },
            hiddenConcern: { type: "string" },
            decisionStyle: { type: "string" },
          },
        },
      },
    },
  };
}

function buildPersonaSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "role",
      "archetype",
      "sentiment",
      "energy",
      "goals",
      "objections",
      "questions",
      "persuasionTriggers",
      "dealBreakers",
      "voice",
      "firstReaction",
      "score",
    ],
    properties: {
      name: { type: "string" },
      role: { type: "string" },
      archetype: { type: "string" },
      sentiment: { type: "string" },
      energy: { type: "integer", minimum: 1, maximum: 10 },
      goals: {
        type: "array",
        items: { type: "string" },
      },
      objections: {
        type: "array",
        items: { type: "string" },
      },
      questions: {
        type: "array",
        items: { type: "string" },
      },
      persuasionTriggers: {
        type: "array",
        items: { type: "string" },
      },
      dealBreakers: {
        type: "array",
        items: { type: "string" },
      },
      voice: { type: "string" },
      firstReaction: { type: "string" },
      score: { type: "integer", minimum: 0, maximum: 100 },
    },
  };
}

function buildHarmonySchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "headline",
      "groupSentiment",
      "alignmentScore",
      "tensionAreas",
      "consensusPoints",
      "nextMoves",
      "timeline",
    ],
    properties: {
      headline: { type: "string" },
      groupSentiment: { type: "string" },
      alignmentScore: { type: "integer", minimum: 0, maximum: 100 },
      tensionAreas: {
        type: "array",
        items: { type: "string" },
      },
      consensusPoints: {
        type: "array",
        items: { type: "string" },
      },
      nextMoves: {
        type: "array",
        items: { type: "string" },
      },
      timeline: {
        type: "array",
        minItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["phase", "speaker", "stance", "message"],
          properties: {
            phase: { type: "string" },
            speaker: { type: "string" },
            stance: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
  };
}
