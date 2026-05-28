/**
 * ==========================================
 * LINEAR BLOCK SHOOTING ONLINE - CORE ENGINE
 * ==========================================
 */

document.addEventListener("DOMContentLoaded", () => {
  
  // ==========================================
  // GAME GLOBAL STATE
  // ==========================================
  const state = {
    nickname: "",
    mode: "pve", // 'pve' (AI Bot) or 'online' (Simulated Multiplayer)
    roomId: null,
    myPlayerId: null,
    isHost: false,
    
    // Players info
    p1: { name: "", score: 0 },
    p2: { name: "", score: 0 },
    
    // Game state
    isPlaying: false,
    timeRemaining: 120,
    timerInterval: null,
    
    // Mathematical items
    targets: [],      // Active stars: { id, x, y, points, glowColor }
    selectedSlope: null,
    selectedTranslation: null,
    
    // UI selections
    activeSlot: null, // Track block refills
    
    // Canvas dimensions
    gridScale: 30,    // Pixels per unit (e.g. 1 unit = 30px)
    starsExploded: 0,
    maxCombo: 0,
    shotsFired: 0,
    successfulShots: 0
  };

  // Particles for explosions
  let particles = [];
  let lasers = []; // Active laser beams to draw: { a, b, alpha, color, timestamp }

  // Sound settings
  let soundEnabled = true;

  // ==========================================
  // DOM ELEMENTS
  // ==========================================
  const views = {
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    result: document.getElementById("result-screen"),
    admin: document.getElementById("admin-screen")
  };

  const lobby = {
    nicknameInput: document.getElementById("nickname-input"),
    pveBtn: document.getElementById("pve-btn"),
    matchingBtn: document.getElementById("matching-btn"),
    queueStatus: document.getElementById("queue-status"),
    statusText: document.getElementById("status-text"),
    waitingCount: document.getElementById("waiting-count"),
    waitingList: document.getElementById("waiting-list")
  };

  const admin = {
    loginTrigger: document.getElementById("admin-login-trigger-btn"),
    modal: document.getElementById("admin-login-modal"),
    passwordInput: document.getElementById("admin-password-input"),
    errorMsg: document.getElementById("admin-login-error"),
    cancelBtn: document.getElementById("admin-modal-cancel-btn"),
    confirmBtn: document.getElementById("admin-modal-confirm-btn"),
    
    screen: document.getElementById("admin-screen"),
    playersCount: document.getElementById("admin-players-count"),
    playersList: document.getElementById("admin-players-list"),
    forceMatchBtn: document.getElementById("admin-force-match-btn"),
    resetBtn: document.getElementById("admin-reset-btn"),
    exitBtn: document.getElementById("admin-exit-btn")
  };

  const hud = {
    p1Name: document.getElementById("p1-name"),
    p1Score: document.getElementById("p1-score"),
    p1Hud: document.querySelector(".p1-hud"),
    p2Name: document.getElementById("p2-name"),
    p2Score: document.getElementById("p2-score"),
    p2Hud: document.querySelector(".p2-hud"),
    p2Icon: document.getElementById("p2-icon"),
    timer: document.getElementById("game-timer"),
    starCount: document.getElementById("star-count")
  };

  const trays = {
    slope: document.getElementById("slope-tray"),
    translation: document.getElementById("translation-tray")
  };

  const constructor = {
    slotSlope: document.getElementById("slot-slope"),
    slotTranslation: document.getElementById("slot-translation"),
    clearBtn: document.getElementById("clear-btn"),
    fireBtn: document.getElementById("fire-btn")
  };

  const result = {
    title: document.getElementById("result-title"),
    subtitle: document.getElementById("result-subtitle"),
    myScore: document.getElementById("final-my-score"),
    oppScore: document.getElementById("final-opponent-score"),
    accuracy: document.getElementById("stat-accuracy"),
    maxCombo: document.getElementById("stat-max-combo"),
    shots: document.getElementById("stat-shots"),
    returnBtn: document.getElementById("return-lobby-btn")
  };

  const canvas = document.getElementById("grid-canvas");
  const ctx = canvas.getContext("2d");
  
  const spaceBgCanvas = document.getElementById("space-bg");
  const bgCtx = spaceBgCanvas.getContext("2d");
  const soundToggleBtn = document.getElementById("sound-toggle");

  // ==========================================
  // WEB AUDIO SYNTHESIZER (HTML5 Sound Synth)
  // ==========================================
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function playLaserSynth() {
    if (!soundEnabled) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    // Create nodes
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    // Frequency sweep: High to Low frequency
    const now = audioCtx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);
    
    // Gain decay
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc.start(now);
    osc.stop(now + 0.36);
  }

  function playExplosionSynth() {
    if (!soundEnabled) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const bufferSize = audioCtx.sampleRate * 0.45; // 0.45 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    
    // Bandpass filter to make it sound beefier (space explosion vibe)
    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 400;
    filter.Q.value = 1.0;
    
    const gainNode = audioCtx.createGain();
    
    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    gainNode.gain.setValueAtTime(0.45, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    noiseNode.start(now);
    noiseNode.stop(now + 0.46);
  }

  function playGameOverSynth(isWin) {
    if (!soundEnabled) return;
    const now = audioCtx.currentTime;
    
    const notes = isWin ? [261.63, 329.63, 392.00, 523.25] : [261.63, 220.00, 196.00, 146.83];
    
    notes.forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = "triangle";
      osc.frequency.value = freq;
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + index * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.15 + 0.25);
      
      osc.start(now + index * 0.15);
      osc.stop(now + index * 0.15 + 0.26);
    });
  }

  // Sound Toggle click
  soundToggleBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF";
    soundToggleBtn.classList.toggle("border-btn", soundEnabled);
    soundToggleBtn.style.background = soundEnabled ? "" : "rgba(255, 62, 62, 0.2)";
  });

  // ==========================================
  // BACKGROUND PARTICLES STARFIELD
  // ==========================================
  let starsArray = [];
  function initBgStars() {
    starsArray = [];
    const count = 75;
    for (let i = 0; i < count; i++) {
      starsArray.push({
        x: Math.random() * spaceBgCanvas.width,
        y: Math.random() * spaceBgCanvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.3 + 0.05
      });
    }
  }

  function animateBgStars() {
    bgCtx.fillStyle = "#060713";
    bgCtx.fillRect(0, 0, spaceBgCanvas.width, spaceBgCanvas.height);
    
    bgCtx.fillStyle = "rgba(255, 255, 255, 0.85)";
    starsArray.forEach(star => {
      bgCtx.beginPath();
      bgCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      bgCtx.fill();
      
      // Move star down
      star.y += star.speed;
      if (star.y > spaceBgCanvas.height) {
        star.y = 0;
        star.x = Math.random() * spaceBgCanvas.width;
      }
    });
    
    requestAnimationFrame(animateBgStars);
  }

  function resizeBgCanvas() {
    spaceBgCanvas.width = window.innerWidth;
    spaceBgCanvas.height = window.innerHeight;
    initBgStars();
  }
  window.addEventListener("resize", resizeBgCanvas);
  resizeBgCanvas();
  animateBgStars();

  // ==========================================
  // MATHEMATICAL HELPERS (GRID <-> SCREEN)
  // ==========================================
  const gridRange = 5; // -5 to +5 (축소된 줌인 범위)

  function getCanvasCenter() {
    return { x: canvas.width / 2, y: canvas.height / 2 };
  }

  // Convert Math coordinates (e.g. 2, 4) to Canvas pixels
  function toPixelCoords(mathX, mathY) {
    const center = getCanvasCenter();
    const pixelX = center.x + mathX * state.gridScale;
    const pixelY = center.y - mathY * state.gridScale; // Invert Y for Cartesian coordinates
    return { x: pixelX, y: pixelY };
  }

  // ==========================================
  // VIEW TRANSITIONS
  // ==========================================
  function showView(viewId) {
    Object.keys(views).forEach(key => {
      if (key === viewId) {
        views[key].classList.add("active");
      } else {
        views[key].classList.remove("active");
      }
    });
  }

  // ==========================================
  // LOBBY MATCHMAKING BUTTONS
  // ==========================================
  lobby.pveBtn.addEventListener("click", () => startMatchmaking(true));
  lobby.matchingBtn.addEventListener("click", () => startMatchmaking(false));
  // ==========================================
  // 🔐 ADMIN LOGIN & TEACHER PANEL CONTROLS
  // ==========================================
  
  // 1. 관리자 로그인 모달 창 띄우기
  admin.loginTrigger.addEventListener("click", () => {
    admin.modal.classList.remove("hidden");
    admin.passwordInput.value = "";
    admin.errorMsg.classList.add("hidden");
    admin.passwordInput.focus();
  });

  // 2. 모달 창 닫기/취소
  admin.cancelBtn.addEventListener("click", () => {
    admin.modal.classList.add("hidden");
    admin.passwordInput.value = "";
    admin.errorMsg.classList.add("hidden");
  });

  // 3. 비밀번호 검증 및 사령부 진입 (비밀번호: 2525)
  admin.confirmBtn.addEventListener("click", performAdminLogin);
  admin.passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performAdminLogin();
  });

  function performAdminLogin() {
    const pwd = admin.passwordInput.value;
    if (pwd === "2525") {
      // 인증 성공 -> 모달 닫고 관리자 전용 화면으로 이동
      admin.modal.classList.add("hidden");
      admin.passwordInput.value = "";
      admin.errorMsg.classList.add("hidden");
      
      showView("admin");
    } else {
      // 인증 실패
      admin.errorMsg.classList.remove("hidden");
      admin.passwordInput.value = "";
      admin.passwordInput.focus();
    }
  }

  // 4. 관리자 패널 나가기
  admin.exitBtn.addEventListener("click", () => {
    showView("lobby");
  });

  // 5. 무작위 매칭 일괄 실행 버튼
  admin.forceMatchBtn.addEventListener("click", () => {
    window.spaceDb.forceMatchAllPlayers(onMatchFound);
  });

  // 6. 시스템 강제 초기화 실행 버튼
  admin.resetBtn.addEventListener("click", () => {
    if (confirm("🚨 경고: 진행 중인 모든 함장 세션 및 룸 데이터가 폭파되고 대기열이 완전히 비워집니다. 계속하시겠습니까?")) {
      window.spaceDb.triggerReset();
      alert("🧹 시스템 초기화가 성공적으로 완료되었습니다.");
      showView("lobby");
    }
  });

  // ** [관리자 화면 참가자 명단 실시간 동기화 및 닉네임 수정 기능] **
  let editingPlayerId = null; // 현재 인라인 수정 중인 플레이어 ID 추적

  window.spaceDb.listenPlayers((players) => {
    if (!admin.playersList || !admin.playersCount) return;

    console.log("👀 [디버그] 관리자 화면 - 실시간 참가자 명단 갱신 신호 수신. 인원수:", players.length);
    console.log("👀 [디버그] 수신된 전체 참가자 리스트:", players);

    admin.playersCount.textContent = players.length;
    admin.playersList.innerHTML = "";

    if (players.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "empty-msg";
      emptyLi.textContent = "현재 접속 중인 함장이 없습니다.";
      admin.playersList.appendChild(emptyLi);
    } else {
      players.forEach(player => {
        const li = document.createElement("li");
        
        // 1. 함장 메타 정보 영역
        const metaDiv = document.createElement("div");
        metaDiv.className = "player-meta";

        const statusTag = document.createElement("span");
        statusTag.className = `admin-status-tag ${player.status}`;
        statusTag.textContent = player.status === "playing" ? `PLAYING` : `WAITING`;
        metaDiv.appendChild(statusTag);

        // 2. 인라인 편집 입력창 활성화 여부에 따른 분기 렌더링
        if (editingPlayerId === player.id) {
          // 인라인 편집용 인풋 필드
          const input = document.createElement("input");
          input.type = "text";
          input.className = "admin-edit-input";
          input.value = player.nickname;
          input.maxLength = 10;
          metaDiv.appendChild(input);
          li.appendChild(metaDiv);

          // 인라인 저장 / 취소 버튼쌍
          const actionDiv = document.createElement("div");
          actionDiv.className = "player-actions";

          const confirmBtn = document.createElement("button");
          confirmBtn.className = "btn primary small btn-inline";
          confirmBtn.textContent = "확인";
          confirmBtn.addEventListener("click", () => {
            const newName = input.value;
            const res = window.spaceDb.updateNickname(player.id, newName);
            if (res.success) {
              editingPlayerId = null; // 수정 종료
            } else {
              alert(`⚠️ 오류: ${res.error}`);
            }
          });

          const cancelBtn = document.createElement("button");
          cancelBtn.className = "btn border-btn small btn-inline";
          cancelBtn.textContent = "취소";
          cancelBtn.addEventListener("click", () => {
            editingPlayerId = null; // 수정 취소 후 원래대로 리렌더
            window.spaceDb.notifyPlayersChanged();
          });

          actionDiv.appendChild(confirmBtn);
          actionDiv.appendChild(cancelBtn);
          li.appendChild(actionDiv);
        } else {
          // 일반 닉네임 텍스트 표시
          const nameSpan = document.createElement("span");
          nameSpan.className = "player-name-text";
          nameSpan.textContent = `🚀 ${player.nickname}`;
          metaDiv.appendChild(nameSpan);
          li.appendChild(metaDiv);

          // 수정 활성화 버튼
          const actionDiv = document.createElement("div");
          actionDiv.className = "player-actions";

          const editBtn = document.createElement("button");
          editBtn.className = "btn border-btn small btn-inline";
          editBtn.textContent = "수정";
          
          // 권한 확인: 이 수정 기능은 관리자 화면에서만 가능
          editBtn.addEventListener("click", () => {
            editingPlayerId = player.id; // 수정 대상 설정
            window.spaceDb.notifyPlayersChanged(); // 명단 다시 그려 인풋으로 전환
          });

          actionDiv.appendChild(editBtn);
          li.appendChild(actionDiv);
        }

        admin.playersList.appendChild(li);
      });
    }
  });

  function startMatchmaking(isPvE) {
    const name = lobby.nicknameInput.value.trim() || (isPvE ? "연습 함장" : "대결 함장");
    state.nickname = name;
    state.mode = isPvE ? "pve" : "online";

    lobby.queueStatus.classList.remove("hidden");
    lobby.statusText.textContent = isPvE ? "🤖 AI 가상 훈련선 대기열 연결 중..." : "📡 우주 실시간 연동 매칭 검색 중...";
    
    lobby.pveBtn.disabled = true;
    lobby.matchingBtn.disabled = true;

    // ** [참가 상태 대기 중 UI 로직 추가] **
    if (!isPvE) {
      lobby.matchingBtn.textContent = "📡 대기 중...";
      lobby.matchingBtn.style.background = "rgba(0, 243, 255, 0.15)";
      lobby.matchingBtn.style.color = "var(--cyan-main)";
      lobby.matchingBtn.style.border = "1px solid var(--cyan-main)";
      lobby.matchingBtn.style.boxShadow = "0 0 15px var(--cyan-glow)";
    } else {
      lobby.pveBtn.textContent = "🤖 대기 중...";
    }

    console.log(`👉 [디버그] 'JOIN MATCH QUEUE' 클릭됨. 닉네임: ${state.nickname}, 모드: ${state.mode}`);
    // Trigger local space database adapter
    window.spaceDb.joinQueue(state.nickname, isPvE, onMatchFound);
  }

  // Callback fired by CockpitDbSimulator when room matches
  function onMatchFound(roomDetails) {
    state.roomId = roomDetails.roomId;
    state.myPlayerId = roomDetails.player.id;
    state.isHost = roomDetails.player.isHost;
    
    state.p1 = roomDetails.player;
    state.p2 = roomDetails.opponent;
    
    state.targets = roomDetails.targets;
    
    // Configure HUD details
    hud.p1Name.textContent = state.p1.nickname;
    hud.p1Score.textContent = padScore(state.p1.score);
    
    hud.p2Name.textContent = state.p2.nickname;
    hud.p2Score.textContent = padScore(state.p2.score);
    if (state.p2.isBot) {
      hud.p2Icon.textContent = "AI";
      hud.p2Icon.style.color = "var(--green-main)";
    } else {
      hud.p2Icon.textContent = "P2";
    }

    state.isPlaying = true;
    state.timeRemaining = 120;
    state.starsExploded = 0;
    state.maxCombo = 0;
    state.shotsFired = 0;
    state.successfulShots = 0;
    
    // Build Trays
    buildBlockTrays();

    // Start UI
    showView("game");
    
    // Clear formula
    clearFormulaSlots();

    // Set scales based on current screen sizing
    updateCanvasScale();
    
    // Listen to real-time events in the simulated room
    window.spaceDb.listenRoom(state.roomId, onRoomUpdate);
    
    // Start countdown timer
    startCountdownTimer();

    // Trigger AI Agent firing intervals if Player vs AI mode
    if (state.p2.isBot) {
      startAiFiringRoutine();
    }
  }

  function padScore(score) {
    return String(score).padStart(4, "0");
  }

  function updateCanvasScale() {
    const parentWidth = canvas.parentElement.clientWidth;
    canvas.width = parentWidth;
    canvas.height = parentWidth; // Maintain 1:1 square
    
    // Adjust scale factor dynamically
    state.gridScale = canvas.width / (gridRange * 2 + 2);
  }
  window.addEventListener("resize", () => {
    if (state.isPlaying) {
      updateCanvasScale();
    }
  });

  // ==========================================
  // CORE TIMERS AND ROOM EVENTS
  // ==========================================
  function startCountdownTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    hud.timer.textContent = state.timeRemaining;
    hud.timer.classList.remove("warn-glow");

    state.timerInterval = setInterval(() => {
      state.timeRemaining--;
      hud.timer.textContent = state.timeRemaining;
      
      if (state.timeRemaining <= 20) {
        hud.timer.classList.add("warn-glow");
      }

      if (state.timeRemaining <= 0) {
        endGame();
      } else {
        // Sync time to room simulator
        window.spaceDb.updateRoomState(state.roomId, { timeRemaining: state.timeRemaining });
      }
    }, 1000);
  }

  // Real-time synchronization callback
  function onRoomUpdate(room) {
    if (!room) return;

    // ** [관리자 시스템 초기화 실시간 감지 및 홈 퇴출 로직] **
    if (room.status === "reset" && state.isPlaying) {
      if (state.timerInterval) clearInterval(state.timerInterval);
      if (window.spaceDb.aiInterval) {
        clearInterval(window.spaceDb.aiInterval);
        window.spaceDb.aiInterval = null;
      }
      state.isPlaying = false;
      
      alert("🚨 관리자 제어: 전역 시스템 초기화로 인해 로비 화면으로 강제 이동됩니다.");
      
      // UI 초기화
      lobby.pveBtn.removeAttribute("disabled");
      lobby.matchingBtn.removeAttribute("disabled");
      lobby.pveBtn.textContent = "🚀 PLAY VS AI BOT (싱글 연습)";
      lobby.matchingBtn.textContent = "📡 JOIN MATCH QUEUE (실시간 대전)";
      lobby.matchingBtn.style = "";
      lobby.pveBtn.style = "";
      lobby.queueStatus.classList.add("hidden");
      lobby.nicknameInput.value = "";
      
      showView("lobby");
      return;
    }

    if (!state.isPlaying) return;

    // ** [변경된 닉네임 실시간 동기화 반영] **
    // 관리자가 참가자 닉네임을 변경한 경우 화면 HUD에 실시간으로 반영합니다.
    hud.p1Name.textContent = room.p1.nickname;
    hud.p2Name.textContent = room.p2.nickname;

    // Sync scores
    state.p1 = room.p1;
    state.p2 = room.p2;

    hud.p1Score.textContent = padScore(state.p1.score);
    hud.p2Score.textContent = padScore(state.p2.score);

    // Dynamic HUD glows showing whose turn has higher stats
    if (state.p1.score >= state.p2.score) {
      hud.p1Hud.classList.add("active-glow");
      hud.p2Hud.classList.remove("active-glow");
    } else {
      hud.p2Hud.classList.add("active-glow");
      hud.p1Hud.classList.remove("active-glow");
    }

    // Sync stars remaining
    state.targets = room.targets;
    hud.starCount.textContent = state.targets.length;

    // Trigger lasers fired by opponent
    if (room.lastAction && room.lastAction.type === "fire") {
      const action = room.lastAction;
      
      // Make sure we only paint opponent's lasers (since we painted ours instantly)
      if (action.playerId !== state.myPlayerId) {
        const lineCol = "rgba(57, 255, 20, 0.9)"; // Opponent Green laser
        lasers.push({
          a: action.a,
          b: action.b,
          alpha: 1.0,
          color: lineCol,
          timestamp: Date.now()
        });
        
        // Show audio for hit/shoot
        playLaserSynth();

        // Create particles on targets hit by opponent
        action.hitIds.forEach(id => {
          const matchedTarget = state.targets.find(t => t.id === id) || { x: 0, y: 0, glowColor: "#fff" };
          createExplosion(matchedTarget.x, matchedTarget.y, matchedTarget.glowColor);
          playExplosionSynth();
        });
      }
      
      // Clear action to avoid repeat draws
      room.lastAction = null;
    }

    // Check game termination: All stars cleared
    if (state.targets.length === 0) {
      endGame();
    }
  }

  // ==========================================
  // BLOCKS & REFILLS MANAGER
  // ==========================================
  // Generates custom block values inside mathematical bounds
  function buildBlockTrays() {
    trays.slope.innerHTML = "";
    trays.translation.innerHTML = "";

    // Middle School 2nd Grade Math linear coefficient sets
    // Slope (기울기, a): nonzero integers
    const slopeOptions = [-3, -2, -1, 1, 2, 3];
    // Y-intercept Shift (평행이동, b): integers
    const translationOptions = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

    // Seed initial 5 blocks in each tray
    for (let i = 0; i < 5; i++) {
      createMathBlockInTray("slope", slopeOptions);
      createMathBlockInTray("translation", translationOptions);
    }
  }

  function createMathBlockInTray(type, optionsSet) {
    const tray = (type === "slope") ? trays.slope : trays.translation;
    const value = optionsSet[Math.floor(Math.random() * optionsSet.length)];
    
    const blockEl = document.createElement("div");
    blockEl.className = `math-block ${type}-block block-drop`;
    blockEl.textContent = value >= 0 ? `+${value}` : `${value}`;
    blockEl.dataset.value = value;
    blockEl.dataset.type = type;

    // Reset animation class after completion to enable hover transitions
    blockEl.addEventListener("animationend", () => {
      blockEl.classList.remove("block-drop");
    });

    // Handle block click event
    blockEl.addEventListener("click", () => handleBlockSelection(blockEl, optionsSet));
    
    tray.appendChild(blockEl);
  }

  function handleBlockSelection(blockEl, optionsSet) {
    const type = blockEl.dataset.type;
    const value = parseInt(blockEl.dataset.value);

    if (type === "slope") {
      // Put in slot
      state.selectedSlope = value;
      constructor.slotSlope.textContent = value >= 0 ? `+${value}` : value;
      constructor.slotSlope.classList.remove("empty");
      constructor.slotSlope.classList.add("filled");
    } else {
      state.selectedTranslation = value;
      constructor.slotTranslation.textContent = value >= 0 ? `+${value}` : value;
      constructor.slotTranslation.classList.remove("empty");
      constructor.slotTranslation.classList.add("filled");
    }

    // Trigger Firing Launch button states
    validateFireButton();

    // ** [블록 리필 이펙트] **
    // 1. Remove current block from tray with visual pop
    blockEl.style.transform = "scale(0)";
    blockEl.style.opacity = "0";
    
    setTimeout(() => {
      if (blockEl.parentNode) {
        blockEl.parentNode.removeChild(blockEl);
        // 2. Refill another block from above
        createMathBlockInTray(type, optionsSet);
      }
    }, 200);
  }

  constructor.slotSlope.addEventListener("click", () => {
    state.selectedSlope = null;
    constructor.slotSlope.textContent = "기울기";
    constructor.slotSlope.classList.add("empty");
    constructor.slotSlope.classList.remove("filled");
    validateFireButton();
  });

  constructor.slotTranslation.addEventListener("click", () => {
    state.selectedTranslation = null;
    constructor.slotTranslation.textContent = "평행이동";
    constructor.slotTranslation.classList.add("empty");
    constructor.slotTranslation.classList.remove("filled");
    validateFireButton();
  });

  constructor.clearBtn.addEventListener("click", clearFormulaSlots);

  function clearFormulaSlots() {
    state.selectedSlope = null;
    state.selectedTranslation = null;
    
    constructor.slotSlope.textContent = "기울기";
    constructor.slotSlope.classList.add("empty");
    constructor.slotSlope.classList.remove("filled");

    constructor.slotTranslation.textContent = "평행이동";
    constructor.slotTranslation.classList.add("empty");
    constructor.slotTranslation.classList.remove("filled");

    validateFireButton();
  }

  function validateFireButton() {
    const isReady = (state.selectedSlope !== null && state.selectedTranslation !== null);
    if (isReady) {
      constructor.fireBtn.removeAttribute("disabled");
      constructor.fireBtn.classList.remove("disabled");
    } else {
      constructor.fireBtn.setAttribute("disabled", "true");
      constructor.fireBtn.classList.add("disabled");
    }
  }

  // ==========================================
  // FIRE LASER & COLLISION MATH
  // ==========================================
  constructor.fireBtn.addEventListener("click", () => {
    if (state.selectedSlope === null || state.selectedTranslation === null) return;
    
    const a = state.selectedSlope;
    const b = state.selectedTranslation;
    
    state.shotsFired++;

    // Sweep drawing
    lasers.push({
      a: a,
      b: b,
      alpha: 1.0,
      color: "rgba(255, 208, 0, 0.95)", // Player Golden laser
      timestamp: Date.now()
    });

    // Play Synth sound
    playLaserSynth();

    // Render local alert
    const alertMsg = document.getElementById("laser-alert-message");
    alertMsg.textContent = `y = ${a}x ${b >= 0 ? '+' + b : b} 발사!`;
    alertMsg.classList.remove("hidden");
    setTimeout(() => alertMsg.classList.add("hidden"), 1000);

    // Find star hits
    // ** 정수 범위 연산 매칭 검사 **
    // y = ax + b 가 정수점 (x_s, y_s)를 정교하게 지나는지 확인합니다.
    const hitIds = [];
    const hitStars = [];

    state.targets.forEach(target => {
      // Cartesian evaluation
      // target.x, target.y, a, b는 전부 정수이므로 a*x + b도 엄격한 정수 연산 범위에 떨어집니다!
      const lineY = a * target.x + b;
      
      // Floating point tolerance (< 0.1) to allow neat visual overlaps
      if (Math.abs(target.y - lineY) < 0.1) {
        hitIds.push(target.id);
        hitStars.push(target);
      }
    });

    if (hitIds.length > 0) {
      state.successfulShots++;
      
      // Award score in the DB emulator
      window.spaceDb.fireLaser(state.roomId, state.myPlayerId, a, b, hitIds);

      // Trigger particle physics & synth explosions
      hitStars.forEach(star => {
        createExplosion(star.x, star.y, star.glowColor);
        playExplosionSynth();
      });

      // Update maximum combo count
      if (hitIds.length > state.maxCombo) {
        state.maxCombo = hitIds.length;
      }
      
      state.starsExploded += hitIds.length;
    }

    // Reset formula
    clearFormulaSlots();
  });

  // ==========================================
  // PARTICLE SYSTEM & EXPLOSION PHYSICS
  // ==========================================
  function createExplosion(mathX, mathY, color) {
    const pixelCoords = toPixelCoords(mathX, mathY);
    const particleCount = 20;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      particles.push({
        x: pixelCoords.x,
        y: pixelCoords.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 4 + 1.5,
        alpha: 1.0,
        decay: Math.random() * 0.02 + 0.015,
        color: color
      });
    }
  }

  // ==========================================
  // CANVAS RENDERING ENGINE
  // ==========================================
  function drawCoordinatesPlane() {
    if (!state.isPlaying) {
      requestAnimationFrame(drawCoordinatesPlane);
      return;
    }

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const center = getCanvasCenter();

    // 1. Draw Grid Lines (더 밝고 선명한 슬레이트 네온 블루 격자선)
    ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
    ctx.lineWidth = 1;
    ctx.font = "bold 11px Orbitron";
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Draw vertical and horizontal ticks
    for (let i = -gridRange; i <= gridRange; i++) {
      if (i === 0) continue; // Skip axis line

      // Vertical grids
      const vLine = toPixelCoords(i, 0);
      ctx.beginPath();
      ctx.moveTo(vLine.x, 0);
      ctx.lineTo(vLine.x, canvas.height);
      ctx.stroke();

      // Horizontal grids
      const hLine = toPixelCoords(0, i);
      ctx.beginPath();
      ctx.moveTo(0, hLine.y);
      ctx.lineTo(canvas.width, hLine.y);
      ctx.stroke();

      // Tick Labels
      // X labels
      ctx.fillText(i, vLine.x, center.y + 14);
      // Y labels
      ctx.fillText(i, center.x - 14, hLine.y);
    }

    // 2. Draw Principal Axes (선명한 네온 사이언 글로잉 축선)
    ctx.strokeStyle = "#00f3ff";
    ctx.lineWidth = 3.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00f3ff";

    // X-Axis
    ctx.beginPath();
    ctx.moveTo(0, center.y);
    ctx.lineTo(canvas.width, center.y);
    ctx.stroke();

    // Y-Axis
    ctx.beginPath();
    ctx.moveTo(center.x, 0);
    ctx.lineTo(center.x, canvas.height);
    ctx.stroke();
    
    // 그림자 효과 복원
    ctx.shadowBlur = 0;

    // Axis Arrows
    ctx.fillStyle = "#00f3ff";
    // X arrow
    ctx.beginPath();
    ctx.moveTo(canvas.width, center.y);
    ctx.lineTo(canvas.width - 10, center.y - 6);
    ctx.lineTo(canvas.width - 10, center.y + 6);
    ctx.fill();
    ctx.fillText("x", canvas.width - 15, center.y - 15);

    // Y arrow
    ctx.beginPath();
    ctx.moveTo(center.x, 0);
    ctx.lineTo(center.x - 6, 10);
    ctx.lineTo(center.x + 6, 10);
    ctx.fill();
    ctx.fillText("y", center.x + 15, 12);

    // Origin label
    ctx.fillText("O", center.x - 10, center.y + 12);

    // 3. Draw Laser beams
    const now = Date.now();
    lasers = lasers.filter(laser => {
      const age = now - laser.timestamp;
      if (age > 800) return false; // Fades out completely after 0.8s
      
      laser.alpha = 1.0 - (age / 800);
      
      ctx.strokeStyle = laser.color;
      ctx.lineWidth = 6 * laser.alpha;
      ctx.shadowBlur = 15;
      ctx.shadowColor = laser.color;

      // Draw the complete linear function line y = ax + b
      // Solve for margins: x = -10 and x = +10
      const startP = toPixelCoords(-12, laser.a * -12 + laser.b);
      const endP = toPixelCoords(12, laser.a * 12 + laser.b);

      ctx.beginPath();
      ctx.moveTo(startP.x, startP.y);
      ctx.lineTo(endP.x, endP.y);
      ctx.stroke();

      // Reset shadows
      ctx.shadowBlur = 0;
      return true;
    });

    // 4. Draw Energy Stars Targets
    state.targets.forEach(target => {
      const px = toPixelCoords(target.x, target.y);
      
      // Breathing scaling animation using sine waves
      const scale = 1.0 + Math.sin(Date.now() * 0.005 + target.x) * 0.12;

      ctx.save();
      ctx.translate(px.x, px.y);
      ctx.scale(scale, scale);

      // Star Glow
      ctx.shadowBlur = 12;
      ctx.shadowColor = target.glowColor;
      ctx.fillStyle = target.glowColor;

      // Draw Vector Star shape
      drawVectorStar(0, 0, 5, 12, 5);

      // Inner shiny core
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      drawVectorStar(0, 0, 5, 5, 2.2);

      ctx.restore();

      // Text coordinate tag above stars for educational readability
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "bold 9px Outfit";
      ctx.fillText(`(${target.x}, ${target.y})`, px.x, px.y - 18);
    });

    // 5. Draw Explosion particles
    particles = particles.filter(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Physics integration
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98; // Friction
      p.vy *= 0.98;
      p.alpha -= p.decay;

      return p.alpha > 0;
    });

    // Restore opacity
    ctx.globalAlpha = 1.0;

    // Loop Frame
    requestAnimationFrame(drawCoordinatesPlane);
  }

  function drawVectorStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  // Boot Canvas animation engine
  requestAnimationFrame(drawCoordinatesPlane);

  // ==========================================
  // ARTIFICIAL INTELLIGENCE BOT AGENT ENGINE (PvE)
  // ==========================================
  function startAiFiringRoutine() {
    // Clear previous routine
    if (window.spaceDb.aiInterval) clearInterval(window.spaceDb.aiInterval);

    // AI fires every 7 to 9 seconds to keep tension balanced
    window.spaceDb.aiInterval = setInterval(() => {
      if (!state.isPlaying || state.targets.length === 0) return;

      const p1Score = state.p1.score; // 플레이어 점수
      const p2Score = state.p2.score; // AI 봇 점수

      // ** [AI 봇 성능 제한 난이도 조정 로직] **
      // AI의 점수가 플레이어 점수보다 10점 이상 높다면 강제로 빗맞추도록 제한합니다.
      const forceMiss = (p2Score >= p1Score + 10);
      const makeMistake = forceMiss || Math.random() < 0.20;

      if (makeMistake || state.targets.length === 0) {
        // Blind shot simulation
        const randA = [-3, -2, -1, 1, 2, 3][Math.floor(Math.random() * 6)];
        const randB = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5][Math.floor(Math.random() * 11)];
        
        // Find if it randomly hits anything (강제 미스 시 빈 어레이)
        const hitIds = [];
        if (!forceMiss) {
          state.targets.forEach(t => {
            if (Math.abs(t.y - (randA * t.x + randB)) < 0.1) {
              hitIds.push(t.id);
            }
          });
        }

        window.spaceDb.fireLaser(state.roomId, state.p2.id, randA, randB, hitIds);
      } else {
        // Solve linear system
        // AI chooses one target star, and selects an integer slope/intercept matching it
        const star = state.targets[Math.floor(Math.random() * state.targets.length)];
        
        // Equation solver: y_s = a * x_s + b => b = y_s - a * x_s
        // We find a valid integer pair (a, b) in the block pool
        const validSlopes = [-3, -2, -1, 1, 2, 3];
        const validTranslations = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
        
        let foundA = null;
        let foundB = null;

        // Shuffle slopes
        validSlopes.sort(() => Math.random() - 0.5);

        for (let i = 0; i < validSlopes.length; i++) {
          const a = validSlopes[i];
          const b = star.y - a * star.x;
          if (validTranslations.includes(b)) {
            foundA = a;
            foundB = b;
            break;
          }
        }

        // If no clean combination found, fallback to random
        if (foundA === null) {
          foundA = [-3, -2, -1, 1, 2, 3][Math.floor(Math.random() * 6)];
          foundB = star.y - foundA * star.x;
        }

        // Check overall target hits (강제 미스 시 빈 어레이)
        const hitIds = [];
        if (!forceMiss) {
          state.targets.forEach(t => {
            if (Math.abs(t.y - (foundA * t.x + foundB)) < 0.1) {
              hitIds.push(t.id);
            }
          });
        }

        window.spaceDb.fireLaser(state.roomId, state.p2.id, foundA, foundB, hitIds);
      }

    }, Math.random() * 2000 + 7000); // 7s to 9s intervals
  }

  // ==========================================
  // GAME OVER / TERMINATION STAGE
  // ==========================================
  function endGame() {
    if (!state.isPlaying) return;
    state.isPlaying = false;

    // Halt intervals
    if (state.timerInterval) clearInterval(state.timerInterval);
    if (window.spaceDb.aiInterval) {
      clearInterval(window.spaceDb.aiInterval);
      window.spaceDb.aiInterval = null;
    }

    // Determine results
    const myScore = state.p1.score;
    const oppScore = state.p2.score;
    let winType = "draw";

    if (myScore > oppScore) {
      winType = "victory";
      result.title.textContent = "VICTORY";
      result.title.className = "victory-glow font-orbitron";
      result.subtitle.textContent = "우주 공간을 장악한 일차함수의 지존 마스터!";
    } else if (myScore < oppScore) {
      winType = "defeat";
      result.title.textContent = "DEFEAT";
      result.title.className = "defeat-glow font-orbitron";
      result.subtitle.textContent = "상대 함장이 먼저 차원 보상을 획득했습니다.";
    } else {
      winType = "draw";
      result.title.textContent = "DRAW GAME";
      result.title.className = "draw-glow font-orbitron";
      result.subtitle.textContent = "호적수를 만났습니다. 양 함장의 통제력이 막상막하입니다!";
    }

    // Populate stat elements
    result.myScore.textContent = myScore;
    result.oppScore.textContent = oppScore;

    const rawAccuracy = state.shotsFired > 0 ? Math.round((state.successfulShots / state.shotsFired) * 100) : 0;
    result.accuracy.textContent = `${rawAccuracy}%`;
    result.maxCombo.textContent = state.maxCombo;
    result.shots.textContent = `${state.shotsFired}회`;

    // Visual result reveal
    showView("result");
    
    // Play end game synth
    playGameOverSynth(winType === "victory");
  }

  // Return to Lobby button click
  result.returnBtn.addEventListener("click", () => {
    // Reset database adapters
    window.spaceDb.disconnect();
    
    // UI resets
    lobby.pveBtn.removeAttribute("disabled");
    lobby.matchingBtn.removeAttribute("disabled");
    lobby.pveBtn.textContent = "🚀 PLAY VS AI BOT (싱글 연습)";
    lobby.matchingBtn.textContent = "📡 JOIN MATCH QUEUE (실시간 대전)";
    lobby.matchingBtn.style = "";
    lobby.pveBtn.style = "";
    
    lobby.queueStatus.classList.add("hidden");
    lobby.nicknameInput.value = "";
    
    showView("lobby");
  });

  // ** [실시간 대기열 명단 업데이트 리스너 연결] **
  window.spaceDb.listenQueue((waitingPlayers) => {
    if (!lobby.waitingList || !lobby.waitingCount) return;
    
    // 대기 함장 수 갱신
    lobby.waitingCount.textContent = waitingPlayers.length;
    
    // 대기열 목록 초기화
    lobby.waitingList.innerHTML = "";
    
    if (waitingPlayers.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "empty-msg";
      emptyLi.textContent = "현재 대기 중인 함장이 없습니다.";
      lobby.waitingList.appendChild(emptyLi);
    } else {
      waitingPlayers.forEach(player => {
        const li = document.createElement("li");
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "name";
        nameSpan.textContent = `🚀 ${player.nickname}`;
        
        const statusSpan = document.createElement("span");
        statusSpan.className = "status-tag";
        statusSpan.textContent = "WAITING";
        
        li.appendChild(nameSpan);
        li.appendChild(statusSpan);
        lobby.waitingList.appendChild(li);
      });
    }
  });

});
