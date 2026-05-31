const videoInput = document.getElementById("videoInput");
const appGrid = document.getElementById("appGrid");
const setupPanel = document.getElementById("setupPanel");
const workspacePanel = document.getElementById("workspacePanel");
const backToHomeButton = document.getElementById("backToHomeButton");
const meetUrlInput = document.getElementById("meetUrlInput");
const meetingUrlLabel = document.getElementById("meetingUrlLabel");
const openMeetButton = document.getElementById("openMeetButton");
const meetStatus = document.getElementById("meetStatus");
const healthBadge = document.getElementById("healthBadge");
const statusText = document.getElementById("statusText");
const videoPreview = document.getElementById("videoPreview");
const callFrame = document.getElementById("callFrame");
const callEmptyState = document.getElementById("callEmptyState");
const callColumn = document.querySelector(".call-column");
const workspaceGrid = document.querySelector(".workspace-grid");
const workspaceSplitter = document.getElementById("workspaceSplitter");
const toggleCallFocusButton = document.getElementById("toggleCallFocusButton");
const toggleTranscriptFocusButton = document.getElementById("toggleTranscriptFocusButton");
const liveTranscriptInput = document.getElementById("liveTranscriptInput");
const processTranscriptButton = document.getElementById("processTranscriptButton");
const startRealtimeButton = document.getElementById("startRealtimeButton");
const stopRealtimeButton = document.getElementById("stopRealtimeButton");
const loadDemoTranscriptButton = document.getElementById("loadDemoTranscriptButton");
const realtimeStatus = document.getElementById("realtimeStatus");
const playbackSyncLabel = document.getElementById("playbackSyncLabel");
const activeTranscriptExcerpt = document.getElementById("activeTranscriptExcerpt");
const orchestrationMode = document.getElementById("orchestrationMode");
const leadAgentName = document.getElementById("leadAgentName");
const leadAgentReason = document.getElementById("leadAgentReason");
const swarmConfidence = document.getElementById("swarmConfidence");
const orchestrationSummary = document.getElementById("orchestrationSummary");
const detectedThemes = document.getElementById("detectedThemes");
const handoffList = document.getElementById("handoffList");
const riskLevel = document.getElementById("riskLevel");
const momentumLevel = document.getElementById("momentumLevel");
const analysisSummary = document.getElementById("analysisSummary");
const analysisAlerts = document.getElementById("analysisAlerts");
const selectedAgentConsole = document.getElementById("selectedAgentConsole");
const joinRecommendations = document.getElementById("joinRecommendations");
const joinedAgents = document.getElementById("joinedAgents");
const employeeAgentGrid = document.getElementById("employeeAgentGrid");

const API_BASE = window.location.protocol === "file:" ? "http://localhost:3000" : "";
const DEFAULT_MEET_STATUS = "Pick a meeting source to continue";
const employeeAgents = [
  {
    id: "sales",
    name: "Maya Chen",
    title: "Sales Lead",
    domain: "Sales",
    bias: "Leans toward urgency, deal velocity, pricing flexibility, and closing signals.",
    weights: { pricing: 1.4, urgency: 1.35, expansion: 1.15, objections: 1.1, risk: 0.8, marketing: 0.7, operations: 0.65 },
  },
  {
    id: "marketing",
    name: "Jonas Reed",
    title: "Marketing Strategist",
    domain: "Marketing",
    bias: "Looks for positioning clarity, launch support, proof points, and market narrative.",
    weights: { marketing: 1.5, launch: 1.35, expansion: 1.1, objections: 0.9, pricing: 0.65, operations: 0.6, risk: 0.7 },
  },
  {
    id: "bizops",
    name: "Ari Patel",
    title: "Business Ops Partner",
    domain: "Business Ops",
    bias: "Optimizes onboarding, implementation effort, process reliability, and cross-team dependencies.",
    weights: { operations: 1.45, timeline: 1.25, risk: 1.15, launch: 0.9, urgency: 0.8, pricing: 0.6, marketing: 0.55 },
  },
  {
    id: "outreach",
    name: "Elena Brooks",
    title: "Client Outreach Manager",
    domain: "Client Outreach",
    bias: "Focuses on stakeholder follow-up, client trust, communication gaps, and next-touch sequencing.",
    weights: { objections: 1.2, expansion: 1.1, urgency: 1.0, risk: 0.95, marketing: 0.85, timeline: 0.8, pricing: 0.7 },
  },
  {
    id: "executive",
    name: "Daniel Ross",
    title: "Executive Sponsor",
    domain: "Executive",
    bias: "Frames everything around strategic fit, revenue impact, risk exposure, and executive confidence.",
    weights: { risk: 1.35, expansion: 1.3, pricing: 1.0, urgency: 1.0, launch: 0.9, marketing: 0.8, operations: 0.85 },
  },
];

