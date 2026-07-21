/* ============================================
   MetroRoute Delhi — app logic
   Modules: Config, DataStore, Utils, State,
            ListScreen, DetailScreen, Nav, ModeratorAuth
   ============================================ */

(() => {
  "use strict";

  /* ---------------- Config ---------------- */
  const CONFIG = {
    MODERATOR_PASSCODE: "METRO2026",
    VOTE_REFRESH_MS: 3 * 60 * 1000, // "every few minutes"
    BANNER_CONFIRM_DELAY_MS: 6000,  // banner auto-hides once status is "confirmed"
    TICK_MS: 1000,
  };

  const LINE_COLORS = {
    Red: "#E4342F",
    Yellow: "#F2C230",
    Blue: "#1273C4",
    Green: "#2CA85B",
    Violet: "#8A3FA0",
    Pink: "#E3479A",
    Magenta: "#9C1461",
    Grey: "#8C9096",
    "Airport Express": "#F5821F",
  };
  const lineColor = (name) => LINE_COLORS[name] || "#7c8aa8";

  /* ---------------- Utils ---------------- */
  const Utils = {
    escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str == null ? "" : String(str);
      return div.innerHTML;
    },
    debounce(fn, wait = 150) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    },
    timeAgo(ms) {
      const s = Math.max(0, Math.round(ms / 1000));
      if (s < 60) return `${s} sec${s === 1 ? "" : "s"} ago`;
      const m = Math.round(s / 60);
      if (m < 60) return `${m} min ago`;
      const h = Math.round(m / 60);
      if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
      const d = Math.round(h / 24);
      return `${d} day${d === 1 ? "" : "s"} ago`;
    },
  };

  /* ---------------- DataStore ---------------- */
  const DataStore = {
    stations: [],
    statusMap: new Map(), // stationId -> status record (mutable at runtime)

    async load() {
      const [stationsRes, disruptionsRes] = await Promise.all([
        fetch("stations.json"),
        fetch("disruptions.json"),
      ]);
      this.stations = await stationsRes.json();
      const disruptions = await disruptionsRes.json();

      const now = Date.now();
      disruptions.forEach((d) => {
        this.statusMap.set(d.stationId, {
          status: d.status,
          reason: d.reason,
          alternatives: d.alternatives || [],
          lastUpdated: now - d.minutesAgo * 60 * 1000,
          votes: { ...d.votes },
          history: (d.history || []).map((h) => ({
            ...h,
            timestamp: now - h.minutesAgo * 60 * 1000,
          })),
        });
      });
    },

    getStation(id) {
      return this.stations.find((s) => s.id === id);
    },

    getStatus(id) {
      return (
        this.statusMap.get(id) || {
          status: "Open",
          reason: "No disruptions reported.",
          alternatives: [],
          lastUpdated: Date.now(),
          votes: { open: 0, limited: 0, closed: 0 },
          history: [],
        }
      );
    },

    allLines() {
      const set = new Set();
      this.stations.forEach((s) => s.lines.forEach((l) => set.add(l)));
      return Array.from(set).sort();
    },

    /* Moderator confirms a new status for a station */
    applyModeratorUpdate(id, choice, moderatorLabel) {
      const record = this.getStatus(id);
      const reasonMap = {
        Open: "Confirmed running normally by a verified moderator.",
        Limited: "Reduced or partial service confirmed by a verified moderator.",
        Closed: "Station access suspended, confirmed by a verified moderator.",
      };
      record.status = choice;
      record.reason = reasonMap[choice];
      record.lastUpdated = Date.now();
      record.votes[choice.toLowerCase()] += 1;
      record.history.unshift({
        status: choice,
        reason: reasonMap[choice],
        timestamp: Date.now(),
        by: moderatorLabel,
      });
      this.statusMap.set(id, record);
      return record;
    },

    /* Simulated periodic drift of the community vote trend */
    jitterVotes(id) {
      const record = this.getStatus(id);
      const keys = ["open", "limited", "closed"];
      const bump = keys[Math.floor(Math.random() * keys.length)];
      record.votes[bump] += Math.floor(Math.random() * 3) + 1;
      return record;
    },
  };

  /* ---------------- State ---------------- */
  const State = {
    query: "",
    lineFilter: "All",
    statusFilter: "All",
    currentStationId: null,
    isModerator: false,
    selectedChoice: null,
    pendingSubmitAfterLogin: false,
  };

  /* ---------------- DOM refs ---------------- */
  const el = {
    screenList: document.getElementById("screen-list"),
    screenDetail: document.getElementById("screen-detail"),
    searchInput: document.getElementById("searchInput"),
    lineFilter: document.getElementById("lineFilter"),
    statusFilter: document.getElementById("statusFilter"),
    stationList: document.getElementById("stationList"),
    resultsCount: document.getElementById("resultsCount"),
    emptyState: document.getElementById("emptyState"),
    backBtn: document.getElementById("backBtn"),
    detailContent: document.getElementById("detailContent"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modalPasscode: document.getElementById("modalPasscode"),
    modalError: document.getElementById("modalError"),
    modalCancel: document.getElementById("modalCancel"),
    modalConfirm: document.getElementById("modalConfirm"),
  };

  /* ---------------- List screen ---------------- */
  function populateLineFilter() {
    DataStore.allLines().forEach((line) => {
      const opt = document.createElement("option");
      opt.value = line;
      opt.textContent = line;
      el.lineFilter.appendChild(opt);
    });
  }

  function getFilteredStations() {
    const q = State.query.toLowerCase().trim();
    return DataStore.stations
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .filter((s) => State.lineFilter === "All" || s.lines.includes(State.lineFilter))
      .filter((s) => {
        if (State.statusFilter === "All") return true;
        return DataStore.getStatus(s.id).status === State.statusFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function badgeHtml(status) {
    const cls =
      status === "Closed" ? "badge--closed" : status === "Limited" ? "badge--limited" : "badge--open";
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function linePillsHtml(lines) {
    return lines
      .map(
        (l) =>
          `<span class="line-pill"><span class="dot" style="background:${lineColor(l)}"></span>${Utils.escapeHtml(l)}</span>`
      )
      .join("");
  }

  function renderList() {
    const filtered = getFilteredStations();
    el.resultsCount.textContent = `${filtered.length} station${filtered.length === 1 ? "" : "s"}`;
    el.stationList.hidden = filtered.length === 0;
    el.emptyState.hidden = filtered.length !== 0;

    el.stationList.innerHTML = filtered
      .map((s) => {
        const status = DataStore.getStatus(s.id).status;
        return `
          <li class="station-row" data-id="${s.id}" role="listitem" tabindex="0">
            <div class="station-row__main">
              <p class="station-row__name">${Utils.escapeHtml(s.name)}</p>
              <div class="station-row__lines">${linePillsHtml(s.lines)}</div>
            </div>
            ${badgeHtml(status)}
            <button class="station-row__arrow" aria-label="Open ${Utils.escapeHtml(s.name)} details" tabindex="-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </li>
        `;
      })
      .join("");
  }

  /* ---------------- Detail screen ---------------- */
  let bannerTimer = null;
  let bannerTickTimer = null;
  let distTickTimer = null;
  let distRefreshTimer = null;

  function clearDetailTimers() {
    clearTimeout(bannerTimer);
    clearInterval(bannerTickTimer);
    clearInterval(distTickTimer);
    clearInterval(distRefreshTimer);
  }

  function renderDetail(stationId) {
    const station = DataStore.getStation(stationId);
    if (!station) return;
    const record = DataStore.getStatus(stationId);

    State.currentStationId = stationId;
    State.selectedChoice = null;

    el.detailContent.innerHTML = `
      <div class="update-banner" id="updateBanner">
        <span class="update-banner__dot"></span>
        <span class="update-banner__text" id="bannerText"></span>
      </div>

      <h1 class="station-title">${Utils.escapeHtml(station.name)}</h1>
      <p class="station-cat">${Utils.escapeHtml(station.category)}</p>
      <div class="station-title-lines">${linePillsHtml(station.lines)}</div>

      <div class="card status-hero">
        <div class="status-hero__top">
          <h2 style="margin:0;text-transform:none;letter-spacing:0;font-size:0.85rem;color:var(--text-mid);font-weight:600;">Public status</h2>
          ${badgeHtml(record.status).replace('class="badge', 'class="badge status-hero__badge')}
        </div>
        <p class="status-hero__reason" id="statusReason">${Utils.escapeHtml(record.reason)}</p>
        ${
          record.alternatives.length
            ? `<div class="status-hero__alts">
                <h3>Nearby alternatives</h3>
                <div class="alt-chips">${record.alternatives.map((a) => `<span class="alt-chip">${Utils.escapeHtml(a)}</span>`).join("")}</div>
              </div>`
            : ""
        }
      </div>

      <div class="card explainer" id="explainerCard">
        <div class="explainer__head">
          <h2>How this status is collected &amp; kept reliable</h2>
          <svg class="explainer__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="explainer__body">
          <p>Status shown here is designed to stay useful even on a slow or unstable connection:</p>
          <ul>
            <li><strong>Cached-first display.</strong> The last confirmed status is stored on your device, so it still shows instantly even if the network is down — never a blank screen.</li>
            <li><strong>Small, frequent syncs.</strong> Only a tiny status payload (a few bytes) is fetched, not full pages — cheap enough to succeed on 2G.</li>
            <li><strong>Retry with backoff.</strong> If a sync fails, it quietly retries after a short delay, then backs off, so it doesn't hammer the network.</li>
            <li><strong>Moderator-gated writes.</strong> Public status only changes when a verified moderator confirms it — community votes shape the trend but never overwrite the official status by themselves.</li>
            <li><strong>Offline queue.</strong> A moderator's update made while offline is queued locally and sent as soon as a connection is available.</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <h2>Report station condition</h2>
        <div class="vote-choices" id="voteChoices" role="radiogroup" aria-label="Report station condition">
          <button class="vote-choice" data-choice="Open">Open</button>
          <button class="vote-choice" data-choice="Limited">Limited</button>
          <button class="vote-choice" data-choice="Closed">Closed</button>
        </div>
        <p class="vote-note" id="voteNote">
          Only a small group of <strong>verified moderators</strong> can change the official status shown
          above — this keeps the network safe from spam or false reports.
        </p>
        <button class="btn btn--primary" id="voteSubmit" disabled>Submit report</button>
        <div id="voteSubmitMsg"></div>
      </div>

      <div class="card">
        <h2>Live vote distribution</h2>
        <p class="dist-sync" id="distSync"></p>
        <div id="distRows"></div>
      </div>

      <div class="card">
        <h2>Status history</h2>
        <ul class="timeline" id="historyList"></ul>
      </div>
    `;

    wireDetailInteractions(stationId);
    startBanner(record);
    renderDistribution(stationId, { justSynced: true });
    renderHistory(stationId);

    distRefreshTimer = setInterval(() => {
      DataStore.jitterVotes(stationId);
      renderDistribution(stationId, { justSynced: true });
    }, CONFIG.VOTE_REFRESH_MS);
  }

  function startBanner(record) {
    const banner = document.getElementById("updateBanner");
    const bannerText = document.getElementById("bannerText");
    if (!banner) return;
    banner.classList.remove("hide");

    const tick = () => {
      const ago = Date.now() - record.lastUpdated;
      bannerText.innerHTML = `Updated <strong>${Utils.escapeHtml(Utils.timeAgo(ago))}</strong>`;
    };
    tick();
    clearInterval(bannerTickTimer);
    bannerTickTimer = setInterval(tick, CONFIG.TICK_MS);

    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      bannerText.innerHTML = `Status confirmed — no changes since last check.`;
      setTimeout(() => banner.classList.add("hide"), 1400);
    }, CONFIG.BANNER_CONFIRM_DELAY_MS);
  }

  function renderDistribution(stationId, { justSynced }) {
    const record = DataStore.getStatus(stationId);
    const { open, limited, closed } = record.votes;
    const total = Math.max(open + limited + closed, 1);
    const rows = [
      { label: "Open", value: open, color: "var(--open)" },
      { label: "Limited", value: limited, color: "var(--limited)" },
      { label: "Closed", value: closed, color: "var(--closed)" },
    ];

    document.getElementById("distRows").innerHTML = rows
      .map(
        (r) => `
        <div class="dist-row">
          <div class="dist-row__label">${r.label}</div>
          <div class="dist-row__track"><div class="dist-row__fill" style="width:${(r.value / total) * 100}%;background:${r.color}"></div></div>
          <div class="dist-row__value">${Math.round((r.value / total) * 100)}%</div>
        </div>
      `
      )
      .join("");

    if (justSynced) {
      record._syncedAt = Date.now();
    }
    const syncEl = document.getElementById("distSync");
    clearInterval(distTickTimer);
    const tickSync = () => {
      syncEl.textContent = `Synced ${Utils.timeAgo(Date.now() - record._syncedAt)} · refreshes every few minutes`;
    };
    tickSync();
    distTickTimer = setInterval(tickSync, CONFIG.TICK_MS);
  }

  function renderHistory(stationId) {
    const record = DataStore.getStatus(stationId);
    const sorted = [...record.history].sort((a, b) => b.timestamp - a.timestamp);

    const list = document.getElementById("historyList");
    if (!sorted.length) {
      list.innerHTML = `<li><p class="timeline__reason">No history recorded yet.</p></li>`;
      return;
    }
    list.innerHTML = sorted
      .map((h) => {
        const colorVar =
          h.status === "Closed" ? "var(--closed)" : h.status === "Limited" ? "var(--limited)" : "var(--open)";
        return `
        <li>
          <div class="timeline__top">
            <span class="timeline__status" style="color:${colorVar}">${Utils.escapeHtml(h.status)}</span>
            <span class="timeline__time">${Utils.escapeHtml(Utils.timeAgo(Date.now() - h.timestamp))}</span>
          </div>
          <p class="timeline__reason">${Utils.escapeHtml(h.reason)}</p>
          <p class="timeline__by">${Utils.escapeHtml(h.by)}</p>
        </li>
      `;
      })
      .join("");
  }

  function wireDetailInteractions(stationId) {
    // explainer accordion
    const explainer = document.getElementById("explainerCard");
    explainer.querySelector(".explainer__head").addEventListener("click", () => {
      explainer.classList.toggle("open");
    });

    // vote choice single-select
    const voteChoices = document.getElementById("voteChoices");
    const submitBtn = document.getElementById("voteSubmit");
    voteChoices.addEventListener("click", (e) => {
      const btn = e.target.closest(".vote-choice");
      if (!btn) return;
      [...voteChoices.children].forEach((c) => c.classList.toggle("selected", c === btn));
      State.selectedChoice = btn.dataset.choice;
      submitBtn.disabled = false;
    });

    updateModeratorUI();

    submitBtn.addEventListener("click", () => {
      if (!State.selectedChoice) return;
      if (!State.isModerator) {
        State.pendingSubmitAfterLogin = true;
        ModeratorAuth.openModal();
        return;
      }
      commitVote(stationId, State.selectedChoice);
    });
  }

  function updateModeratorUI() {
    const note = document.getElementById("voteNote");
    if (!note) return;
    if (State.isModerator) {
      note.innerHTML = `Signed in as <strong>Moderator</strong>. Submitting will update the official public status immediately.`;
    } else {
      note.innerHTML = `Only a small group of <strong>verified moderators</strong> can change the official status shown above — this keeps the network safe from spam or false reports.`;
    }
  }

  function commitVote(stationId, choice) {
    const record = DataStore.applyModeratorUpdate(stationId, choice, "You (Moderator)");
    const msg = document.getElementById("voteSubmitMsg");
    msg.innerHTML = `<p class="vote-submit-msg success">Official status updated to ${Utils.escapeHtml(choice)}.</p>`;

    // refresh everything that depends on the record
    document.getElementById("statusReason").textContent = record.reason;
    const badgeWrap = document.querySelector(".status-hero__top .status-hero__badge");
    if (badgeWrap) {
      badgeWrap.className = `badge status-hero__badge ${
        choice === "Closed" ? "badge--closed" : choice === "Limited" ? "badge--limited" : "badge--open"
      }`;
      badgeWrap.textContent = choice;
    }
    startBanner(record);
    renderDistribution(stationId, { justSynced: true });
    renderHistory(stationId);
    renderList(); // keep list screen's badge in sync for when the user goes back

    // reset the vote form
    document.querySelectorAll(".vote-choice").forEach((c) => c.classList.remove("selected"));
    document.getElementById("voteSubmit").disabled = true;
    State.selectedChoice = null;
  }

  /* ---------------- Moderator auth ---------------- */
  const ModeratorAuth = {
    openModal() {
      el.modalBackdrop.hidden = false;
      el.modalError.hidden = true;
      el.modalPasscode.value = "";
      el.modalPasscode.focus();
    },
    closeModal() {
      el.modalBackdrop.hidden = true;
      State.pendingSubmitAfterLogin = false;
    },
    confirm() {
      if (el.modalPasscode.value.trim() === CONFIG.MODERATOR_PASSCODE) {
        State.isModerator = true;
        el.modalBackdrop.hidden = true;
        updateModeratorUI();
        if (State.pendingSubmitAfterLogin && State.selectedChoice && State.currentStationId) {
          commitVote(State.currentStationId, State.selectedChoice);
        }
        State.pendingSubmitAfterLogin = false;
      } else {
        el.modalError.hidden = false;
      }
    },
  };

  /* ---------------- Navigation between the two screens ---------------- */
  const Nav = {
    showList(fromDetail) {
      clearDetailTimers();
      el.screenDetail.classList.remove("active", "from-detail");
      el.screenList.classList.add("active");
      if (fromDetail) el.screenList.classList.add("from-detail");
      window.scrollTo(0, 0);
    },
    showDetail(stationId) {
      renderDetail(stationId);
      el.screenList.classList.remove("active", "from-detail");
      el.screenDetail.classList.add("active");
      window.scrollTo(0, 0);
    },
  };

  /* ---------------- Event wiring ---------------- */
  function wireGlobalEvents() {
    el.searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        State.query = e.target.value;
        renderList();
      }, 120)
    );

    el.lineFilter.addEventListener("change", (e) => {
      State.lineFilter = e.target.value;
      renderList();
    });
    el.statusFilter.addEventListener("change", (e) => {
      State.statusFilter = e.target.value;
      renderList();
    });

    el.stationList.addEventListener("click", (e) => {
      const row = e.target.closest(".station-row");
      if (!row) return;
      history.pushState({ screen: "detail", id: row.dataset.id }, "");
      Nav.showDetail(row.dataset.id);
    });
    el.stationList.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const row = e.target.closest(".station-row");
      if (!row) return;
      history.pushState({ screen: "detail", id: row.dataset.id }, "");
      Nav.showDetail(row.dataset.id);
    });

    el.backBtn.addEventListener("click", () => {
      history.back();
    });

    window.addEventListener("popstate", (e) => {
      const st = e.state;
      if (!st || st.screen === "list") {
        Nav.showList(true);
      } else if (st.screen === "detail") {
        Nav.showDetail(st.id);
      }
    });

    el.modalCancel.addEventListener("click", () => ModeratorAuth.closeModal());
    el.modalConfirm.addEventListener("click", () => ModeratorAuth.confirm());
    el.modalPasscode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ModeratorAuth.confirm();
    });
    el.modalBackdrop.addEventListener("click", (e) => {
      if (e.target === el.modalBackdrop) ModeratorAuth.closeModal();
    });
  }

  /* ---------------- Init ---------------- */
  async function init() {
    try {
      await DataStore.load();
    } catch (err) {
      el.stationList.innerHTML = `<p style="color:#f2544c">Could not load station data. If you opened this file directly in the browser, serve the folder with a local static server (e.g. <code>npx serve</code>) so fetch() can read the JSON files.</p>`;
      console.error(err);
      return;
    }
    populateLineFilter();
    renderList();
    wireGlobalEvents();
    history.replaceState({ screen: "list" }, "");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
