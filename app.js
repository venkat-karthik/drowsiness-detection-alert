// FaceLandmarker and FilesetResolver will be loaded dynamically
let FaceLandmarker = null;
let FilesetResolver = null;

// DOM Elements
const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const chartCanvas = document.getElementById("ear-chart");
const chartCtx = chartCanvas.getContext("2d");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingSubtext = document.getElementById("loading-subtext");
const btnToggleCamera = document.getElementById("btn-toggle-camera");

// Metrics & Stats Elements
const statusValue = document.getElementById("status-val");
const statusCard = document.getElementById("status-card");
const bannerAlert = document.getElementById("banner-alert");
const earText = document.getElementById("ear-text");
const earBar = document.getElementById("ear-bar");
const durationText = document.getElementById("stat-duration");
const blinksText = document.getElementById("stat-blinks");
const alertsText = document.getElementById("stat-alerts");

// Settings Elements
const sliderThreshold = document.getElementById("threshold-ear");
const valThreshold = document.getElementById("threshold-ear-val");
const sliderFrames = document.getElementById("threshold-frames");
const valFrames = document.getElementById("threshold-frames-val");
const sliderVolume = document.getElementById("volume");
const valVolume = document.getElementById("volume-val");
const emergencyOverlay = document.getElementById("emergency-overlay");

// Audio Selector Buttons
const audioButtons = document.querySelectorAll(".btn-radio");

// Application State Variables
let faceLandmarker = null;
let stream = null;
let isMonitoring = false;
let animationFrameId = null;
let lastVideoTime = -1;

// EAR & Calibration Parameters (Synced from UI)
let earThreshold = parseFloat(sliderThreshold.value);
let frameCheck = parseInt(sliderFrames.value);
let alarmVolume = parseFloat(sliderVolume.value) / 100;
let alarmType = "beep"; // beep, siren, digital

// Alert State variables
let flag = 0; // frame count with low EAR
let totalAlerts = 0;
let totalBlinks = 0;
let isAlertActive = false;
let sessionStartTime = null;
let earHistory = []; // last 100 frames for graph

// Blink tracking auxiliary variables
let wasEyesClosed = false;
let closedEyeFrames = 0;

// Audio synthesis variables
let audioCtx = null;
let alarmInterval = null;
let mainOscillator = null;
let modulationOscillator = null;
let gainNode = null;

// MediaPipe Landmark Indices for the Eyes
const RIGHT_EYE = {
  outerCorner: 33,
  innerCorner: 133,
  upperLid1: 159,
  upperLid2: 158,
  lowerLid1: 144,
  lowerLid2: 153,
  all: [33, 159, 158, 133, 153, 144]
};

const LEFT_EYE = {
  outerCorner: 362,
  innerCorner: 263,
  upperLid1: 386,
  upperLid2: 385,
  lowerLid1: 374,
  lowerLid2: 380,
  all: [362, 386, 385, 263, 380, 374]
};

// Initialize Application
async function init() {
  try {
    loadingSubtext.innerText = "Connecting to MediaPipe CDN...";
    const module = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs");
    FaceLandmarker = module.FaceLandmarker;
    FilesetResolver = module.FilesetResolver;

    loadingSubtext.innerText = "Loading MediaPipe WebAssembly modules...";
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
    );
    
    loadingSubtext.innerText = "Downloading FaceLandmarker network model (15MB)...";
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1
    });
    
    loadingOverlay.style.opacity = 0;
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 400);
    
    // Enable controls
    btnToggleCamera.disabled = false;
    setupEventListeners();
    resizeCanvas();
    window.addEventListener("resize", () => {
      resizeCanvas();
      drawChart();
    });
    
    // Initialize EAR history with default value
    for (let i = 0; i < 100; i++) {
      earHistory.push(0.3);
    }
    drawChart();
  } catch (error) {
    console.error("Initialization error:", error);
    loadingSubtext.innerHTML = `<span style="color: var(--color-danger)">Error loading assets: ${error.message || error}. Please refresh or check browser console.</span>`;
  }
}

