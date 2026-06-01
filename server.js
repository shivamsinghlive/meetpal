const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const { toFile } = require("openai");
const weave = require("weave");
const { EvaluationLogger } = require("weave");

loadLocalEnv();
primeWandbEnv();

const app = express();
const port = process.env.PORT || 3000;
let weaveInitPromise = null;

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
    hasApiKey: Boolean(getTranscriptionApiKey() || getChatApiKey()),
    chatProvider: getChatProviderLabel(),
    hasChatKey: Boolean(getChatApiKey()),
    hasTranscriptionKey: Boolean(getTranscriptionApiKey()),
    hasWeaveProject: Boolean(getWeaveProject()),
  });
});

app.post("/api/build-swarm", async (req, res) => {
  try {
    if (!getChatApiKey()) {
      return res.status(400).json({ error: "Missing W&B / chat API key in your environment." });
    }

    const transcript = req.body.transcript?.trim();
    const context = req.body.context?.trim() || "Live build and orchestration support";

    if (!transcript) {
      return res.status(400).json({ error: "Please provide a transcript chunk or meeting note." });
    }

    await ensureWeave();
    const chatClient = createChatClient();

    const signalAnalysis = await tracedExtractBuildSignals(chatClient, { transcript, context });
    const specialistOutputs = await Promise.all(
      TECHNICAL_AGENTS.map((agent) => tracedRunSpecialistAgent(chatClient, { agent, transcript, context, signalAnalysis })),
    );
    const coordinator = await tracedRunCoordinator(chatClient, {
      transcript,
      context,
      signalAnalysis,
      specialistOutputs,
    });

    res.json({
      source: "wandb-inference",
      weaveProject: getWeaveProject(),
      signalAnalysis,
      specialistOutputs,
      coordinator,
    });
  } catch (error) {
    res.status(error?.status || 500).json({
      error: error?.error?.message || error?.message || "Unable to run the W&B build swarm.",
    });
  }
});

app.post("/api/evals/build-swarm", async (_req, res) => {
  try {
    if (!getChatApiKey()) {
      return res.status(400).json({ error: "Missing W&B / chat API key in your environment." });
    }

    await ensureWeave();
    const chatClient = createChatClient();
    const dataset = getBuildEvalDataset();
    const evalLogger = new EvaluationLogger({
      name: "build-swarm-routing-eval",
      model: getChatModel(),
      dataset: "build-swarm-routing-dataset",
    });

    let primaryCorrect = 0;
    let top2Correct = 0;

    for (const sample of dataset) {
      const signalAnalysis = await tracedExtractBuildSignals(chatClient, {
        transcript: sample.transcript,
        context: sample.context,
      });
      const specialistOutputs = await Promise.all(
        TECHNICAL_AGENTS.map((agent) =>
          tracedRunSpecialistAgent(chatClient, {
            agent,
            transcript: sample.transcript,
            context: sample.context,
            signalAnalysis,
          }),
        ),
      );
      const coordinator = await tracedRunCoordinator(chatClient, {
        transcript: sample.transcript,
        context: sample.context,
        signalAnalysis,
        specialistOutputs,
      });

      const primaryMatch = coordinator.primaryAgent === sample.expectedPrimaryAgent ? 1 : 0;
      const top2Match = coordinator.recommendedAgents.slice(0, 2).includes(sample.expectedPrimaryAgent) ? 1 : 0;
      primaryCorrect += primaryMatch;
      top2Correct += top2Match;

      const prediction = evalLogger.logPrediction(
        {
          scenarioId: sample.id,
          transcript: sample.transcript,
          expectedPrimaryAgent: sample.expectedPrimaryAgent,
        },
        {
          primaryAgent: coordinator.primaryAgent,
          recommendedAgents: coordinator.recommendedAgents,
          signalThemes: signalAnalysis.themes,
        },
      );
      prediction.logScore("primary_agent_match", primaryMatch);
      prediction.logScore("top2_contains_primary", top2Match);
      prediction.finish();
    }

    const summary = {
      totalExamples: dataset.length,
      primaryAgentAccuracy: Number((primaryCorrect / dataset.length).toFixed(3)),
      top2Recall: Number((top2Correct / dataset.length).toFixed(3)),
    };
    await evalLogger.logSummary(summary);

    res.json({
      ok: true,
      weaveProject: getWeaveProject(),
      summary,
      datasetSize: dataset.length,
    });
  } catch (error) {
    res.status(error?.status || 500).json({
      error: error?.error?.message || error?.message || "Unable to run build swarm evals.",
    });
  }
});

