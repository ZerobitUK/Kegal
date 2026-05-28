// --- APP STATE MANAGEMENT ---
const DEFAULT_ROUTINE = {
  name: 'Standard Daily',
  contract: 5,   // seconds to contract
  relax: 5,      // seconds to relax
  reps: 10,      // reps per set
  sets: 3,       // number of sets
  rest: 10       // seconds rest between sets
};

const PRESETS = [
  {
    name: 'Beginner Tonic',
    desc: 'Gentle introduction. Focuses on muscle awareness and basic control.',
    contract: 3,
    relax: 4,
    reps: 8,
    sets: 2,
    rest: 12
  },
  {
    name: 'Standard Daily',
    desc: 'The ideal maintenance routine for core pelvic floor strength.',
    contract: 5,
    relax: 5,
    reps: 10,
    sets: 3,
    rest: 10
  },
  {
    name: 'Endurance Hold',
    desc: 'Longer hold phases to train deep slow-twitch muscle fibers.',
    contract: 8,
    relax: 6,
    reps: 8,
    sets: 3,
    rest: 15
  },
  {
    name: 'Intense Power',
    desc: 'High-intensity sets with quick recovery intervals.',
    contract: 6,
    relax: 4,
    reps: 12,
    sets: 4,
    rest: 8
  }
];

let state = {
  currentTab: 'workout',
  soundOn: true,
  isRunning: false,
  isPaused: false,
  
  currentRoutine: { ...DEFAULT_ROUTINE },
  
  stats: {
    totalSessions: 0,
    totalDurationMin: 0,
    streak: 0,
    lastWorkoutDate: null // YYYY-MM-DD
  },
  
  history: [],
  
  // Timer State Variables
  workout: {
    currentSet: 1,
    currentRep: 1,
    phase: 'idle', // 'idle', 'contract', 'relax', 'rest'
    phaseTimeRemaining: 0,
    phaseDuration: 0,
    elapsedSeconds: 0
  }
};

// --- AUDIO SYNTHESIZER ENGINE ---
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playChime(type) {
  if (!state.soundOn) return;
  
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    
    if (type === 'contract') {
      // Elegant crystal bell sound (880Hz A5 & 1320Hz E6)
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      const gain2 = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(885, now + 0.15);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      
      gain2.gain.setValueAtTime(0.08, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      
      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(filter);
      gain2.connect(filter);
      filter.connect(audioCtx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);
    } else if (type === 'relax') {
      // Warm, soothing wooden drop chime (329.63Hz E4 & 493.88Hz B4)
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(329.63, now);
      
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(493.88, now);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(700, now); // High filter cut for warm tone
      
      gainNode.gain.setValueAtTime(0.22, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.3);
      osc2.stop(now + 1.3);
    } else if (type === 'rest') {
      // Soft sequence of two small clicks for set break rest
      for (let i = 0; i < 2; i++) {
        const clickTime = now + (i * 0.15);
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, clickTime); // D5
        
        gain.gain.setValueAtTime(0.1, clickTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, clickTime + 0.08);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(clickTime);
        osc.stop(clickTime + 0.09);
      }
    } else if (type === 'complete') {
      // Heavenly arpeggiated success chords (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const noteTime = now + (idx * 0.12);
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);
        
        gain.gain.setValueAtTime(0.12, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 1.2);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(noteTime);
        osc.stop(noteTime + 1.3);
      });
    }
  } catch (error) {
    console.warn("Audio synthesis context could not start: ", error);
  }
}

// --- LOCAL STORAGE & DATA HANDLING ---
const STORAGE_KEYS = {
  ROUTINE: 'kegel_current_routine',
  STATS: 'kegel_stats',
  HISTORY: 'kegel_workout_history',
  SOUND: 'kegel_sound_preference'
};

function getTodayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadState() {
  // Load Sound Setting
  const savedSound = localStorage.getItem(STORAGE_KEYS.SOUND);
  if (savedSound !== null) {
    state.soundOn = savedSound === 'true';
  }
  
  // Load Custom Routine
  const savedRoutine = localStorage.getItem(STORAGE_KEYS.ROUTINE);
  if (savedRoutine) {
    try {
      state.currentRoutine = JSON.parse(savedRoutine);
    } catch(e) {
      state.currentRoutine = { ...DEFAULT_ROUTINE };
    }
  }
  
  // Load Stats
  const savedStats = localStorage.getItem(STORAGE_KEYS.STATS);
  if (savedStats) {
    try {
      state.stats = JSON.parse(savedStats);
    } catch(e) {
      console.warn("Resetting stats due to parse error");
    }
  }
  
  // Load History
  const savedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
  if (savedHistory) {
    try {
      state.history = JSON.parse(savedHistory);
    } catch(e) {
      state.history = [];
    }
  }
  
  // Compute/Clean Up Streak on startup
  verifyStreakValidity();
}

function saveRoutine() {
  localStorage.setItem(STORAGE_KEYS.ROUTINE, JSON.stringify(state.currentRoutine));
}

function saveStats() {
  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(state.stats));
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.history));
}

function saveSoundPreference() {
  localStorage.setItem(STORAGE_KEYS.SOUND, state.soundOn.toString());
}

// Verify if the streak should be broken because the user skipped a day
function verifyStreakValidity() {
  if (!state.stats.lastWorkoutDate) {
    state.stats.streak = 0;
    saveStats();
    return;
  }
  
  const todayStr = getTodayString();
  const lastDateStr = state.stats.lastWorkoutDate;
  
  if (todayStr === lastDateStr) return; // Workout done today, streak active
  
  const today = new Date(todayStr);
  const lastWorkout = new Date(lastDateStr);
  
  // Difference in milliseconds
  const diffTime = Math.abs(today - lastWorkout);
  // Difference in days
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays > 1) {
    // Broke streak!
    state.stats.streak = 0;
    saveStats();
  }
}

// Increment workout and compute streak on success
function recordWorkoutCompletion() {
  const todayStr = getTodayString();
  const lastDateStr = state.stats.lastWorkoutDate;
  
  let newStreak = state.stats.streak;
  let streakMilestoneTriggered = false;
  
  if (!lastDateStr) {
    newStreak = 1;
    streakMilestoneTriggered = true;
  } else if (lastDateStr === todayStr) {
    // Already did a workout today, streak remains same, but record session
    newStreak = state.stats.streak || 1;
  } else {
    const today = new Date(todayStr);
    const lastWorkout = new Date(lastDateStr);
    const diffTime = Math.abs(today - lastWorkout);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      newStreak = (state.stats.streak || 0) + 1;
      streakMilestoneTriggered = true;
    } else {
      newStreak = 1;
      streakMilestoneTriggered = true;
    }
  }
  
  // Calculate completed routine duration
  const activeRoutine = state.currentRoutine;
  const cycleSeconds = activeRoutine.contract + activeRoutine.relax;
  const setSeconds = cycleSeconds * activeRoutine.reps;
  const totalSeconds = (setSeconds * activeRoutine.sets) + (activeRoutine.rest * (activeRoutine.sets - 1));
  const elapsedMin = parseFloat((totalSeconds / 60).toFixed(1));
  
  // Update stats
  state.stats.totalSessions += 1;
  state.stats.totalDurationMin = parseFloat((state.stats.totalDurationMin + elapsedMin).toFixed(1));
  state.stats.streak = newStreak;
  state.stats.lastWorkoutDate = todayStr;
  saveStats();
  
  // Save to History List
  const newHistoryItem = {
    id: Date.now().toString(),
    date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    dateKey: todayStr, // YYYY-MM-DD
    routineName: activeRoutine.name,
    contract: activeRoutine.contract,
    relax: activeRoutine.relax,
    reps: activeRoutine.reps,
    sets: activeRoutine.sets,
    duration: formatDurationString(totalSeconds),
    percentage: 100
  };
  
  state.history.unshift(newHistoryItem);
  saveHistory();
  
  // Render toast for completions
  if (streakMilestoneTriggered) {
    showToast(`Workout Completed! ${newStreak} Day Streak 🔥`, 'streak');
  } else {
    showToast("Workout Completed! Excellent work! 🎉", 'complete');
  }
  
  renderAll();
}