const signalLexicon = {
  pricing: ["price", "pricing", "budget", "cost", "discount", "roi", "commercial", "spend"],
  urgency: ["urgent", "asap", "quarter", "deadline", "fast", "soon", "immediately", "this month"],
  expansion: ["expand", "growth", "scale", "pipeline", "revenue", "upsell", "cross-sell", "enterprise"],
  objections: ["concern", "hesitant", "objection", "unclear", "question", "doubt", "pushback", "skeptical"],
  risk: ["risk", "security", "compliance", "legal", "migration", "downtime", "trust", "reliability"],
  marketing: ["campaign", "messaging", "brand", "positioning", "launch", "story", "content", "adoption"],
  operations: ["implementation", "onboarding", "workflow", "process", "integration", "ops", "support", "enablement"],
  timeline: ["timeline", "schedule", "rollout", "next week", "next month", "milestone", "target date"],
  launch: ["launch", "go-live", "release", "announcement", "rollout", "activation"],
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const joinDecisions = new Map();
const agentConsoleLog = new Map();
let liveRecognition = null;
let transcriptSegments = [];
let lastSyncedSecond = -1;
let manualTranscriptTimer = null;
let activeMeetingProvider = "meet";
let leftPaneFocus = "default";
let selectedAgentId = "sales";
let currentOrchestrationState = buildInitialOrchestrationState();
let isDraggingWorkspaceSplitter = false;

const providerDefaults = {
  meet: {
    label: "Google Meet link",
    placeholder: "https://meet.google.com/abc-defg-hij",
    startUrl: "https://meet.new",
  },
  zoom: {
    label: "Zoom link",
    placeholder: "https://zoom.us/j/1234567890",
    startUrl: "https://zoom.us/start/videomeeting",
  },
  teams: {
    label: "Teams link",
    placeholder: "https://teams.microsoft.com/l/meetup-join/...",
    startUrl: "https://teams.microsoft.com/",
  },
};

renderEmployeeAgents(
  employeeAgents.map((agent) => ({
    ...agent,
    normalizedScore: 0,
    focusAreas: [],
    recommendation: "Waiting for transcript signal.",
    status: "standby",
  })),
);
renderJoinRecommendations([]);
renderJoinedAgents([], []);
renderAnalysisState({
  risk: "Low",
  momentum: "Neutral",
  summary: "Live analysis will appear once transcript events start flowing.",
  alerts: ["Upload a video or start live capture to begin continuous analysis."],
});
renderSelectedAgentConsole();
applyProviderUI(activeMeetingProvider);
applyRouteState(readRouteState(), { replaceHistory: true });

videoInput.addEventListener("change", () => {
  const [file] = videoInput.files || [];

  if (!file) {
    clearVideoPreview();
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const previousUrl = videoPreview.dataset.objectUrl;

  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }

  callFrame.src = "";
  callFrame.classList.add("hidden");
  callEmptyState.classList.add("hidden");
  videoPreview.src = objectUrl;
  videoPreview.dataset.objectUrl = objectUrl;
  videoPreview.classList.remove("hidden");
  statusText.textContent = "Recorded call loaded";
  enterCallView({
    provider: "upload",
    mode: "video",
  });
  setupVideoSync(file);
});

document.querySelectorAll(".join-meeting-button").forEach((button) => {
  button.addEventListener("click", () => {
    const provider = button.dataset.provider || "meet";
    const link = button.dataset.link || "";
    activeMeetingProvider = provider;
    applyProviderUI(provider);
    meetUrlInput.value = link;
    meetStatus.textContent = "Meeting link loaded from calendar";
    meetStatus.style.color = "#73e0a9";
    enterCallView({
      provider,
      link,
      mode: "meeting",
    });
  });
});

document.querySelectorAll(".provider-add-link").forEach((button) => {
  button.addEventListener("click", () => {
    activeMeetingProvider = button.dataset.provider || "meet";
    applyProviderUI(activeMeetingProvider);
    meetUrlInput.focus();
    meetStatus.textContent = `Paste the ${providerLabel(activeMeetingProvider)} link and load it into the call window`;
    meetStatus.style.color = "#6fbaff";
  });
});

document.querySelectorAll(".provider-start-new").forEach((button) => {
  button.addEventListener("click", () => {
    activeMeetingProvider = button.dataset.provider || "meet";
    applyProviderUI(activeMeetingProvider);
    const startUrl = providerDefaults[activeMeetingProvider].startUrl;
    meetUrlInput.value = startUrl;
    meetStatus.textContent = `Starting a new ${providerLabel(activeMeetingProvider)} meeting`;
    meetStatus.style.color = "#73e0a9";
    enterCallView({
      provider: activeMeetingProvider,
      link: startUrl,
      mode: "meeting",
    });
  });
});

videoPreview.addEventListener("timeupdate", () => {
  syncTranscriptToVideo();
});

videoPreview.addEventListener("seeked", () => {
  syncTranscriptToVideo(true);
});

videoPreview.addEventListener("play", () => {
  syncTranscriptToVideo(true);
});

openMeetButton.addEventListener("click", () => {
  const rawValue = meetUrlInput.value.trim();

  if (!rawValue) {
    meetStatus.textContent = "Paste a Meet link first";
    meetStatus.style.color = "#ff8e8e";
    return;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(rawValue);
  } catch (_error) {
    meetStatus.textContent = "That does not look like a valid URL";
    meetStatus.style.color = "#ff8e8e";
    return;
  }

  if (!(parsedUrl.hostname === "meet.google.com" || parsedUrl.hostname.endsWith(".meet.google.com"))) {
    meetStatus.textContent = "Use a meet.google.com link";
    meetStatus.style.color = "#ff8e8e";
    return;
  }

  activeMeetingProvider = "meet";
  applyProviderUI(activeMeetingProvider);
  meetStatus.textContent = `Trying to load ${providerLabel(activeMeetingProvider)} inside the call window`;
  meetStatus.style.color = "#6fbaff";
  enterCallView({
    provider: activeMeetingProvider,
    link: parsedUrl.toString(),
    mode: "meeting",
  });
  playbackSyncLabel.textContent = "Using microphone or pasted transcript";
  activeTranscriptExcerpt.textContent = "Start live capture or paste transcript chunks to analyze the call in real time.";
});

toggleCallFocusButton.addEventListener("click", () => {
  setLeftPaneFocus(leftPaneFocus === "call" ? "default" : "call");
});

toggleTranscriptFocusButton.addEventListener("click", () => {
  setLeftPaneFocus(leftPaneFocus === "transcript" ? "default" : "transcript");
});

workspaceSplitter.addEventListener("pointerdown", (event) => {
  isDraggingWorkspaceSplitter = true;
  workspaceSplitter.classList.add("dragging");
  workspaceSplitter.setPointerCapture(event.pointerId);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
});

workspaceSplitter.addEventListener("pointermove", (event) => {
  if (!isDraggingWorkspaceSplitter) {
    return;
  }

  updateWorkspaceWidth(event.clientX);
});

workspaceSplitter.addEventListener("pointerup", (event) => {
  if (!isDraggingWorkspaceSplitter) {
    return;
  }

  isDraggingWorkspaceSplitter = false;
  workspaceSplitter.classList.remove("dragging");
  workspaceSplitter.releasePointerCapture(event.pointerId);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

workspaceSplitter.addEventListener("keydown", (event) => {
  const currentWidth = getCurrentWorkspaceWidth();

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setWorkspaceWidth(currentWidth - 40);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    setWorkspaceWidth(currentWidth + 40);
  }

  if (event.key === "Home") {
    event.preventDefault();
    setWorkspaceWidth(getWorkspaceLimits().min);
  }

  if (event.key === "End") {
    event.preventDefault();
    setWorkspaceWidth(getWorkspaceLimits().max);
  }
});

backToHomeButton.addEventListener("click", () => {
  goHomeView();
});

window.addEventListener("popstate", () => {
  applyRouteState(readRouteState(), { skipHistory: true });
});

processTranscriptButton.addEventListener("click", () => {
  runLiveOrchestration(liveTranscriptInput.value.trim());
});

selectedAgentConsole.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-console-action]");

  if (!button) {
    return;
  }

  const agent = getSelectedAgentState();

  if (!agent) {
    return;
  }

  const transcript = liveTranscriptInput.dataset.finalTranscript || liveTranscriptInput.value.trim();
  const themes = currentOrchestrationState.nonZeroSignals || [];
  const action = button.dataset.consoleAction;

  if (action === "invite") {
    joinDecisions.set(agent.id, "accepted");
    appendAgentLog(agent.id, `${agent.name} was invited into the call and is ready to contribute.`);
    runLiveOrchestration(transcript);
    return;
  }

  if (action === "remove") {
    joinDecisions.delete(agent.id);
    appendAgentLog(agent.id, `${agent.name} was moved back to standby while the call evolves.`);
    runLiveOrchestration(transcript);
    return;
  }

  if (action === "take") {
    appendAgentLog(agent.id, buildAgentTake(agent, transcript, themes));
    renderSelectedAgentConsole();
    return;
  }

  if (action === "brief") {
    appendAgentLog(agent.id, buildAgentBriefRefresh(agent, transcript, themes));
    renderSelectedAgentConsole();
  }
});

