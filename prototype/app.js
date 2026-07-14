(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    selectedAgent: "mira",
    selectedPlace: "observatory",
    paused: false,
    speedIndex: 0,
    speeds: [1, 2, 4],
    teamProbability: 55,
    clockSeconds: 18 * 3600 + 32 * 60 + 14,
    toastTimer: null,
    agentPositions: {
      mira: { left: "29%", top: "53%", place: "observatory" },
      orin: { left: "49%", top: "64%", place: "square" },
      kestrel: { left: "32%", top: "57%", place: "observatory" }
    }
  };

  const agentNames = { mira: "Mira", orin: "Orin", kestrel: "Kestrel" };
  const placeData = {
    observatory: {
      title: "Meridian Observatory",
      description: "The expedition home base, forecast room, and shared evidence wall.",
      position: { left: "29%", top: "53%" },
      action: "Return to base"
    },
    "weather-tower": {
      title: "Galehaven Weather Tower",
      description: "Fresh local observations and launch-window conditions.",
      position: { left: "78.5%", top: "30%" },
      action: "Gather weather"
    },
    newsroom: {
      title: "Ledger Bay Newsroom",
      description: "Breaking reports, official notices, and source-lineage checks.",
      position: { left: "81%", top: "73%" },
      action: "Review reports"
    },
    archive: {
      title: "Archive Quarter",
      description: "Historical cases, saved sources, agent memos, and forecast commits.",
      position: { left: "18%", top: "78%" },
      action: "Search archive"
    },
    professor: {
      title: "Scholar's Hill",
      description: "Ask Professor Vale to explain, challenge, compare, or check correlation.",
      position: { left: "64%", top: "21%" },
      action: "Consult Professor"
    },
    square: {
      title: "Lantern Square",
      description: "A shared meeting point where agents exchange evidence and disagree in public.",
      position: { left: "51%", top: "64%" },
      action: "Convene team"
    }
  };

  const overlays = {
    source: $("#sourceOverlay"),
    archive: $("#archiveOverlay"),
    professor: $("#professorOverlay"),
    meeting: $("#meetingOverlay"),
    forecast: $("#forecastOverlay")
  };

  function selectAgent(agent) {
    if (!agentNames[agent]) return;
    state.selectedAgent = agent;
    $$(".agent-card").forEach(card => {
      const selected = card.dataset.agent === agent;
      card.classList.toggle("selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
    $$(".map-agent").forEach(sprite => sprite.classList.toggle("selected-sprite", sprite.dataset.agentSprite === agent));
    $("#commandingAgent").textContent = agentNames[agent];
    const pip = $(".selected-agent-pip");
    pip.className = `selected-agent-pip portrait portrait-${agent}`;
    announce(`${agentNames[agent]} selected.`);
  }

  function syncPanelUrl(name) {
    // Direct-file previews have a null origin and reject History API URL changes.
    if (!window.history?.replaceState || window.location.origin === "null") return;
    const url = new URL(window.location.href);
    if (name) url.searchParams.set("panel", name);
    else url.searchParams.delete("panel");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openOverlay(name) {
    Object.entries(overlays).forEach(([key, overlay]) => {
      overlay.hidden = key !== name;
    });
    document.body.style.overflow = "hidden";
    const open = overlays[name];
    if (open) {
      const focusTarget = $("button, input, textarea", open);
      window.setTimeout(() => focusTarget?.focus(), 40);
      syncPanelUrl(name);
    }
  }

  function closeOverlays() {
    Object.values(overlays).forEach(overlay => { overlay.hidden = true; });
    document.body.style.overflow = "";
    syncPanelUrl(null);
  }

  function showToast(title, detail) {
    const toast = $("#worldToast");
    $("strong", toast).textContent = title;
    $("small", toast).textContent = detail;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
  }

  function announce(text) {
    $("#eventTickerText").textContent = text;
  }

  function setStatus(agent, text, kind = "ready") {
    const status = $(`#${agent}Status`);
    if (!status) return;
    status.textContent = text;
    const dot = status.previousElementSibling;
    dot.className = `status-dot ${kind}`;
  }

  function moveAgent(agent, place, options = {}) {
    const data = placeData[place];
    const sprite = $(`#sprite-${agent}`);
    if (!data || !sprite) return;
    const { title = `${agentNames[agent]} is traveling`, detail = data.title, onArrive } = options;
    sprite.classList.add("walking");
    setStatus(agent, `Traveling to ${data.title}`, "thinking");
    announce(`${agentNames[agent]} set out for ${data.title}.`);
    sprite.style.left = data.position.left;
    sprite.style.top = data.position.top;
    state.agentPositions[agent] = { ...data.position, place };
    window.setTimeout(() => {
      sprite.classList.remove("walking");
      setStatus(agent, `At ${data.title}`, place === "archive" ? "archive-dot" : "ready");
      sprite.setAttribute("aria-label", `${agentNames[agent]} at ${data.title}`);
      announce(`${agentNames[agent]} arrived at ${data.title}.`);
      showToast(title, detail);
      onArrive?.();
    }, document.body.classList.contains("low-motion") ? 30 : 2550 / state.speeds[state.speedIndex]);
  }

  function dispatchTo(place, agent = state.selectedAgent) {
    const selectedPlace = placeData[place];
    if (!selectedPlace) return;
    if (place === "professor") {
      moveAgent(agent, place, { title: "Consultation ready", detail: "Professor Vale is reviewing the selected evidence", onArrive: () => openOverlay("professor") });
      return;
    }
    if (place === "archive") {
      moveAgent(agent, place, { title: "Case file found", detail: "Twenty comparable coastal launch windows", onArrive: () => openOverlay("archive") });
      return;
    }
    if (place === "square") {
      moveAgent(agent, place, { title: "Meeting ready", detail: "Agents are gathering at Lantern Square", onArrive: () => openOverlay("meeting") });
      return;
    }
    if (place === "weather-tower") {
      moveAgent(agent, place, {
        title: "New weather signal",
        detail: "Galehaven crosswind advisory · official primary",
        onArrive: () => {
          const card = $("[data-signal='weather']");
          card.classList.add("flash");
          setTimeout(() => card.classList.remove("flash"), 900);
        }
      });
      return;
    }
    moveAgent(agent, place, { title: "Agent arrived", detail: selectedPlace.title });
  }

  function positionPopover(placeButton) {
    const popover = $("#locationPopover");
    const map = $("#worldMap");
    const rect = placeButton.getBoundingClientRect();
    const mapRect = map.getBoundingClientRect();
    const place = placeButton.dataset.place;
    const data = placeData[place];
    state.selectedPlace = place;
    $("#popoverTitle").textContent = data.title;
    $("#popoverDescription").textContent = data.description;
    $("#dispatchButton").textContent = `${data.action} · ${agentNames[state.selectedAgent]}`;
    popover.hidden = false;
    const desiredLeft = rect.left - mapRect.left + rect.width / 2 - 28;
    const desiredTop = rect.top - mapRect.top - 118;
    popover.style.left = `${Math.max(10, Math.min(mapRect.width - 230, desiredLeft))}px`;
    popover.style.top = `${Math.max(10, desiredTop)}px`;
    $$(".place").forEach(p => p.classList.toggle("active-place", p === placeButton));
  }

  function executeCommand(text) {
    const normalized = text.toLowerCase();
    if (/(weather|wind|advisory|galehaven)/.test(normalized)) {
      dispatchTo("weather-tower");
    } else if (/(archive|history|base rate|case)/.test(normalized)) {
      dispatchTo("archive");
    } else if (/(professor|vale|explain|challenge|correlation)/.test(normalized)) {
      dispatchTo("professor");
    } else if (/(meeting|convene|square|share)/.test(normalized)) {
      dispatchTo("square");
    } else if (/(news|notice|ledger)/.test(normalized)) {
      dispatchTo("newsroom");
    } else if (/(home|observatory|return)/.test(normalized)) {
      dispatchTo("observatory");
    } else {
      announce(`${agentNames[state.selectedAgent]} parsed the command and is planning a route.`);
      setStatus(state.selectedAgent, "Planning next action", "thinking");
      showToast("Command queued", "Local Codex runtime · structured turn requested");
      setTimeout(() => setStatus(state.selectedAgent, `Ready at ${placeData[state.agentPositions[state.selectedAgent].place].title}`, "ready"), 1800);
    }
  }

  function formatClock(total) {
    const h = Math.floor(total / 3600) % 24;
    const m = Math.floor(total / 60) % 60;
    const s = total % 60;
    return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
  }

  // Agent selection
  $$(".agent-card, .map-agent").forEach(el => {
    el.addEventListener("click", event => {
      event.stopPropagation();
      selectAgent(el.dataset.agent || el.dataset.agentSprite);
    });
  });
  selectAgent("mira");

  // Places and popover
  $$(".place").forEach(place => place.addEventListener("click", event => {
    event.stopPropagation();
    positionPopover(place);
  }));
  $("#worldMap").addEventListener("click", event => {
    if (!event.target.closest(".location-popover")) $("#locationPopover").hidden = true;
  });
  $("#dispatchButton").addEventListener("click", () => {
    $("#locationPopover").hidden = true;
    dispatchTo(state.selectedPlace);
  });
  $("#inspectLocationButton").addEventListener("click", () => {
    const place = state.selectedPlace;
    if (place === "archive") openOverlay("archive");
    else if (place === "professor") openOverlay("professor");
    else if (place === "square") openOverlay("meeting");
    else if (place === "weather-tower" || place === "newsroom") openOverlay("source");
    else openOverlay("forecast");
  });

  // Missions and suggested actions
  $("[data-action='dispatch-weather']").addEventListener("click", () => dispatchTo("weather-tower", "mira"));
  $("[data-action='dispatch-archive']").addEventListener("click", () => dispatchTo("archive", "orin"));
  $$("[data-suggestion]").forEach(button => button.addEventListener("click", () => {
    const suggestion = button.dataset.suggestion;
    const values = {
      weather: "Check the latest launch-window weather advisory",
      archive: "Search comparable historical launch delays",
      professor: "Ask Professor Vale whether the weather and archive evidence are independent",
      meeting: "Convene the field team at Lantern Square"
    };
    $("#commandInput").value = values[suggestion];
    executeCommand(values[suggestion]);
  }));
  $("#commandForm").addEventListener("submit", event => {
    event.preventDefault();
    const value = $("#commandInput").value.trim();
    if (value) executeCommand(value);
  });

  // Direct navigation
  $("#openArchiveTop").addEventListener("click", () => openOverlay("archive"));
  $("#openArchiveRail").addEventListener("click", () => openOverlay("archive"));
  $("#openProfessorTop").addEventListener("click", () => openOverlay("professor"));
  $("#meetingButton").addEventListener("click", () => openOverlay("meeting"));
  $("#forecastButton").addEventListener("click", () => openOverlay("forecast"));
  $("#askProfessorFromArchive").addEventListener("click", () => openOverlay("professor"));
  $("#meetingForecast").addEventListener("click", () => openOverlay("forecast"));
  $("#centerMap").addEventListener("click", () => {
    $("#locationPopover").hidden = true;
    showToast("World centered", "Meridian Coast · all six locations visible");
  });

  // Signal cards and pinning
  $$(".signal-card").forEach(card => card.addEventListener("click", event => {
    if (event.target.closest(".pin-button")) return;
    openOverlay("source");
  }));
  $$(".pin-button").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    const card = button.closest(".signal-card");
    card.classList.toggle("pinned");
    button.textContent = card.classList.contains("pinned") ? "◆" : "◇";
    showToast(card.classList.contains("pinned") ? "Signal pinned" : "Signal unpinned", "Evidence board updated");
  }));
  $("#pinFromSource").addEventListener("click", () => {
    $("[data-signal='weather']").classList.add("pinned");
    showToast("Signal pinned", "Crosswind advisory added to the case file");
    closeOverlays();
  });

  // Archive selection
  $$(".case-file").forEach(file => file.addEventListener("click", () => {
    $$(".case-file").forEach(item => item.classList.toggle("selected", item === file));
    file.classList.add("flash");
    setTimeout(() => file.classList.remove("flash"), 700);
  }));

  // Forecast controls
  const slider = $("#forecastSlider");
  const updateForecast = () => {
    const value = Number(slider.value);
    $("#forecastValue").textContent = `${value}%`;
    $("#commitForecastButton").textContent = `Commit ${value}%`;
  };
  slider.addEventListener("input", updateForecast);
  updateForecast();
  $("#forecastRationale").addEventListener("input", event => {
    $(".rationale-field small").textContent = `${event.target.value.length} / 280`;
  });
  $$(".commit-chip button").forEach(button => button.addEventListener("click", () => button.closest(".commit-chip").remove()));
  $("#commitForecastButton").addEventListener("click", () => {
    const value = Number(slider.value);
    state.teamProbability = value;
    $("#teamProbability").textContent = `${value}%`;
    $("#forecastTeamValue").textContent = `${value}%`;
    closeOverlays();
    announce(`Forecast committed at ${value}% with linked evidence and rationale.`);
    showToast("Forecast committed", `${value}% · simulated expedition only`);
  });

  // Overlay closing and keyboard
  $$('[data-close-overlay]').forEach(el => el.addEventListener("click", closeOverlays));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeOverlays();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openOverlay("archive");
      setTimeout(() => $(".archive-search input")?.focus(), 50);
    }
    if (event.target.matches("input, textarea")) return;
    if (event.key.toLowerCase() === "m") dispatchTo("weather-tower", "mira");
    if (event.key.toLowerCase() === "o") dispatchTo("archive", "orin");
  });

  // Simulation clock, pause, speed
  $("#pauseButton").addEventListener("click", () => {
    state.paused = !state.paused;
    document.body.classList.toggle("simulation-paused", state.paused);
    $("#pauseButton").innerHTML = state.paused ? '<span class="pause-icon">▶</span>' : '<span class="pause-icon">Ⅱ</span>';
    $("#pauseButton").setAttribute("aria-label", state.paused ? "Resume simulation" : "Pause simulation");
    announce(state.paused ? "World simulation paused." : "World simulation resumed.");
  });
  $("#speedButton").addEventListener("click", () => {
    state.speedIndex = (state.speedIndex + 1) % state.speeds.length;
    $("#speedButton").textContent = `${state.speeds[state.speedIndex]}×`;
    announce(`Simulation speed set to ${state.speeds[state.speedIndex]}×.`);
  });
  setInterval(() => {
    if (!state.paused) state.clockSeconds = (state.clockSeconds + state.speeds[state.speedIndex]) % 86400;
    $("#worldClock").textContent = formatClock(state.clockSeconds);
    $(".event-ticker strong").textContent = formatClock(state.clockSeconds).slice(0,5);
  }, 1000);

  // Query-string scenes for screenshots and review.
  const params = new URLSearchParams(window.location.search);
  if (params.get("animate") === "0") document.body.classList.add("low-motion");
  const panel = params.get("panel");
  if (panel && overlays[panel]) openOverlay(panel);
  if (params.get("toast") === "1") setTimeout(() => showToast("New source ingested", "Galehaven advisory · 2 min ago"), 150);
})();