// Adjust Canvas sizing
function resizeCanvas() {
  const container = video.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  
  chartCanvas.width = chartCanvas.parentElement.clientWidth;
  chartCanvas.height = chartCanvas.parentElement.clientHeight;
}

// Event Listeners setup
function setupEventListeners() {
  btnToggleCamera.addEventListener("click", toggleCamera);
  
  sliderThreshold.addEventListener("input", (e) => {
    earThreshold = parseFloat(e.target.value);
    valThreshold.innerText = earThreshold.toFixed(2);
    drawChart();
  });
  
  sliderFrames.addEventListener("input", (e) => {
    frameCheck = parseInt(e.target.value);
    valFrames.innerText = frameCheck;
  });
  
  sliderVolume.addEventListener("input", (e) => {
    alarmVolume = parseFloat(e.target.value) / 100;
    valVolume.innerText = e.target.value + "%";
    if (gainNode) {
      gainNode.gain.value = alarmVolume;
    }
  });
  
  audioButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      audioButtons.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      alarmType = e.target.dataset.sound;
      
      // Briefly trigger alarm test if playing
      if (isAlertActive) {
        stopAlarmSound();
        playAlarmSound();
      }
    });
  });
}

// Web Audio API Alarm Synthesis
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playAlarmSound() {
  initAudio();
  if (alarmInterval) return; // already playing
  
  gainNode = audioCtx.createGain();
  gainNode.gain.value = alarmVolume;
  gainNode.connect(audioCtx.destination);
  
  if (alarmType === "beep") {
    // Simple Pulsating Beeps
    let isBeeping = false;
    alarmInterval = setInterval(() => {
      if (isBeeping) {
        if (mainOscillator) {
          try { mainOscillator.stop(); } catch(e){}
          mainOscillator = null;
        }
        isBeeping = false;
      } else {
        mainOscillator = audioCtx.createOscillator();
        mainOscillator.type = "sine";
        mainOscillator.frequency.value = 1000; // 1000Hz
        mainOscillator.connect(gainNode);
        mainOscillator.start();
        isBeeping = true;
      }
    }, 200);
  } else if (alarmType === "siren") {
    // Continuous frequency-modulated sweep (Wailing Siren)
    mainOscillator = audioCtx.createOscillator();
    modulationOscillator = audioCtx.createOscillator();
    const modulationGain = audioCtx.createGain();
    
    mainOscillator.type = "sawtooth";
    mainOscillator.frequency.value = 850;
    
    modulationOscillator.type = "sine";
    modulationOscillator.frequency.value = 2.5; // Frequency of wail (2.5 Hz)
    
    modulationGain.gain.value = 250; // Amplitude of wail (+- 250 Hz)
    
    modulationOscillator.connect(modulationGain);
    modulationGain.connect(mainOscillator.frequency);
    
    mainOscillator.connect(gainNode);
    
    mainOscillator.start();
    modulationOscillator.start();
    
    alarmInterval = true; // flag to signify wailing
  } else if (alarmType === "digital") {
    // Sharp high pitch double-beeps
    let pulseCount = 0;
    alarmInterval = setInterval(() => {
      pulseCount = (pulseCount + 1) % 6;
      if (pulseCount === 0 || pulseCount === 2) {
        mainOscillator = audioCtx.createOscillator();
        mainOscillator.type = "triangle";
        mainOscillator.frequency.value = 2400; // high frequency
        mainOscillator.connect(gainNode);
        mainOscillator.start();
      } else if (pulseCount === 1 || pulseCount === 3) {
        if (mainOscillator) {
          try { mainOscillator.stop(); } catch(e){}
          mainOscillator = null;
        }
      }
    }, 120);
  }
}