liveTranscriptInput.addEventListener("input", () => {
  window.clearTimeout(manualTranscriptTimer);
  manualTranscriptTimer = window.setTimeout(() => {
    const transcript = liveTranscriptInput.value.trim();

    if (!transcriptSegments.length || !videoPreview.src) {
      runLiveOrchestration(transcript, {
        source: "manual",
        activeExcerpt: transcript,
        playbackLabel: "Live typed transcript",
      });
    }
  }, 350);
});

loadDemoTranscriptButton.addEventListener("click", () => {
  liveTranscriptInput.value =
    "The client likes the product direction but is worried about migration risk, pricing flexibility, and whether we can support a launch before next quarter. They asked for executive reassurance, operational onboarding detail, and stronger messaging for their internal team.";
  runLiveOrchestration(liveTranscriptInput.value);
});

startRealtimeButton.addEventListener("click", () => {
  if (!SpeechRecognition) {
    realtimeStatus.textContent = "This browser does not expose Web Speech recognition here, so use pasted transcript chunks instead.";
    return;
  }

  if (!liveRecognition) {
    liveRecognition = new SpeechRecognition();
    liveRecognition.continuous = true;
    liveRecognition.interimResults = true;
    liveRecognition.lang = "en-US";

    liveRecognition.onstart = () => {
      realtimeStatus.textContent = "Live capture is listening and routing transcript updates to the swarm.";
      startRealtimeButton.disabled = true;
      stopRealtimeButton.disabled = false;
    };

    liveRecognition.onend = () => {
      realtimeStatus.textContent = "Live capture stopped.";
      startRealtimeButton.disabled = false;
      stopRealtimeButton.disabled = true;
    };

    liveRecognition.onerror = (event) => {
      realtimeStatus.textContent = `Live capture error: ${event.error}.`;
      startRealtimeButton.disabled = false;
      stopRealtimeButton.disabled = true;
    };

    liveRecognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const phrase = event.results[index][0].transcript.trim();
        if (event.results[index].isFinal) {
          finalText += `${phrase} `;
        } else {
          interimText += `${phrase} `;
        }
      }

      const baseText = liveTranscriptInput.dataset.finalTranscript || "";

      if (finalText) {
        const merged = `${baseText} ${finalText}`.trim();
        liveTranscriptInput.dataset.finalTranscript = merged;
        liveTranscriptInput.value = `${merged}${interimText ? ` ${interimText.trim()}` : ""}`.trim();
        runLiveOrchestration(merged, {
          source: "microphone",
          activeExcerpt: finalText.trim(),
          playbackLabel: "Live microphone stream",
        });
        return;
      }

      liveTranscriptInput.value = `${baseText}${interimText ? ` ${interimText.trim()}` : ""}`.trim();
    };
  }

  liveRecognition.start();
});

stopRealtimeButton.addEventListener("click", () => {
  if (liveRecognition) {
    liveRecognition.stop();
  }
});

async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    healthBadge.textContent = data.hasApiKey ? "API key detected" : "Missing OPENAI_API_KEY";
    healthBadge.style.color = data.hasApiKey ? "#73e0a9" : "#ff8e8e";
  } catch (_error) {
    healthBadge.textContent = "Start localhost server";
    healthBadge.style.color = "#ff8e8e";
  }
}