function formatDurationString(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// --- DYNAMIC TOAST SYSTEM ---
function showToast(message, type = 'default') {
  const toast = document.getElementById('toast-notification');
  const textNode = document.getElementById('toast-text');
  const iconNode = document.getElementById('toast-icon-wrapper');
  
  textNode.textContent = message;
  
  // Select icon
  if (type === 'streak') {
    iconNode.innerHTML = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M136,80v48a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h40V80a8,8,0,0,1,16,0Zm96,48A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>`;
    const iconSvg = iconNode.querySelector('svg');
    iconSvg.style.color = '#f59e0b'; // Amber streak
  } else {
    iconNode.innerHTML = `<svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,93.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,156.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"/></svg>`;
    const iconSvg = iconNode.querySelector('svg');
    iconSvg.style.color = '#10b981'; // Green
  }
  
  toast.classList.add('active');
  
  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// --- TIMER ENGINE LOGIC ---
let lastTime = 0;
let timerAnimationFrameId = null;

function startWorkout() {
  if (state.isRunning && !state.isPaused) return;
  
  initAudio();
  
  if (!state.isRunning) {
    // Commencing new workout
    state.isRunning = true;
    state.isPaused = false;
    state.workout.currentSet = 1;
    state.workout.currentRep = 1;
    state.workout.phase = 'contract';
    state.workout.phaseDuration = state.currentRoutine.contract;
    state.workout.phaseTimeRemaining = state.currentRoutine.contract;
    state.workout.elapsedSeconds = 0;
    
    playChime('contract');
  } else {
    // Resuming paused workout
    state.isPaused = false;
  }
  
  lastTime = performance.now();
  timerAnimationFrameId = requestAnimationFrame(timerTick);
  
  renderAll();
}

function pauseWorkout() {
  if (!state.isRunning || state.isPaused) return;
  state.isPaused = true;
  cancelAnimationFrame(timerAnimationFrameId);
  renderAll();
}

function resetWorkout() {
  state.isRunning = false;
  state.isPaused = false;
  cancelAnimationFrame(timerAnimationFrameId);
  
  state.workout.currentSet = 1;
  state.workout.currentRep = 1;
  state.workout.phase = 'idle';
  state.workout.phaseDuration = 0;
  state.workout.phaseTimeRemaining = 0;
  state.workout.elapsedSeconds = 0;
  
  renderAll();
}

function skipPhase() {
  if (!state.isRunning) return;
  // Set remaining time to 0 to immediately trigger next phase logic on next animation frame
  state.workout.phaseTimeRemaining = 0;
  
  // Re-run standard state tick directly
  handlePhaseTransition();
  renderAll();
}

function timerTick(now) {
  if (!state.isRunning || state.isPaused) return;
  
  const delta = (now - lastTime) / 1000;
  lastTime = now;
  
  state.workout.phaseTimeRemaining -= delta;
  state.workout.elapsedSeconds += delta;
  
  if (state.workout.phaseTimeRemaining <= 0) {
    handlePhaseTransition();
  }
  
  renderTimerUI();
  
  timerAnimationFrameId = requestAnimationFrame(timerTick);
}

function handlePhaseTransition() {
  const activeRoutine = state.currentRoutine;
  
  if (state.workout.phase === 'contract') {
    // Hold complete, move to relax
    state.workout.phase = 'relax';
    state.workout.phaseDuration = activeRoutine.relax;
    state.workout.phaseTimeRemaining = activeRoutine.relax;
    playChime('relax');
  } else if (state.workout.phase === 'relax') {
    // Rep cycle complete
    if (state.workout.currentRep < activeRoutine.reps) {
      // More reps in set remaining
      state.workout.currentRep += 1;
      state.workout.phase = 'contract';
      state.workout.phaseDuration = activeRoutine.contract;
      state.workout.phaseTimeRemaining = activeRoutine.contract;
      playChime('contract');
    } else {
      // Set completed!
      if (state.workout.currentSet < activeRoutine.sets) {
        // Inter-set rest break
        state.workout.currentSet += 1;
        state.workout.currentRep = 1;
        state.workout.phase = 'rest';
        state.workout.phaseDuration = activeRoutine.rest;
        state.workout.phaseTimeRemaining = activeRoutine.rest;
        playChime('rest');
      } else {
        // Complete Workout!
        state.isRunning = false;
        cancelAnimationFrame(timerAnimationFrameId);
        state.workout.phase = 'idle';
        state.workout.phaseDuration = 0;
        state.workout.phaseTimeRemaining = 0;
        playChime('complete');
        recordWorkoutCompletion();
      }
    }
  } else if (state.workout.phase === 'rest') {
    // Rest complete, begin first rep of next set
    state.workout.phase = 'contract';
    state.workout.phaseDuration = activeRoutine.contract;
    state.workout.phaseTimeRemaining = activeRoutine.contract;
    playChime('contract');
  }
}

// --- RENDERING & UI SYNCING ---

function renderAll() {
  renderTabs();
  renderTimerUI();
  renderRoutinesList();
  renderProgressDashboard();
}

function renderTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tabId = btn.getAttribute('data-tab');
    if (tabId === state.currentTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  document.querySelectorAll('.tab-content').forEach(view => {
    const viewId = view.getAttribute('id');
    if (viewId === `tab-${state.currentTab}`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });
}

function renderTimerUI() {
  const container = document.getElementById('timer-dashboard');
  const stateLabel = document.getElementById('timer-state-label');
  const countdownVal = document.getElementById('timer-countdown-val');
  const subText = document.getElementById('timer-sub-text');
  
  const setVal = document.getElementById('stat-set-val');
  const repVal = document.getElementById('stat-rep-val');
  const elapsedVal = document.getElementById('stat-elapsed-val');
  
  const playBtn = document.getElementById('btn-play-pause');
  const skipBtn = document.getElementById('btn-skip');
  const soundBtn = document.getElementById('btn-sound-toggle');
  
  // Set visual active wrapper style classes
  container.className = 'timer-container'; // clear first
  
  // Sound controls
  if (state.soundOn) {
    soundBtn.classList.add('sound-on');
    soundBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M160,32V224a8,8,0,0,1-12.91,6.31L77.25,176H40a16,16,0,0,1-16-16V96A16,16,0,0,1,40,80H77.25l69.84-54.31A8,8,0,0,1,160,32Zm-16,21.84L82.91,98.31A8,8,0,0,1,77.25,100H40v56H77.25a8,8,0,0,1,5.66,1.69L144,202.16ZM213.66,82.34a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32,0,8,8,0,0,1,0-11.32l24-24A8,8,0,0,1,213.66,82.34Zm0,80a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,0-11.32,8,8,0,0,1,11.32,0l24,24A8,8,0,0,1,213.66,162.34Z"/></svg> Sound On`;
  } else {
    soundBtn.classList.remove('sound-on');
    soundBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M152,75.29V180.71a8,8,0,0,1-12.91,6.31L77.25,140H48V116H77.25l61.84-48.1a8,8,0,0,1,12.91,6.31ZM216,128c0-29.23-14.7-55.85-39.31-71.18a8,8,0,0,0-8.29,13.7c19.67,11.9,31.6,32.74,31.6,57.48s-11.93,45.58-31.6,57.48a8,8,0,0,0,4.15,14.93,8,8,0,0,0,4.14-1.23C201.3,183.85,216,157.23,216,128ZM40,80h0ZM120,40h0Z"/></svg> Sound Off`;
  }
  
  if (!state.isRunning) {
    container.classList.add('state-idle');
    stateLabel.textContent = "Ready";
    countdownVal.textContent = "Start";
    subText.textContent = state.currentRoutine.name;
    
    setVal.textContent = `0 / ${state.currentRoutine.sets}`;
    repVal.textContent = `0 / ${state.currentRoutine.reps}`;
    elapsedVal.textContent = "00:00";
    
    playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    playBtn.setAttribute('title', 'Start Workout');
    skipBtn.style.opacity = '0.3';
    skipBtn.style.pointerEvents = 'none';
    
    updateSvgCircleRing(1.0);
  } else {
    // Running or paused state
    skipBtn.style.opacity = '1';
    skipBtn.style.pointerEvents = 'all';
    
    if (state.isPaused) {
      playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      playBtn.setAttribute('title', 'Resume Workout');
    } else {
      playBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
      playBtn.setAttribute('title', 'Pause Workout');
    }
    
    const timeRemaining = Math.max(0, Math.ceil(state.workout.phaseTimeRemaining));
    
    setVal.textContent = `${state.workout.currentSet} / ${state.currentRoutine.sets}`;
    repVal.textContent = `${state.workout.currentRep} / ${state.currentRoutine.reps}`;
    
    const minutes = String(Math.floor(state.workout.elapsedSeconds / 60)).padStart(2, '0');
    const seconds = String(Math.floor(state.workout.elapsedSeconds % 60)).padStart(2, '0');
    elapsedVal.textContent = `${minutes}:${seconds}`;
    
    if (state.workout.phase === 'contract') {
      container.classList.add('state-contract');
      stateLabel.textContent = "Contract";
      countdownVal.textContent = timeRemaining;
      subText.textContent = "Squeeze pelvic muscles";
    } else if (state.workout.phase === 'relax') {
      container.classList.add('state-relax');
      stateLabel.textContent = "Relax";
      countdownVal.textContent = timeRemaining;
      subText.textContent = "Release and breathe";
    } else if (state.workout.phase === 'rest') {
      container.classList.add('state-idle');
      stateLabel.textContent = "Set Break Rest";
      countdownVal.textContent = timeRemaining;
      subText.textContent = "Relax before next set";
    }
    
    // Update Ring Offset
    const progress = state.workout.phaseTimeRemaining / state.workout.phaseDuration;
    updateSvgCircleRing(progress);
  }
}

function updateSvgCircleRing(progress) {
  const ring = document.getElementById('timer-ring-fg');
  if (!ring) return;
  // Circumference = 2 * pi * r. With viewPort logic:
  // Inside style.css, circumference matches stroke-dasharray = 691. Let's use 691 as base.
  const circumference = 691;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  ring.style.strokeDashoffset = offset;
}

function renderRoutinesList() {
  // Sync routine parameters input values
  const r = state.currentRoutine;
  document.getElementById('input-contract').value = r.contract;
  document.getElementById('input-relax').value = r.relax;
  document.getElementById('input-reps').value = r.reps;
  document.getElementById('input-sets').value = r.sets;
  document.getElementById('input-rest').value = r.rest;
  
  // Render Preset Selection Indicators
  const container = document.getElementById('preset-cards-container');
  container.innerHTML = '';
  
  PRESETS.forEach(preset => {
    const isSelected = 
      r.contract === preset.contract &&
      r.relax === preset.relax &&
      r.reps === preset.reps &&
      r.sets === preset.sets &&
      r.rest === preset.rest;
      
    const activeClass = isSelected ? 'active' : '';
    
    const card = document.createElement('div');
    card.className = `preset-card ${activeClass}`;
    card.innerHTML = `
      <div class="preset-name">${preset.name}</div>
      <div class="preset-desc">${preset.desc}</div>
      <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.4rem; font-weight:600;">
        ${preset.contract}s Hold / ${preset.relax}s Relax • ${preset.reps} Reps • ${preset.sets} Sets
      </div>
    `;
    
    card.addEventListener('click', () => {
      state.currentRoutine = {
        name: preset.name,
        contract: preset.contract,
        relax: preset.relax,
        reps: preset.reps,
        sets: preset.sets,
        rest: preset.rest
      };
      saveRoutine();
      showToast(`Selected Preset: ${preset.name}`);
      renderAll();
    });
    
    container.appendChild(card);
  });
}

function renderProgressDashboard() {
  // Statistics panels
  document.getElementById('stat-streak-val').textContent = `${state.stats.streak} Days`;
  document.getElementById('stat-total-sessions-val').textContent = state.stats.totalSessions;
  document.getElementById('stat-total-duration-val').textContent = `${state.stats.totalDurationMin}m`;
  
  // Render Week-at-a-Glance
  renderWeekAtAGlance();
  
  // Render History List
  renderHistoryList();
}

function renderWeekAtAGlance() {
  const container = document.getElementById('calendar-bar');
  container.innerHTML = '';
  
  const today = new Date();
  const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // We want to render Mon, Tue, Wed, Thu, Fri, Sat, Sun.
  // Standard JS: 0 = Sun. Let's align so Monday is first day of weekly array.
  // Weekly offsets: Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(0).
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Find Monday of the current week
  const startOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const mondayDate = new Date(today);
  mondayDate.setDate(today.getDate() + startOffset);
  
  for (let i = 0; i < 7; i++) {
    const loopDate = new Date(mondayDate);
    loopDate.setDate(mondayDate.getDate() + i);
    
    const dayLabelStr = weekdayNames[loopDate.getDay()];
    const dateNum = loopDate.getDate();
    
    // Check if this date has a completed workout in history
    const loopDateString = `${loopDate.getFullYear()}-${String(loopDate.getMonth() + 1).padStart(2, '0')}-${String(loopDate.getDate()).padStart(2, '0')}`;
    const completed = state.history.some(item => item.dateKey === loopDateString);
    const isToday = loopDateString === getTodayString();
    
    const completedClass = completed ? 'completed' : '';
    const todayClass = isToday ? 'today' : '';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'day-bubble-wrapper';
    wrapper.innerHTML = `
      <div class="day-label">${dayLabelStr}</div>
      <div class="day-bubble ${completedClass} ${todayClass}">${dateNum}</div>
    `;
    
    container.appendChild(wrapper);
  }
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  container.innerHTML = '';
  
  if (state.history.length === 0) {
    container.innerHTML = `<div class="empty-history-text">No workouts completed yet. Your logs will appear here.</div>`;
    return;
  }
  
  state.history.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div class="history-details">
        <div class="history-routine-name">${item.routineName}</div>
        <div class="history-meta">
          ${item.contract}s hold / ${item.relax}s rest • ${item.reps} reps • ${item.sets} sets
        </div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.15rem;">
          ${item.date}
        </div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.25rem;">
        <span class="history-badge">Complete</span>
        <span style="font-size: 0.75rem; color:var(--text-secondary); font-weight:600;">${item.duration}</span>
      </div>
    `;
    container.appendChild(el);
  });
}

// --- EVENT BINDING & INTENT HANDLERS ---

document.addEventListener('DOMContentLoaded', () => {
  // Load State from local storage
  loadState();
  
  // Navigation tabs clicks
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      // If timer is running, prompt or keep tab? We'll let them switch tabs without losing timer!
      // This is a premium touch: active workouts keep running in background!
      state.currentTab = tabId;
      renderAll();
    });
  });
  
  // Timer buttons
  document.getElementById('btn-play-pause').addEventListener('click', () => {
    if (state.isRunning && !state.isPaused) {
      pauseWorkout();
    } else {
      startWorkout();
    }
  });
  
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm("Are you sure you want to stop and reset your active workout?")) {
      resetWorkout();
    }
  });
  
  document.getElementById('btn-skip').addEventListener('click', () => {
    skipPhase();
  });
  
  document.getElementById('btn-sound-toggle').addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    saveSoundPreference();
    initAudio();
    if (state.soundOn) {
      playChime('contract'); // Play quick sample bell on enable
    }
    renderTimerUI();
  });
  
  // Routine Customizer form submission
  document.getElementById('routine-config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const contract = parseInt(document.getElementById('input-contract').value) || 5;
    const relax = parseInt(document.getElementById('input-relax').value) || 5;
    const reps = parseInt(document.getElementById('input-reps').value) || 10;
    const sets = parseInt(document.getElementById('input-sets').value) || 3;
    const rest = parseInt(document.getElementById('input-rest').value) || 10;
    
    // Save to state
    state.currentRoutine = {
      name: 'Custom Routine',
      contract,
      relax,
      reps,
      sets,
      rest
    };
    
    saveRoutine();
    showToast("Routine Saved!");
    
    // Redirect to timer automatically for user convenience
    state.currentTab = 'workout';
    
    // If workout is not running, let's reset to configure values
    if (!state.isRunning) {
      resetWorkout();
    }
    
    renderAll();
  });
  
  // Clear history action
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (confirm("This will permanently clear your workout log and reset your daily streak. Are you sure?")) {
      state.history = [];
      state.stats = {
        totalSessions: 0,
        totalDurationMin: 0,
        streak: 0,
        lastWorkoutDate: null
      };
      saveHistory();
      saveStats();
      showToast("All logs and streaks reset.");
      renderAll();
    }
  });
  
  // Initialize Rendering
  renderAll();
});