app.post("/api/simulate", upload.single("video"), async (req, res) => {
  try {
    if (!getChatApiKey()) {
      return res.status(400).json({
        error: "Missing chat model API key in your environment.",
      });
    }

    if (!getTranscriptionApiKey()) {
      return res.status(400).json({
        error: "Missing transcription API key in your environment.",
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

    const chatClient = createChatClient();
    const transcriptionClient = createTranscriptionClient();

    const transcription = await transcriptionClient.audio.transcriptions.create({
      file: await toFile(req.file.buffer, req.file.originalname, {
        type: req.file.mimetype,
      }),
      model: getTranscriptionModel(),
    });

    const transcriptText = typeof transcription === "string" ? transcription : transcription.text;

    const simulationBrief = await createStructuredCompletion(chatClient, {
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
        createStructuredCompletion(chatClient, {
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

    const harmonySimulation = await createStructuredCompletion(chatClient, {
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
    if (!getTranscriptionApiKey()) {
      return res.status(400).json({
        error: "Missing transcription API key in your environment.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a video file.",
      });
    }

    const client = createTranscriptionClient();

    const transcription = await client.audio.transcriptions.create({
      file: await toFile(req.file.buffer, req.file.originalname, {
        type: req.file.mimetype,
      }),
      model: getTranscriptionModel(),
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

const TECHNICAL_AGENTS = [
  {
    id: "frontend_agent",
    label: "Frontend Agent",
    domain: "frontend",
    bias:
      "Prioritizes interface clarity, responsive experience, accessibility, and the speed at which a user can understand the product.",
    mission:
      "Own the UI layer, interaction model, information hierarchy, and user-facing reliability of the product experience.",
    weights: {
      ui: 1.45,
      ux: 1.4,
      accessibility: 1.35,
      realtime: 1.1,
      performance: 1.05,
      llmops: 0.65,
      infrastructure: 0.5,
      api: 0.7,
    },
  },
  {
    id: "backend_agent",
    label: "Backend Agent",
    domain: "backend",
    bias:
      "Optimizes for API contracts, service boundaries, latency, fault tolerance, and secure systems integration.",
    mission:
      "Own the services, data flow, integrations, authentication, and runtime behavior required to make the system dependable.",
    weights: {
      api: 1.45,
      infrastructure: 1.25,
      security: 1.2,
      performance: 1.15,
      deployment: 1,
      realtime: 1.1,
      data: 0.95,
      observability: 0.8,
    },
  },
  {
    id: "ml_agent",
    label: "ML Agent",
    domain: "ml",
    bias:
      "Looks for model quality, signal quality, training data fit, inference behavior, and how well the system learns from examples.",
    mission:
      "Own model reasoning quality, ranking logic, adaptation strategies, and how ML components improve outcome quality over time.",
    weights: {
      ml: 1.5,
      data: 1.2,
      evaluation: 1.15,
      performance: 0.9,
      realtime: 0.8,
      observability: 0.8,
      llmops: 0.95,
    },
  },
  {
    id: "llmops_agent",
    label: "LLMOps Agent",
    domain: "llmops",
    bias:
      "Cares about prompts, agent orchestration, tracing, safety, latency, cost, and how agent workflows are monitored and improved.",
    mission:
      "Own the agent system itself: prompt quality, orchestration, model selection, traces, eval loops, and operational guardrails.",
    weights: {
      llmops: 1.5,
      observability: 1.2,
      evaluation: 1.25,
      realtime: 1,
      ml: 0.9,
      deployment: 0.9,
      api: 0.7,
      security: 0.75,
    },
  },
  {
    id: "mlops_agent",
    label: "MLOps Agent",
    domain: "mlops",
    bias:
      "Focuses on pipelines, infra, reproducibility, deployability, and operationalizing models on reliable compute.",
    mission:
      "Own serving, evaluation pipelines, deployment automation, infrastructure readiness, and scale-out paths to CoreWeave-backed compute.",
    weights: {
      deployment: 1.4,
      infrastructure: 1.25,
      observability: 1.05,
      performance: 1,
      data: 0.9,
      evaluation: 0.95,
      realtime: 0.8,
      security: 0.75,
    },
  },
];

const TECHNICAL_SIGNALS = [
  "ui",
  "ux",
  "accessibility",
  "api",
  "infrastructure",
  "performance",
  "security",
  "data",
  "ml",
  "llmops",
  "observability",
  "evaluation",
  "deployment",
  "realtime",
];

function primeWandbEnv() {
  if (!process.env.WANDB_API_KEY && process.env.CHAT_API_KEY) {
    process.env.WANDB_API_KEY = process.env.CHAT_API_KEY;
  }

  const weaveProject = getWeaveProject();
  if (!weaveProject) {
    return;
  }

  const [entity, project] = weaveProject.split("/");
  if (entity && project) {
    if (!process.env.WANDB_ENTITY) {
      process.env.WANDB_ENTITY = entity;
    }

    if (!process.env.WANDB_PROJECT) {
      process.env.WANDB_PROJECT = project;
    }
  } else if (!process.env.WANDB_PROJECT) {
    process.env.WANDB_PROJECT = weaveProject;
  }
}

function getWeaveProject() {
  return process.env.WEAVE_PROJECT || process.env.CHAT_PROJECT || process.env.WANDB_PROJECT || "";
}

async function ensureWeave() {
  if (weaveInitPromise) {
    return weaveInitPromise;
  }

  if (!process.env.WANDB_API_KEY) {
    throw new Error("Missing WANDB_API_KEY. Set CHAT_API_KEY or WANDB_API_KEY to enable Weave tracing.");
  }

  const projectName = getWeaveProject();
  if (!projectName) {
    throw new Error("Missing W&B project. Set CHAT_PROJECT or WEAVE_PROJECT to enable Weave tracing.");
  }

  weaveInitPromise = weave.init(projectName).catch((error) => {
    weaveInitPromise = null;
    throw error;
  });

  return weaveInitPromise;
}

function computeWeightedAgentScores(signalStrengths = {}) {
  return TECHNICAL_AGENTS.map((agent) => {
    const breakdown = Object.entries(agent.weights)
      .map(([signal, weight]) => {
        const strength = Number(signalStrengths[signal] || 0);
        return {
          signal,
          weight,
          strength,
          contribution: Number((weight * strength).toFixed(2)),
        };
      })
      .filter((entry) => entry.strength > 0)
      .sort((left, right) => right.contribution - left.contribution);

    const totalScore = breakdown.reduce((sum, entry) => sum + entry.contribution, 0);

    return {
      agentId: agent.id,
      label: agent.label,
      domain: agent.domain,
      score: Number(totalScore.toFixed(2)),
      topSignals: breakdown.slice(0, 3).map((entry) => entry.signal),
      breakdown,
    };
  }).sort((left, right) => right.score - left.score);
}

function getAgentRoutingPreview(agentId, weightedScores = []) {
  return (
    weightedScores.find((entry) => entry.agentId === agentId) || {
      agentId,
      label: TECHNICAL_AGENTS.find((agent) => agent.id === agentId)?.label || agentId,
      domain: TECHNICAL_AGENTS.find((agent) => agent.id === agentId)?.domain || agentId,
      score: 0,
      topSignals: [],
      breakdown: [],
    }
  );
}

function buildSignalSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "themes", "riskLevel", "recommendedPrimaryDomain", "signalStrengths"],
    properties: {
      summary: { type: "string" },
      themes: {
        type: "array",
        items: { type: "string" },
      },
      riskLevel: {
        type: "string",
        enum: ["low", "moderate", "high"],
      },
      recommendedPrimaryDomain: {
        type: "string",
        enum: TECHNICAL_AGENTS.map((agent) => agent.domain),
      },
      signalStrengths: {
        type: "object",
        additionalProperties: false,
        required: TECHNICAL_SIGNALS,
        properties: Object.fromEntries(
          TECHNICAL_SIGNALS.map((signal) => [
            signal,
            { type: "integer", minimum: 0, maximum: 5 },
          ]),
        ),
      },
    },
  };
}

function buildSpecialistSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "agentId",
      "label",
      "shouldJoin",
      "confidence",
      "priority",
      "reasoning",
      "brief",
      "contribution",
      "nextAction",
      "watchouts",
      "focusSignals",
    ],
    properties: {
      agentId: {
        type: "string",
        enum: TECHNICAL_AGENTS.map((agent) => agent.id),
      },
      label: {
        type: "string",
        enum: TECHNICAL_AGENTS.map((agent) => agent.label),
      },
      shouldJoin: { type: "boolean" },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      priority: { type: "integer", minimum: 1, maximum: 5 },
      reasoning: { type: "string" },
      brief: { type: "string" },
      contribution: { type: "string" },
      nextAction: { type: "string" },
      watchouts: {
        type: "array",
        items: { type: "string" },
      },
      focusSignals: {
        type: "array",
        items: {
          type: "string",
          enum: TECHNICAL_SIGNALS,
        },
      },
    },
  };
}

function buildCoordinatorSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "primaryAgent",
      "recommendedAgents",
      "joinOrder",
      "swarmSummary",
      "nextBestAction",
      "handoffPlan",
      "meetingRisk",
      "whyNow",
    ],
    properties: {
      primaryAgent: {
        type: "string",
        enum: TECHNICAL_AGENTS.map((agent) => agent.label),
      },
      recommendedAgents: {
        type: "array",
        minItems: 1,
        maxItems: TECHNICAL_AGENTS.length,
        items: {
          type: "string",
          enum: TECHNICAL_AGENTS.map((agent) => agent.label),
        },
      },
      joinOrder: {
        type: "array",
        minItems: 1,
        maxItems: TECHNICAL_AGENTS.length,
        items: {
          type: "string",
          enum: TECHNICAL_AGENTS.map((agent) => agent.label),
        },
      },
      swarmSummary: { type: "string" },
      nextBestAction: { type: "string" },
      handoffPlan: { type: "string" },
      meetingRisk: {
        type: "string",
        enum: ["low", "moderate", "high"],
      },
      whyNow: { type: "string" },
    },
  };
}

const tracedExtractBuildSignals = weave.op(async function tracedExtractBuildSignals(chatClient, { transcript, context }) {
  const signalAnalysis = await createStructuredCompletion(chatClient, {
    schemaName: "build_swarm_signal_analysis",
    schema: buildSignalSchema(),
    messages: [
      {
        role: "system",
        content: [
          "You are the signal extraction layer for a technical multi-agent build copilot.",
          "Read the transcript and convert it into normalized build signals.",
          "Stay grounded in the transcript. Do not invent missing requirements.",
          "Return JSON only.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Meeting context:\n${context}`,
          `Available specialist domains:\n${TECHNICAL_AGENTS.map((agent) => `${agent.domain}: ${agent.mission}`).join("\n")}`,
          `Transcript chunk:\n${transcript}`,
        ].join("\n\n"),
      },
    ],
  });

  const weightedScores = computeWeightedAgentScores(signalAnalysis.signalStrengths);

  return {
    ...signalAnalysis,
    weightedScores,
    recommendedPrimaryDomain:
      signalAnalysis.recommendedPrimaryDomain || weightedScores[0]?.domain || "llmops",
  };
});

const tracedRunSpecialistAgent = weave.op(
  async function tracedRunSpecialistAgent(chatClient, { agent, transcript, context, signalAnalysis }) {
    const routingPreview = getAgentRoutingPreview(agent.id, signalAnalysis.weightedScores);

    const specialist = await createStructuredCompletion(chatClient, {
      schemaName: `${agent.id}_specialist_response`,
      schema: buildSpecialistSchema(),
      messages: [
        {
          role: "system",
          content: [
            `You are ${agent.label}.`,
            agent.bias,
            agent.mission,
            "You are part of a coordinated technical build swarm.",
            "Decide whether you should actively join this meeting, what brief you need, and what contribution you would make right now.",
            "Return JSON only.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Meeting context:\n${context}`,
            `Transcript chunk:\n${transcript}`,
            `Signal analysis:\n${JSON.stringify(signalAnalysis, null, 2)}`,
            `Weighted routing preview for you:\n${JSON.stringify(routingPreview, null, 2)}`,
          ].join("\n\n"),
        },
      ],
    });

    return {
      ...specialist,
      routingPreview,
    };
  },
);

const tracedRunCoordinator = weave.op(
  async function tracedRunCoordinator(chatClient, { transcript, context, signalAnalysis, specialistOutputs }) {
    return createStructuredCompletion(chatClient, {
      schemaName: "build_swarm_coordinator",
      schema: buildCoordinatorSchema(),
      messages: [
        {
          role: "system",
          content: [
            "You are the coordinator for a technical multi-agent build swarm.",
            "You review transcript evidence, signal extraction, and specialist agent recommendations.",
            "Choose the best agents to join, decide the primary owner, and explain the immediate next move.",
            "Return JSON only.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Meeting context:\n${context}`,
            `Transcript chunk:\n${transcript}`,
            `Signal analysis:\n${JSON.stringify(signalAnalysis, null, 2)}`,
            `Specialist outputs:\n${JSON.stringify(specialistOutputs, null, 2)}`,
          ].join("\n\n"),
        },
      ],
    });
  },
);

function getBuildEvalDataset() {
  return [
    {
      id: "ui-realtime-layout",
      context: "Hackathon build review",
      transcript:
        "The call view feels cramped on laptops, the sidebar overwhelms the screen, and we need the video surface to stretch fluidly while the transcript can collapse and come back on demand.",
      expectedPrimaryAgent: "Frontend Agent",
    },
    {
      id: "backend-meet-audio",
      context: "Meeting integration design",
      transcript:
        "Google Meet needs to load inside the app, but the bigger issue is reliably routing meeting state, capturing long-lived session events, and keeping the API stable while we ingest real-time transcript chunks.",
      expectedPrimaryAgent: "Backend Agent",
    },
    {
      id: "ml-routing-quality",
      context: "Swarm decision tuning",
      transcript:
        "Our agent recommendation quality is noisy. We need a better ranking model for who should join, probably using transcript features, confidence calibration, and a dataset of correct join decisions.",
      expectedPrimaryAgent: "ML Agent",
    },
    {
      id: "llmops-traces-evals",
      context: "Sponsor tool integration",
      transcript:
        "We need every orchestration step traced in Weave, prompts versioned, evals logged, and a clear coordinator-worker story for the judges so we can show why each agent spoke.",
      expectedPrimaryAgent: "LLMOps Agent",
    },
    {
      id: "mlops-deploy-scale",
      context: "CoreWeave production path",
      transcript:
        "If this works, we want a serving path on CoreWeave, reproducible deployments, evaluation jobs running in batch, and infrastructure that can scale beyond the hosted prototype.",
      expectedPrimaryAgent: "MLOps Agent",
    },
    {
      id: "frontend-accessibility-polish",
      context: "Pre-demo polish",
      transcript:
        "The transcript toggle is too hidden, keyboard resizing needs to feel better, and we should improve color contrast so the live agent panel is easier to parse on stage.",
      expectedPrimaryAgent: "Frontend Agent",
    },
    {
      id: "backend-security-integration",
      context: "API hardening",
      transcript:
        "We are passing provider keys around loosely, the health route should reflect provider state safely, and the service layer needs a clearer split between transcription and orchestration backends.",
      expectedPrimaryAgent: "Backend Agent",
    },
    {
      id: "llmops-online-monitoring",
      context: "Operational readiness",
      transcript:
        "We need online monitors for drift, route-quality regressions, and a reproducible way to compare orchestrator behavior across versions before demo day.",
      expectedPrimaryAgent: "LLMOps Agent",
    },
  ];
}

async function createStructuredCompletion(client, { messages, schemaName, schema }) {
  const model = getChatModel();

  try {
    const completion = await client.chat.completions.create({
      model,
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
  } catch (error) {
    const fallbackCompletion = await client.chat.completions.create({
      model,
      messages: [
        ...messages,
        {
          role: "system",
          content: [
            "Return only valid JSON.",
            `Use this JSON Schema exactly:\n${JSON.stringify(schema)}`,
          ].join("\n\n"),
        },
      ],
    });

    const content = fallbackCompletion.choices?.[0]?.message?.content;

    if (!content) {
      throw error;
    }

    return JSON.parse(extractJsonObject(content));
  }
}

function createChatClient() {
  const client = new OpenAI({
    apiKey: getChatApiKey(),
    baseURL: process.env.CHAT_BASE_URL || process.env.OPENAI_BASE_URL,
    project: process.env.CHAT_PROJECT || process.env.OPENAI_PROJECT,
  });

  return getWeaveProject() ? weave.wrapOpenAI(client) : client;
}

function createTranscriptionClient() {
  return new OpenAI({
    apiKey: getTranscriptionApiKey(),
    baseURL: process.env.TRANSCRIPTION_BASE_URL,
    project: process.env.TRANSCRIPTION_PROJECT,
  });
}

function getChatApiKey() {
  return process.env.CHAT_API_KEY || process.env.WANDB_API_KEY || process.env.OPENAI_API_KEY;
}

function getTranscriptionApiKey() {
  return process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY || process.env.CHAT_API_KEY;
}

function getChatModel() {
  return process.env.CHAT_MODEL || "gpt-4o-mini";
}

function getTranscriptionModel() {
  return process.env.TRANSCRIPTION_MODEL || "whisper-1";
}

function getChatProviderLabel() {
  if ((process.env.CHAT_BASE_URL || "").includes("wandb.ai")) {
    return "Weights & Biases Inference";
  }

  return "OpenAI-compatible";
}

function extractJsonObject(content) {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("Model response did not include a JSON object.");
  }

  return match[0];
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