function runLiveOrchestration(transcript, options = {}) {
  if (!transcript) {
    currentOrchestrationState = buildInitialOrchestrationState();
    orchestrationMode.textContent = "Standby";
    leadAgentName.textContent = "Awaiting transcript";
    leadAgentReason.textContent = "Add a live transcript excerpt to activate the employee swarm.";
    swarmConfidence.textContent = "0%";
    orchestrationSummary.textContent = "Weighted routing will appear here.";
    if (detectedThemes) {
      detectedThemes.innerHTML = "";
    }
    if (handoffList) {
      handoffList.innerHTML = "";
    }
    playbackSyncLabel.textContent = "Waiting for transcript";
    activeTranscriptExcerpt.textContent = "Once transcript events arrive, the active excerpt will appear here.";
    renderJoinRecommendations([]);
    renderJoinedAgents([], []);
    renderAnalysisState({
      risk: "Low",
      momentum: "Neutral",
      summary: "Live analysis will appear once transcript events start flowing.",
      alerts: ["Upload a video or start live capture to begin continuous analysis."],
    });
    renderEmployeeAgents(
      employeeAgents.map((agent) => ({
        ...agent,
        normalizedScore: 0,
        focusAreas: [],
        recommendation: "Waiting for transcript signal.",
        status: "standby",
      })),
    );
    selectedAgentId = currentOrchestrationState.leader.id;
    renderSelectedAgentConsole();
    return;
  }

  liveTranscriptInput.dataset.finalTranscript = transcript;
  playbackSyncLabel.textContent = options.playbackLabel || "Live transcript window";
  activeTranscriptExcerpt.textContent = options.activeExcerpt || transcript;
  const signalScores = scoreSignals(transcript);
  const nonZeroSignals = Object.entries(signalScores)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  const weightedAgents = employeeAgents
    .map((agent) => {
      const score = Object.entries(signalScores).reduce((sum, [signal, signalValue]) => {
        return sum + signalValue * (agent.weights[signal] || 0);
      }, 0);
      const focusAreas = nonZeroSignals
        .filter(([signal]) => (agent.weights[signal] || 0) >= 1)
        .slice(0, 3)
        .map(([signal]) => signal);

      return { ...agent, score, focusAreas };
    })
    .sort((a, b) => b.score - a.score);

  const topScore = weightedAgents[0]?.score || 1;
  const normalizedAgents = weightedAgents.map((agent, index) => ({
    ...agent,
    normalizedScore: Math.max(8, Math.round((agent.score / topScore) * 100)),
    status: index < 3 ? "active" : "monitoring",
    recommendation: buildRecommendation(agent, nonZeroSignals),
  }));

  const leader = normalizedAgents[0];
  const collaborators = normalizedAgents.slice(1, 3);
  const swarm = Math.min(99, Math.round(normalizedAgents.slice(0, 3).reduce((sum, agent) => sum + agent.normalizedScore, 0) / 3));

  orchestrationMode.textContent = "Multi-agent live";
  leadAgentName.textContent = `${leader.name} • ${leader.title}`;
  leadAgentReason.textContent = `${leader.domain} takes point because the transcript is strongest on ${leader.focusAreas.join(", ") || "cross-functional signals"}.`;
  swarmConfidence.textContent = `${swarm}%`;
  orchestrationSummary.textContent = `${leader.domain} leads while ${collaborators.map((agent) => agent.domain).join(" and ")} support the next move.`;

  if (detectedThemes) {
    renderStringList(
      detectedThemes,
      nonZeroSignals.length ? nonZeroSignals.slice(0, 6).map(([signal, value]) => `${capitalize(signal)} (${value})`) : ["General discovery"],
    );
  }

  if (handoffList) {
    handoffList.innerHTML = buildHandoffs(leader, collaborators, nonZeroSignals)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
  }

  const recommendations = normalizedAgents.slice(0, 4).map((agent, index) => ({
    ...agent,
    shouldJoin: index < 2 || agent.normalizedScore >= 72,
    reason: buildJoinReason(agent, nonZeroSignals),
    brief: buildAgentBrief(agent, transcript, nonZeroSignals),
    contributions: buildContributionPlan(agent, nonZeroSignals),
  }));

  const acceptedAgents = recommendations.filter((agent) => joinDecisions.get(agent.id) === "accepted");
  currentOrchestrationState = {
    transcript,
    nonZeroSignals,
    normalizedAgents,
    recommendations,
    acceptedAgents,
    leader,
    collaborators,
    analysisState: buildAnalysisState(nonZeroSignals, leader, collaborators),
  };
  selectedAgentId = normalizedAgents.some((agent) => agent.id === selectedAgentId) ? selectedAgentId : leader.id;
  renderJoinRecommendations(recommendations);
  renderJoinedAgents(acceptedAgents, nonZeroSignals);
  renderEmployeeAgents(normalizedAgents);
  renderAnalysisState(currentOrchestrationState.analysisState);
  renderSelectedAgentConsole();
}

function scoreSignals(transcript) {
  const normalizedTranscript = transcript.toLowerCase();
  const scores = {};

  Object.entries(signalLexicon).forEach(([signal, keywords]) => {
    scores[signal] = keywords.reduce((count, keyword) => count + countMatches(normalizedTranscript, keyword), 0);
  });

  return scores;
}

function countMatches(text, keyword) {
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(new RegExp(`\\b${escapedKeyword}\\b`, "g"));
  return matches ? matches.length : 0;
}

function buildRecommendation(agent, nonZeroSignals) {
  const strongestSignal = nonZeroSignals[0]?.[0] || "discovery";
  const recommendations = {
    sales: `Pressure-test commercial positioning around ${strongestSignal} and define the ask for the next meeting.`,
    marketing: `Package the story around ${strongestSignal} with proof points the client can replay internally.`,
    bizops: `Turn ${strongestSignal} into a concrete implementation plan with owners, dates, and risk controls.`,
    outreach: `Sequence follow-up around ${strongestSignal} so stakeholders feel heard quickly after the call.`,
    executive: `Frame ${strongestSignal} as an executive decision with downside protection and business upside.`,
  };
  return recommendations[agent.id] || "Coordinate with the lead agent.";
}

function buildHandoffs(leader, collaborators, nonZeroSignals) {
  const topThemes = nonZeroSignals.slice(0, 3).map(([signal]) => capitalize(signal));
  return [
    `${leader.domain} leads on ${topThemes[0] || "Discovery"} and owns the immediate response plan.`,
    `${collaborators[0]?.domain || "Cross-functional"} picks up ${topThemes[1] || "Execution"} detail and fills evidence gaps.`,
    `${collaborators[1]?.domain || "Executive"} prepares the follow-up narrative and stakeholder alignment.`,
  ];
}