function stopAlarmSound() {
  if (alarmInterval) {
    if (typeof alarmInterval === "number" || typeof alarmInterval === "object") {
      clearInterval(alarmInterval);
    }
    alarmInterval = null;
  }
  if (mainOscillator) {
    try { mainOscillator.stop(); } catch(e){}
    mainOscillator = null;
  }
  if (modulationOscillator) {
    try { modulationOscillator.stop(); } catch(e){}
    modulationOscillator = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
}

// Start / Stop Camera Stream
async function toggleCamera() {
  if (isMonitoring) {
    stopMonitoring();
  } else {
    await startMonitoring();
  }
}

async function startMonitoring() {
  try {
    initAudio();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });
    video.srcObject = stream;
    video.play();
    
    isMonitoring = true;
    btnToggleCamera.innerHTML = `<i class="fas fa-video-slash"></i> Stop Monitoring`;
    btnToggleCamera.classList.remove("btn-primary");
    btnToggleCamera.classList.add("btn-secondary");
    
    sessionStartTime = Date.now();
    lastVideoTime = -1;
    flag = 0;
    
    video.addEventListener("loadeddata", onVideoPlay);
  } catch (error) {
    console.error("Camera access denied or failed:", error);
    alert("Camera permission is required for face and drowsiness tracking.");
  }
}

function stopMonitoring() {
  isMonitoring = false;
  btnToggleCamera.innerHTML = `<i class="fas fa-video"></i> Start Monitoring`;
  btnToggleCamera.classList.add("btn-primary");
  btnToggleCamera.classList.remove("btn-secondary");
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.srcObject = null;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stopAlarmSound();
  clearAlertState();
  
  // reset metrics
  statusValue.innerText = "OFFLINE";
  statusValue.className = "status-value";
  durationText.innerText = "00:00";
}

function onVideoPlay() {
  if (!isMonitoring) return;
  
  resizeCanvas();
  
  async function predictLoop() {
    if (!isMonitoring) return;
    
    // Check if video has new frame
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      
      const startTimeMs = performance.now();
      const results = faceLandmarker.detectForVideo(video, startTimeMs);
      
      // Clear overlay canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        processLandmarks(results.faceLandmarks[0]);
      } else {
        // Face lost
        handleFaceLost();
      }
    }
    
    // Update Session Timer
    if (sessionStartTime) {
      const diffSecs = Math.floor((Date.now() - sessionStartTime) / 1000);
      const mins = Math.floor(diffSecs / 60).toString().padStart(2, '0');
      const secs = (diffSecs % 60).toString().padStart(2, '0');
      durationText.innerText = `${mins}:${secs}`;
    }
    
    animationFrameId = requestAnimationFrame(predictLoop);
  }
  
  animationFrameId = requestAnimationFrame(predictLoop);
}

// Distance computation helper
function getDistance(p1, p2, width, height) {
  const dx = (p1.x - p2.x) * width;
  const dy = (p1.y - p2.y) * height;
  return Math.sqrt(dx * dx + dy * dy);
}

// Compute EAR for an eye
function computeEAR(eyePoints, landmarks, width, height) {
  const p1 = landmarks[eyePoints.outerCorner];
  const p2 = landmarks[eyePoints.upperLid1];
  const p3 = landmarks[eyePoints.upperLid2];
  const p4 = landmarks[eyePoints.innerCorner];
  const p5 = landmarks[eyePoints.lowerLid2];
  const p6 = landmarks[eyePoints.lowerLid1];
  
  const v1 = getDistance(p2, p6, width, height);
  const v2 = getDistance(p3, p5, width, height);
  const h = getDistance(p1, p4, width, height);
  
  return (v1 + v2) / (2.0 * h);
}

