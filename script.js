// MetroRoute Delhi - Interactive Script with Working Moderator Sign-In

const DEMO_PASSCODE = "METRO2026";
let isModerator = false;

// Sample Station Data
const stations = [
  { id: 1, name: "Rajiv Chowk", line: "Yellow", status: "Open", info: "Interchange available for Blue Line. High footfall expected." },
  { id: 2, name: "Kashmere Gate", line: "Red", status: "Open", info: "Major junction connecting Red, Yellow, and Violet lines." },
  { id: 3, name: "Hauz Khas", line: "Yellow", status: "Limited", info: "Gate 2 temporarily closed for maintenance works." },
  { id: 4, name: "Mandai House", line: "Violet", status: "Open", info: "Normal operations across all platforms." },
  { id: 5, name: "Central Secretariat", line: "Yellow", status: "Closed", info: "Station closed due to official event security protocol." }
];

// DOM Elements
const modalBackdrop = document.getElementById('modalBackdrop');
const modalPasscode = document.getElementById('modalPasscode');
const modalError = document.getElementById('modalError');
const modalConfirm = document.getElementById('modalConfirm');
const modalCancel = document.getElementById('modalCancel');
const modSignInBtn = document.getElementById('modSignInBtn');
const userStatusBadge = document.getElementById('userStatusBadge');

const searchInput = document.getElementById('searchInput');
const lineFilter = document.getElementById('lineFilter');
const statusFilter = document.getElementById('statusFilter');
const stationList = document.getElementById('stationList');
const emptyState = document.getElementById('emptyState');
const resultsCount = document.getElementById('resultsCount');

const screenList = document.getElementById('screen-list');
const screenDetail = document.getElementById('screen-detail');
const detailContent = document.getElementById('detailContent');
const backBtn = document.getElementById('backBtn');

// Open Modal
if (modSignInBtn) {
  modSignInBtn.addEventListener('click', () => {
    if (isModerator) {
      isModerator = false;
      modSignInBtn.textContent = 'Moderator Sign In';
      modSignInBtn.classList.remove('btn--active');
      alert('You have signed out as Moderator.');
      renderStations();
      return;
    }
    modalBackdrop.hidden = false;
    modalPasscode.value = '';
    modalError.hidden = true;
    modalPasscode.focus();
  });
}

// Close Modal
modalCancel.addEventListener('click', closeModal);

function closeModal() {
  modalBackdrop.hidden = true;
  modalError.hidden = true;
  modalPasscode.value = '';
}

// Passcode Validation / Sign-in Logic (FIXED & FULLY FUNCTIONAL)
modalConfirm.addEventListener('click', handleSignIn);

modalPasscode.addEventListener('keyup', (event) => {
  if (event.key === 'Enter') {
    handleSignIn();
  }
});

function handleSignIn() {
  const enteredPasscode = modalPasscode.value.trim();

  if (enteredPasscode === DEMO_PASSCODE) {
    // 1. Clear and hide error
    modalError.hidden = true;
    
    // 2. Hide modal dialog (BYPASS / CLOSE MODAL)
    modalBackdrop.hidden = true;
    
    // 3. Clear passcode input field
    modalPasscode.value = '';

    // 4. Update moderator status
    isModerator = true;
    if (modSignInBtn) {
      modSignInBtn.textContent = 'Signed in (Moderator) — Click to Sign out';
      modSignInBtn.classList.add('btn--active');
    }
    
    alert('Successfully signed in as Moderator!');
    renderStations();
  } else {
    // Show error message on failed attempt
    modalError.hidden = false;
  }
}

// Station List Rendering & Filtering
function renderStations() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedLine = lineFilter.value;
  const selectedStatus = statusFilter.value;

  const filtered = stations.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(query);
    const matchesLine = selectedLine === 'All' || s.line === selectedLine;
    const matchesStatus = selectedStatus === 'All' || s.status === selectedStatus;
    return matchesSearch && matchesLine && matchesStatus;
  });

  stationList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.hidden = false;
    resultsCount.textContent = 'No stations found';
    return;
  }

  emptyState.hidden = true;
  resultsCount.textContent = `Showing ${filtered.length} station${filtered.length > 1 ? 's' : ''}`;

  filtered.forEach(station => {
    const li = document.createElement('li');
    li.className = 'station-item';
    li.innerHTML = `
      <div class="station-info">
        <h3>${station.name}</h3>
        <span class="badge badge--${station.line.toLowerCase()}">${station.line} Line</span>
      </div>
      <div class="station-status status--${station.status.toLowerCase()}">
        ${station.status}
      </div>
    `;
    li.addEventListener('click', () => showDetail(station));
    stationList.appendChild(li);
  });
}

function showDetail(station) {
  screenList.classList.remove('active');
  screenDetail.classList.add('active');

  detailContent.innerHTML = `
    <h2>${station.name} Station</h2>
    <p><strong>Line:</strong> ${station.line} Line</p>
    <p><strong>Current Status:</strong> <span class="status--${station.status.toLowerCase()}">${station.status}</span></p>
    <p><strong>Operational Details:</strong> ${station.info}</p>
    ${isModerator ? `
      <div class="mod-controls">
        <h4>Moderator Controls</h4>
        <p>Change Station Status:</p>
        <button class="btn btn--small" onclick="updateStatus(${station.id}, 'Open')">Set Open</button>
        <button class="btn btn--small" onclick="updateStatus(${station.id}, 'Limited')">Set Limited</button>
        <button class="btn btn--small" onclick="updateStatus(${station.id}, 'Closed')">Set Closed</button>
      </div>
    ` : ''}
  `;
}

window.updateStatus = function(id, newStatus) {
  const st = stations.find(s => s.id === id);
  if (st) {
    st.status = newStatus;
    showDetail(st);
    alert(`Status updated to ${newStatus}`);
  }
};

backBtn.addEventListener('click', () => {
  screenDetail.classList.remove('active');
  screenList.classList.add('active');
  renderStations();
});

// Event Listeners for Filters
searchInput.addEventListener('input', renderStations);
lineFilter.addEventListener('change', renderStations);
statusFilter.addEventListener('change', renderStations);

// Initial Render
renderStations();