function buildJoinReason(agent, nonZeroSignals) {
  const themes = nonZeroSignals
    .filter(([signal]) => (agent.weights[signal] || 0) >= 1)
    .slice(0, 2)
    .map(([signal]) => capitalize(signal));

  return themes.length
    ? `${agent.domain} should join because the call is leaning heavily into ${themes.join(" and ")}.`
    : `${agent.domain} can monitor the call, but is not the strongest join candidate yet.`;
}

function buildAgentBrief(agent, transcript, nonZeroSignals) {
  const summaryThemes = nonZeroSignals.slice(0, 3).map(([signal]) => capitalize(signal)).join(", ") || "general discovery";
  const excerpt = transcript.split(/\s+/).slice(0, 22).join(" ");
  return `${agent.name} is briefed on ${summaryThemes}. Context excerpt: "${excerpt}${transcript.split(/\s+/).length > 22 ? "..." : ""}"`;
}

function buildContributionPlan(agent, nonZeroSignals) {
  const topSignal = nonZeroSignals[0]?.[0] || "discovery";
  const secondSignal = nonZeroSignals[1]?.[0] || "alignment";

  const plans = {
    sales: [
      `Jump in when ${topSignal} turns commercial and clarify how we can keep momentum.`,
      "Offer a concrete next step and de-risk the buyer's commitment path.",
    ],
    marketing: [
      `Contribute when positioning around ${topSignal} or ${secondSignal} feels fuzzy.`,
      "Translate the discussion into an internal story the client can retell.",
    ],
    bizops: [
      `Join when implementation or ${topSignal} raises delivery concerns.`,
      "Map the call into owners, milestones, and operational safeguards.",
    ],
    outreach: [
      `Listen for hesitation around ${topSignal} and suggest stakeholder follow-up.`,
      "Capture who needs a recap and what trust gap needs closure after the call.",
    ],
    executive: [
      `Step in when ${topSignal} needs strategic reassurance or executive air cover.`,
      "Tie the decision back to business outcomes and downside protection.",
    ],
  };

  return plans[agent.id] || ["Add focused support during the call."];
}

function renderEmployeeAgents(agents) {
  employeeAgentGrid.innerHTML = agents
    .map(
      (agent) => `
        <button class="employee-agent-card ${agent.status === "active" ? "active" : ""} ${selectedAgentId === agent.id ? "selected" : ""}" type="button" data-agent-id="${escapeHtml(agent.id)}">
          <div class="employee-agent-topline">
            <div>
              <h4>${escapeHtml(agent.name)}</h4>
              <div class="employee-agent-domain">${escapeHtml(agent.title)} • ${escapeHtml(agent.domain)}</div>
            </div>
            <span class="agent-weight-pill">${agent.normalizedScore || 0}%</span>
          </div>
          <p class="bias-copy">${escapeHtml(agent.bias)}</p>
          <div class="score-row">
            <span>Status: ${escapeHtml(agent.status)}</span>
            <span>Focus: ${escapeHtml((agent.focusAreas || []).join(", ") || "none yet")}</span>
          </div>
          <div class="score-bar">
            <div class="score-bar-fill" style="width: ${agent.normalizedScore || 0}%"></div>
          </div>
          <p>${escapeHtml(agent.recommendation || "Waiting for transcript signal.")}</p>
        </button>
      `,
    )
    .join("");

  employeeAgentGrid.querySelectorAll("[data-agent-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedAgentId = button.dataset.agentId;
      appendAgentLog(selectedAgentId, `${getSelectedAgentState()?.name || "Agent"} is now the active console focus.`);
      renderEmployeeAgents(currentOrchestrationState.normalizedAgents);
      renderSelectedAgentConsole();
    });
  });
}

function renderJoinRecommendations(recommendations) {
  if (!recommendations.length) {
    joinRecommendations.innerHTML = '<p class="support-text">Process a transcript to see who should join the call.</p>';
    return;
  }

  joinRecommendations.innerHTML = recommendations
    .map((agent) => {
      const decision = joinDecisions.get(agent.id) || (agent.shouldJoin ? "recommended" : "standby");
      return `
        <article class="join-card ${agent.shouldJoin ? "recommended" : ""} ${selectedAgentId === agent.id ? "selected" : ""}" data-agent-id="${escapeHtml(agent.id)}">
          <div class="join-card-header">
            <div>
              <h4>${escapeHtml(agent.name)}</h4>
              <div class="employee-agent-domain">${escapeHtml(agent.title)} • ${escapeHtml(agent.domain)}</div>
            </div>
            <span class="join-state-pill ${decision === "accepted" ? "accepted" : decision === "declined" ? "declined" : ""}">${escapeHtml(decision)}</span>
          </div>
          <p>${escapeHtml(agent.reason)}</p>
          <p class="bias-copy">${escapeHtml(agent.brief)}</p>
          <div class="join-card-actions">
            <button class="mini-button accept" type="button" data-agent-id="${escapeHtml(agent.id)}" data-decision="accepted">Accept</button>
            <button class="mini-button decline" type="button" data-agent-id="${escapeHtml(agent.id)}" data-decision="declined">Decline</button>
          </div>
        </article>
      `;
    })
    .join("");

  joinRecommendations.querySelectorAll("button[data-agent-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedAgentId = button.dataset.agentId;
      joinDecisions.set(button.dataset.agentId, button.dataset.decision);
      appendAgentLog(
        button.dataset.agentId,
        button.dataset.decision === "accepted"
          ? `${resolveAgentName(button.dataset.agentId)} accepted the invitation and joined the call.`
          : `${resolveAgentName(button.dataset.agentId)} was declined for now.`,
      );
      runLiveOrchestration(liveTranscriptInput.dataset.finalTranscript || liveTranscriptInput.value.trim());
    });
  });

  joinRecommendations.querySelectorAll("article[data-agent-id]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedAgentId = card.dataset.agentId;
      renderJoinRecommendations(currentOrchestrationState.recommendations);
      renderEmployeeAgents(currentOrchestrationState.normalizedAgents);
      renderJoinedAgents(currentOrchestrationState.acceptedAgents, currentOrchestrationState.nonZeroSignals);
      renderSelectedAgentConsole();
    });
  });
}