// Draw eye contour on canvas
function drawEyeContour(eyePoints, landmarks, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillStyle = color + "22"; // 10% opacity
  
  ctx.beginPath();
  const startPt = landmarks[eyePoints.all[0]];
  ctx.moveTo(startPt.x * canvas.width, startPt.y * canvas.height);
  
  for (let i = 1; i < eyePoints.all.length; i++) {
    const pt = landmarks[eyePoints.all[i]];
    ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

// Main processing logic
function processLandmarks(landmarks) {
  // Compute EAR for left & right eyes
  const earL = computeEAR(LEFT_EYE, landmarks, canvas.width, canvas.height);
  const earR = computeEAR(RIGHT_EYE, landmarks, canvas.width, canvas.height);
  const earAvg = (earL + earR) / 2.0;
  
  // Keep history
  earHistory.push(earAvg);
  if (earHistory.length > 100) {
    earHistory.shift();
  }
  
  // Render EAR metrics in UI
  earText.innerText = earAvg.toFixed(3);
  const earPercentage = Math.min(100, Math.max(0, (earAvg / 0.45) * 100));
  earBar.style.strokeDashoffset = 251.2 - (251.2 * earPercentage) / 100;
  
  // Set stroke color based on EAR level
  let eyeColor = "var(--color-success)"; // green
  if (earAvg < earThreshold) {
    eyeColor = "var(--color-warning)"; // amber when closed
  }
  
  // Check for Alert condition
  if (earAvg < earThreshold) {
    flag++;
    
    // Blink/Closure tracking
    if (!wasEyesClosed) {
      wasEyesClosed = true;
      closedEyeFrames = 0;
    }
    closedEyeFrames++;
    
    if (flag >= frameCheck) {
      triggerAlert();
      eyeColor = "var(--color-danger)"; // flashing red
    }
  } else {
    // Reset consecutive closed frames
    if (wasEyesClosed) {
      wasEyesClosed = false;
      // Blink detection: if eyes were closed for between 1 and 15 frames (quick shut)
      if (closedEyeFrames >= 1 && closedEyeFrames <= 15) {
        totalBlinks++;
        blinksText.innerText = totalBlinks;
      }
      closedEyeFrames = 0;
    }
    
    flag = 0;
    if (isAlertActive) {
      clearAlertState();
    }
  }
  
  // Draw eye overlays
  drawEyeContour(LEFT_EYE, landmarks, eyeColor);
  drawEyeContour(RIGHT_EYE, landmarks, eyeColor);
  
  // Draw subtle face silhouette landmarks for premium look
  drawSilhouette(landmarks);
  
  // Redraw EAR history chart
  drawChart();
}

// Draw a subtle, premium translucent face silhouette
function drawSilhouette(landmarks) {
  ctx.fillStyle = "hsla(195, 100%, 50%, 0.15)";
  
  // Draw eyebrow lines
  const leftEyebrow = [70, 63, 105, 66, 107];
  const rightEyebrow = [336, 296, 334, 293, 300];
  
  ctx.strokeStyle = "hsla(270, 100%, 65%, 0.2)";
  ctx.lineWidth = 1.5;
  
  // Left eyebrow
  ctx.beginPath();
  ctx.moveTo(landmarks[leftEyebrow[0]].x * canvas.width, landmarks[leftEyebrow[0]].y * canvas.height);
  for (let i = 1; i < leftEyebrow.length; i++) {
    ctx.lineTo(landmarks[leftEyebrow[i]].x * canvas.width, landmarks[leftEyebrow[i]].y * canvas.height);
  }
  ctx.stroke();
  
  // Right eyebrow
  ctx.beginPath();
  ctx.moveTo(landmarks[rightEyebrow[0]].x * canvas.width, landmarks[rightEyebrow[0]].y * canvas.height);
  for (let i = 1; i < rightEyebrow.length; i++) {
    ctx.lineTo(landmarks[rightEyebrow[i]].x * canvas.width, landmarks[rightEyebrow[i]].y * canvas.height);
  }
  ctx.stroke();
  
  // Mouth outline
  const mouthOuter = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
  ctx.strokeStyle = "hsla(195, 100%, 50%, 0.15)";
  ctx.beginPath();
  ctx.moveTo(landmarks[mouthOuter[0]].x * canvas.width, landmarks[mouthOuter[0]].y * canvas.height);
  for (let i = 1; i < mouthOuter.length; i++) {
    ctx.lineTo(landmarks[mouthOuter[i]].x * canvas.width, landmarks[mouthOuter[i]].y * canvas.height);
  }
  ctx.closePath();
  ctx.stroke();
}

function handleFaceLost() {
  statusValue.innerText = "NO FACE DETECTED";
  statusValue.className = "status-value status-alert";
  statusCard.classList.remove("alert-active");
  emergencyOverlay.classList.remove("active");
  stopAlarmSound();
  
  ctx.fillStyle = "hsla(345, 95%, 50%, 0.4)";
  ctx.font = "bold 20px Outfit, Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FACE DETECTION LOST", canvas.width / 2, canvas.height / 2);
}

// Trigger alert state
function triggerAlert() {
  if (!isAlertActive) {
    isAlertActive = true;
    totalAlerts++;
    alertsText.innerText = totalAlerts;
    
    statusValue.innerText = "DROWSINESS DETECTED";
    statusValue.className = "status-value status-alert";
    statusCard.classList.add("alert-active");
    bannerAlert.style.display = "block";
    emergencyOverlay.classList.add("active");
    
    playAlarmSound();
  }
}

// Clear alert state
function clearAlertState() {
  isAlertActive = false;
  statusValue.innerText = "MONITORING ACTIVE";
  statusValue.className = "status-value status-ok";
  statusCard.classList.remove("alert-active");
  bannerAlert.style.display = "none";
  emergencyOverlay.classList.remove("active");
  
  stopAlarmSound();
}

// Render dynamic EAR history graph
function drawChart() {
  const w = chartCanvas.width;
  const h = chartCanvas.height;
  
  chartCtx.clearRect(0, 0, w, h);
  
  // Draw grid lines
  chartCtx.strokeStyle = "hsla(240, 15%, 25%, 0.3)";
  chartCtx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(0, y);
    chartCtx.lineTo(w, y);
    chartCtx.stroke();
  }
  
  // Draw threshold line
  const thresholdY = h - (earThreshold / 0.45) * h;
  chartCtx.strokeStyle = "hsla(345, 95%, 50%, 0.7)";
  chartCtx.setLineDash([4, 4]);
  chartCtx.beginPath();
  chartCtx.moveTo(0, thresholdY);
  chartCtx.lineTo(w, thresholdY);
  chartCtx.stroke();
  chartCtx.setLineDash([]); // reset
  
  // Draw graph line
  if (earHistory.length > 0) {
    const sliceWidth = w / 100;
    
    // Create glowing gradient
    const gradient = chartCtx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "var(--color-primary)");
    gradient.addColorStop(1, "var(--color-secondary)");
    
    chartCtx.strokeStyle = isAlertActive ? "var(--color-danger)" : gradient;
    chartCtx.lineWidth = 2.5;
    chartCtx.beginPath();
    
    const startY = h - (earHistory[0] / 0.45) * h;
    chartCtx.moveTo(0, startY);
    
    for (let i = 1; i < earHistory.length; i++) {
      const x = i * sliceWidth;
      const y = h - (earHistory[i] / 0.45) * h;
      chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();
    
    // Draw fill area below line
    chartCtx.fillStyle = isAlertActive ? "rgba(244, 63, 94, 0.08)" : "rgba(0, 242, 254, 0.05)";
    chartCtx.lineTo((earHistory.length - 1) * sliceWidth, h);
    chartCtx.lineTo(0, h);
    chartCtx.closePath();
    chartCtx.fill();
  }
}

// Start Initialization
init();