function renderJoinedAgents(agents, nonZeroSignals) {
  if (!agents.length) {
    joinedAgents.innerHTML = '<p class="support-text">Accepted agents will appear here with their live briefing and contribution plan.</p>';
    return;
  }

  joinedAgents.innerHTML = agents
    .map(
      (agent) => `
        <article class="joined-agent-card ${selectedAgentId === agent.id ? "selected" : ""}" data-agent-id="${escapeHtml(agent.id)}">
          <div class="joined-agent-header">
            <div>
              <h4>${escapeHtml(agent.name)}</h4>
              <div class="employee-agent-domain">${escapeHtml(agent.domain)} is now in the call</div>
            </div>
            <span class="join-state-pill accepted">joined</span>
          </div>
          <p>${escapeHtml(agent.brief)}</p>
          <ul class="contribution-list">
            ${agent.contributions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            <li>${escapeHtml(`${agent.domain} is watching ${nonZeroSignals[0]?.[0] || "call context"} for the next opening to contribute.`)}</li>
          </ul>
        </article>
      `,
    )
    .join("");

  joinedAgents.querySelectorAll("article[data-agent-id]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedAgentId = card.dataset.agentId;
      renderJoinRecommendations(currentOrchestrationState.recommendations);
      renderEmployeeAgents(currentOrchestrationState.normalizedAgents);
      renderJoinedAgents(currentOrchestrationState.acceptedAgents, currentOrchestrationState.nonZeroSignals);
      renderSelectedAgentConsole();
    });
  });
}

function renderStringList(target, values) {
  if (!target) {
    return;
  }
  target.innerHTML = values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");
}

function buildAnalysisState(nonZeroSignals, leader, collaborators) {
  const riskScore = (nonZeroSignals.find(([signal]) => signal === "risk")?.[1] || 0) +
    (nonZeroSignals.find(([signal]) => signal === "objections")?.[1] || 0);
  const momentumScore = (nonZeroSignals.find(([signal]) => signal === "urgency")?.[1] || 0) +
    (nonZeroSignals.find(([signal]) => signal === "expansion")?.[1] || 0);

  const risk = riskScore >= 4 ? "High" : riskScore >= 2 ? "Medium" : "Low";
  const momentum = momentumScore >= 3 ? "Strong" : momentumScore >= 1 ? "Building" : "Neutral";
  const alerts = [
    `${leader.domain} should steer the next response window.`,
    collaborators[0] ? `${collaborators[0].domain} should prepare backup context.` : "No backup collaborator active yet.",
    nonZeroSignals[0] ? `Top live theme: ${capitalize(nonZeroSignals[0][0])}.` : "No dominant theme detected yet.",
  ];

  return {
    risk,
    momentum,
    summary: `${leader.domain} is currently best positioned to respond while the transcript leans into ${leader.focusAreas.join(", ") || "general discovery"}.`,
    alerts,
  };
}

function renderAnalysisState(state) {
  riskLevel.textContent = state.risk;
  momentumLevel.textContent = state.momentum;
  analysisSummary.textContent = state.summary;
  analysisAlerts.innerHTML = state.alerts.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function buildInitialOrchestrationState() {
  const initialAgents = employeeAgents.map((agent) => ({
    ...agent,
    score: 0,
    normalizedScore: 0,
    focusAreas: [],
    recommendation: "Waiting for transcript signal.",
    status: "standby",
    reason: `${agent.domain} is waiting for stronger transcript context.`,
    brief: `${agent.name} is on standby until the call produces a clearer signal.`,
    contributions: ["Wait for transcript context before stepping in."],
  }));

  return {
    transcript: "",
    nonZeroSignals: [],
    normalizedAgents: initialAgents,
    recommendations: [],
    acceptedAgents: [],
    leader: initialAgents[0],
    collaborators: [],
    analysisState: {
      risk: "Low",
      momentum: "Neutral",
      summary: "Live analysis will appear once transcript events start flowing.",
      alerts: ["Upload a video or start live capture to begin continuous analysis."],
    },
  };
}

function getSelectedAgentState() {
  return currentOrchestrationState.normalizedAgents.find((agent) => agent.id === selectedAgentId)
    || currentOrchestrationState.recommendations.find((agent) => agent.id === selectedAgentId)
    || employeeAgents.find((agent) => agent.id === selectedAgentId)
    || currentOrchestrationState.leader;
}

function resolveAgentName(agentId) {
  return employeeAgents.find((agent) => agent.id === agentId)?.name || "The agent";
}

function appendAgentLog(agentId, message) {
  const existing = agentConsoleLog.get(agentId) || [];
  existing.unshift({
    id: `${agentId}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    message,
  });
  agentConsoleLog.set(agentId, existing.slice(0, 5));
}

function buildAgentTake(agent, transcript, nonZeroSignals) {
  const topTheme = capitalize(nonZeroSignals[0]?.[0] || "discovery");
  const secondTheme = capitalize(nonZeroSignals[1]?.[0] || "alignment");
  const contextExcerpt = transcript
    ? transcript.split(/\s+/).slice(-18).join(" ")
    : "No live transcript context has landed yet.";

  const takes = {
    sales: `Sales take: the strongest move is to answer the client's ${topTheme} concern with a concrete next step, then keep the deal moving by clarifying commitment timing. Latest context: "${contextExcerpt}"`,
    marketing: `Marketing take: we should sharpen the internal story around ${topTheme} and ${secondTheme} so the client can socialize this conversation after the call. Latest context: "${contextExcerpt}"`,
    bizops: `Business Ops take: the conversation is opening implementation risk around ${topTheme}. I would step in with owners, onboarding sequence, and a realistic delivery path. Latest context: "${contextExcerpt}"`,
    outreach: `Client Outreach take: I would capture who feels unconvinced around ${topTheme} and prepare targeted follow-up before momentum cools. Latest context: "${contextExcerpt}"`,
    executive: `Executive take: this is the moment to tie ${topTheme} back to business impact, lower perceived risk, and reassure the buyer that leadership is aligned. Latest context: "${contextExcerpt}"`,
  };

  return takes[agent.id] || `${agent.name} is ready with a focused contribution on ${topTheme}.`;
}

function buildAgentBriefRefresh(agent, transcript, nonZeroSignals) {
  const themes = nonZeroSignals.slice(0, 3).map(([signal]) => capitalize(signal)).join(", ") || "Discovery";
  const contribution = buildContributionPlan(agent, nonZeroSignals)[0];
  return `Brief refresh for ${agent.name}: key themes are ${themes}. Primary call move: ${contribution} Context anchor: ${transcript ? transcript.split(/\s+/).slice(0, 16).join(" ") : "Transcript has not started yet."}`;
}

function renderSelectedAgentConsole() {
  const agent = getSelectedAgentState();
  const accepted = joinDecisions.get(agent?.id) === "accepted";
  const decision = joinDecisions.get(agent?.id) || "standby";
  const themes = (agent?.focusAreas || []).length ? agent.focusAreas.map(capitalize) : ["Awaiting signal"];
  const brief = currentOrchestrationState.recommendations.find((item) => item.id === agent?.id)?.brief
    || agent?.brief
    || `${agent?.name || "Selected agent"} is waiting for transcript context.`;
  const logs = agentConsoleLog.get(agent?.id) || [];

  selectedAgentConsole.innerHTML = `
    <section class="console-shell">
      <div class="console-header">
        <div>
          <strong>${escapeHtml(agent?.name || "No agent selected")}</strong>
          <div class="employee-agent-domain">${escapeHtml(agent?.title || "Standby")} • ${escapeHtml(agent?.domain || "Employee agent")}</div>
        </div>
        <div class="console-status">
          <span class="join-state-pill ${accepted ? "accepted" : decision === "declined" ? "declined" : ""}">${escapeHtml(decision)}</span>
          <span class="agent-weight-pill">${escapeHtml(String(agent?.normalizedScore || 0))}% fit</span>
        </div>
      </div>

      <p class="bias-copy">${escapeHtml(agent?.bias || "Select an agent to inspect their behavior.")}</p>

      <div class="console-focus">
        <span class="overview-label">Current focus</span>
        <ul class="tag-list">
          ${themes.map((theme) => `<li>${escapeHtml(theme)}</li>`).join("")}
        </ul>
      </div>

      <div class="console-actions">
        <button class="console-action-button primary" type="button" data-console-action="${accepted ? "remove" : "invite"}">
          ${accepted ? "Move to standby" : "Invite to call"}
        </button>
        <button class="console-action-button" type="button" data-console-action="take">Ask for live take</button>
        <button class="console-action-button" type="button" data-console-action="brief">Refresh brief</button>
      </div>

      <div class="console-brief-block">
        <span class="overview-label">Current brief</span>
        <p class="support-text">${escapeHtml(brief)}</p>
      </div>

      <div class="console-log">
        <span class="overview-label">Activity log</span>
        ${logs.length ? logs.map((item) => `
          <div class="console-log-item">
            <strong>${escapeHtml(agent?.name || "Agent")}</strong>
            <span class="support-text">${escapeHtml(item.message)}</span>
          </div>
        `).join("") : '<p class="support-text">Select an agent and ask for a take, refresh their brief, or invite them into the call.</p>'}
      </div>
    </section>
  `;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clearVideoPreview() {
  const previousUrl = videoPreview.dataset.objectUrl;
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }
  videoPreview.pause();
  videoPreview.removeAttribute("src");
  videoPreview.load();
  videoPreview.dataset.objectUrl = "";
  videoPreview.classList.add("hidden");
  callEmptyState.classList.remove("hidden");
}

function resetCallSurface() {
  clearVideoPreview();
  callFrame.removeAttribute("src");
  callFrame.classList.add("hidden");
  callEmptyState.classList.remove("hidden");
}

function activateCallLayout() {
  appGrid.classList.add("call-active");
  appGrid.classList.remove("home-view");
  setupPanel.classList.add("collapsed");
  workspacePanel.classList.add("expanded");
  workspacePanel.classList.remove("route-hidden");
}

function activateHomeLayout() {
  appGrid.classList.add("home-view");
  appGrid.classList.remove("call-active");
  setupPanel.classList.remove("collapsed");
  workspacePanel.classList.remove("expanded");
  workspacePanel.classList.add("route-hidden");
  setLeftPaneFocus("default");
}

function applyProviderUI(provider) {
  const config = providerDefaults[provider] || providerDefaults.meet;
  meetingUrlLabel.textContent = config.label;
  meetUrlInput.placeholder = config.placeholder;
}

function providerLabel(provider) {
  return {
    meet: "Google Meet",
    zoom: "Zoom",
    teams: "Teams",
    upload: "recorded call",
  }[provider] || "meeting";
}

function enterCallView({ provider, link = "", mode }) {
  activeMeetingProvider = provider || activeMeetingProvider;
  const nextState = {
    view: "call",
    provider: activeMeetingProvider,
    link,
    mode,
  };

  applyRouteState(nextState);
}

function goHomeView() {
  applyRouteState(
    {
      view: "home",
      provider: activeMeetingProvider,
      link: "",
      mode: "",
    },
  );
}

function readRouteState() {
  const params = new URLSearchParams(window.location.search);

  return {
    view: params.get("view") || "home",
    provider: params.get("provider") || "meet",
    link: params.get("link") || "",
    mode: params.get("mode") || "",
  };
}

function writeRouteState(state, { replaceHistory = false } = {}) {
  const url = new URL(window.location.href);

  if (state.view && state.view !== "home") {
    url.searchParams.set("view", state.view);
  } else {
    url.searchParams.delete("view");
  }

  if (state.provider && (state.view === "call" || state.provider !== "meet")) {
    url.searchParams.set("provider", state.provider);
  } else {
    url.searchParams.delete("provider");
  }

  if (state.link) {
    url.searchParams.set("link", state.link);
  } else {
    url.searchParams.delete("link");
  }

  if (state.mode) {
    url.searchParams.set("mode", state.mode);
  } else {
    url.searchParams.delete("mode");
  }

  window.history[replaceHistory ? "replaceState" : "pushState"]({}, "", url);
}

function applyRouteState(state, options = {}) {
  if (!options.skipHistory) {
    writeRouteState(state, options);
  }

  activeMeetingProvider = state.provider || activeMeetingProvider;
  applyProviderUI(activeMeetingProvider);

  if (state.view === "call") {
    activateCallLayout();

    if (state.mode === "meeting" && state.link) {
      meetUrlInput.value = state.link;
      clearVideoPreview();
      callEmptyState.classList.add("hidden");
      callFrame.classList.remove("hidden");
      callFrame.src = state.link;
      statusText.textContent = `${providerLabel(activeMeetingProvider)} loaded`;
      meetStatus.textContent = `Call window is ready for ${providerLabel(activeMeetingProvider)}`;
      meetStatus.style.color = "#73e0a9";
      playbackSyncLabel.textContent = "Using microphone or pasted transcript";
      activeTranscriptExcerpt.textContent = "Start live capture or paste transcript chunks to analyze the call in real time.";
    } else if (state.mode === "video") {
      statusText.textContent = "Recorded call loaded";
    }

    return;
  }

  activateHomeLayout();
  resetCallSurface();
  statusText.textContent = "Waiting for input";
  meetStatus.textContent = DEFAULT_MEET_STATUS;
  meetStatus.style.color = "";
}

function setLeftPaneFocus(mode) {
  leftPaneFocus = mode;
  callColumn.classList.remove("focus-call", "focus-transcript");

  if (mode === "call") {
    callColumn.classList.add("focus-call");
  } else if (mode === "transcript") {
    callColumn.classList.add("focus-transcript");
  }

  toggleCallFocusButton.textContent = mode === "call" ? "Reset size" : "Expand call";
  toggleTranscriptFocusButton.textContent = mode === "transcript" ? "Reset size" : "Expand transcript";
}

function updateWorkspaceWidth(pointerX) {
  const bounds = workspaceGrid.getBoundingClientRect();
  const nextWidth = pointerX - bounds.left;
  setWorkspaceWidth(nextWidth);
}

function setWorkspaceWidth(width) {
  const { min, max } = getWorkspaceLimits();
  const clamped = Math.max(min, Math.min(max, width));
  workspaceGrid.style.setProperty("--call-column-size", `${clamped}px`);
}

function getCurrentWorkspaceWidth() {
  return Math.round(callColumn.getBoundingClientRect().width);
}

function getWorkspaceLimits() {
  const bounds = workspaceGrid.getBoundingClientRect();
  const styles = getComputedStyle(workspaceGrid);
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const splitterWidth = Number.parseFloat(getComputedStyle(workspaceSplitter).width) || 12;
  const min = 360;
  const max = Math.max(min, bounds.width - 320 - splitterWidth - (gap * 2));

  return { min, max };
}

async function setupVideoSync(file) {
  transcriptSegments = [];
  lastSyncedSecond = -1;
  playbackSyncLabel.textContent = "Generating timed transcript...";
  activeTranscriptExcerpt.textContent = "Uploading the selected video for timestamped transcription.";
  realtimeStatus.textContent = "Preparing video transcript for real-time analysis.";

  try {
    const formData = new FormData();
    formData.append("video", file);

    const response = await fetch(`${API_BASE}/api/transcribe-timeline`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create timed transcript.");
    }

    transcriptSegments = data.segments || [];
    playbackSyncLabel.textContent = transcriptSegments.length
      ? "Timed transcript synced to playback"
      : "Transcript available, no segments returned";
    activeTranscriptExcerpt.textContent = transcriptSegments[0]?.text || data.transcript || "Transcript is ready.";
    realtimeStatus.textContent = "Video transcript ready. Play the video to update analysis in real time.";
    syncTranscriptToVideo(true);
  } catch (error) {
    playbackSyncLabel.textContent = "Timed transcript unavailable";
    activeTranscriptExcerpt.textContent = error.message || "Could not create the timed transcript.";
    realtimeStatus.textContent = "Falling back to manual transcript input. Start localhost server if needed.";
  }
}

function syncTranscriptToVideo(force = false) {
  if (!transcriptSegments.length || Number.isNaN(videoPreview.currentTime)) {
    return;
  }

  const currentSecond = Math.floor(videoPreview.currentTime);

  if (!force && currentSecond === lastSyncedSecond) {
    return;
  }

  lastSyncedSecond = currentSecond;
  const revealedSegments = transcriptSegments.filter((segment) => segment.start <= videoPreview.currentTime + 0.25);
  const activeWindow = transcriptSegments
    .filter((segment) => segment.end >= Math.max(0, videoPreview.currentTime - 4) && segment.start <= videoPreview.currentTime + 2)
    .slice(-3);
  const revealedTranscript = revealedSegments.map((segment) => segment.text).join(" ").trim();
  const activeExcerpt = activeWindow.map((segment) => segment.text).join(" ").trim();

  liveTranscriptInput.value = revealedTranscript;
  liveTranscriptInput.dataset.finalTranscript = revealedTranscript;
  playbackSyncLabel.textContent = `Playback synced at ${formatTimestamp(videoPreview.currentTime)}`;
  activeTranscriptExcerpt.textContent = activeExcerpt || "Waiting for the next spoken segment.";

  runLiveOrchestration(revealedTranscript, {
    source: "video",
    activeExcerpt: activeExcerpt || revealedTranscript,
    playbackLabel: `Playback synced at ${formatTimestamp(videoPreview.currentTime)}`,
  });
}

function formatTimestamp(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(wholeSeconds / 60)).padStart(2, "0");
  const remainder = String(wholeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

checkHealth();
