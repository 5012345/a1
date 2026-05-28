/**
 * ==========================================
 * LINEAR BLOCK SHOOTING ONLINE - FIREBASE CONFIG
 * ==========================================
 * 
 * 실제 온라인 멀티플레이어로 배포하려면 아래 주석을 해제하고
 * Firebase Console에서 생성한 웹 앱 설정을 입력하세요.
 * Firebase Firestore가 연동되면 전국의 다른 함장들과 실시간 대결이 가능합니다!
 */

/*
// Firebase SDK CDN 로드 필요 (index.html 헤더 또는 바디 하단에 추가 가능)
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>

const firebaseConfig = {
  apiKey: "AIzaSyDX5TiB78wqtnzgwgOpfnEv7f0hcN0L4LU",
  authDomain: "duru20401-b60fa.firebaseapp.com",
  projectId: "duru20401-b60fa",
  storageBucket: "duru20401-b60fa.firebasestorage.app",
  messagingSenderId: "790407879385",
  appId: "1:790407879385:web:5e870c62480531fb1ebcc8",
  measurementId: "G-YC30724HMC"
};

// 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
*/

// ==========================================
// ROBUST LOCAL COCKPIT SIMULATOR (로컬 시뮬레이터)
// ==========================================
// Firebase 설정이 비어있거나 오프라인일 때 자동으로 작동하는 실시간 시뮬레이션 레이어입니다.
// 단일 화면 PVE(AI Bot) 모드와 다중 탭을 감지하는 Mock Multiplay 기능을 내장하여 즉각적인 테스트가 가능합니다.

class CockpitDbSimulator {
  constructor() {
    this.isRealFirebase = false;
    this.currentUser = null;
    this.currentRoom = null;
    this.stateListeners = [];
    this.simulatedOpponent = null;
    this.aiInterval = null;
    
    // 실시간 대기열 데이터 관리용 속성 추가
    this.waitingList = [];
    this.queueListeners = [];
    this.mockQueueInterval = null;
    
    // 실시간 관리자용 전체 참가자 데이터 관리 속성 추가
    this.playersList = [];
    this.adminListeners = [];
    
    console.log("📡 [Network Manager] Local space simulation system initialized.");
  }

  // 실시간 대기열 정보 구독 (선생님 제어판 출력용)
  // --- REAL FIREBASE FIRESTORE CODE GUIDE ---
  /*
  listenQueueRealtime(callback) {
    return db.collection("users")
      .where("status", "==", "waiting")
      .orderBy("joinedAt", "asc")
      .onSnapshot((snapshot) => {
        const list = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        callback(list);
      });
  }
  */
  listenQueue(callback) {
    this.queueListeners.push(callback);
    callback(this.waitingList);
  }

  // 대기열 변동 상황 전파
  notifyQueueChanged() {
    this.queueListeners.forEach(callback => callback(this.waitingList));
  }

  // 관리자 모니터링 리스너 등록
  listenPlayers(callback) {
    this.adminListeners.push(callback);
    callback(this.playersList);
  }

  // 관리자 참가자 명단 변동 전파
  notifyPlayersChanged() {
    this.adminListeners.forEach(callback => callback(this.playersList));
  }

  // 관리자용 신규 함장 등록 도우미
  registerPlayerInAdmin(player) {
    if (!this.playersList.some(p => p.id === player.id)) {
      this.playersList.push({
        id: player.id,
        nickname: player.nickname,
        status: player.status || "waiting",
        room: null
      });
      this.notifyPlayersChanged();
    }
  }

  // 함장 세션 상태 갱신 도우미
  updatePlayerStatusInAdmin(playerId, status, roomId = null) {
    const player = this.playersList.find(p => p.id === playerId);
    if (player) {
      player.status = status;
      player.room = roomId;
      this.notifyPlayersChanged();
    }
  }

  // 닉네임 등록 및 대기열 참가
  joinQueue(nickname, isPvE = false, onMatchFound) {
    this.currentUser = {
      id: "player_" + Math.random().toString(36).substr(2, 9),
      nickname: nickname || "무명 함장",
      score: 0,
      isHost: true,
      status: "waiting"
    };

    // 관리자 접속자 리스트에 즉시 등록
    this.registerPlayerInAdmin(this.currentUser);

    if (isPvE) {
      // AI 봇과의 PVE 모드 즉시 매칭
      // 대기열 목록에 임시 추가 후 즉시 해제
      this.waitingList.push(this.currentUser);
      this.notifyQueueChanged();

      setTimeout(() => {
        this.simulatedOpponent = {
          id: "bot_alpha",
          nickname: "AI 봇 (수학 마스터)",
          score: 0,
          isBot: true
        };
        
        // 대기열에서 제거
        this.waitingList = this.waitingList.filter(p => p.id !== this.currentUser.id);
        this.notifyQueueChanged();

        this.createMockRoom(this.currentUser, this.simulatedOpponent, true, onMatchFound);
      }, 1000);
    } else {
      // 온라인 실시간 대전 대기열 모드 시뮬레이션
      // 1. 로그인한 사용자 대기열 리스트에 추가
      this.waitingList.push(this.currentUser);
      
      // 2. 교실 내 다른 학생들이 접속하는 것처럼 몇 개의 가상 학생 등록 유도 (재미/타격감 극대화)
      const mockInitialNames = ["시그마 오리온", "가우스 슈터"];
      mockInitialNames.forEach((name, i) => {
        setTimeout(() => {
          if (!this.waitingList.some(p => p.nickname === name) && this.currentUser) {
            const mockPlayer = {
              id: "mock_p_" + i,
              nickname: name,
              score: 0,
              isHost: false,
              status: "waiting"
            };
            this.waitingList.push(mockPlayer);
            this.registerPlayerInAdmin(mockPlayer);
            this.notifyQueueChanged();
          }
        }, 300 * (i + 1));
      });

      this.notifyQueueChanged();

      // 3. 주기적으로 대기열 명단에 가상 학생이 추가되는 시뮬레이터 실행
      this.mockQueueInterval = setInterval(() => {
        if (this.waitingList.length > 0 && this.waitingList.length < 6) {
          const simulatedStudents = ["제타 함장", "피타고라스", "라이프니츠", "노이만 윙"];
          const selectedName = simulatedStudents[Math.floor(Math.random() * simulatedStudents.length)];
          
          if (!this.waitingList.some(p => p.nickname === selectedName)) {
            const mockPlayer = {
              id: "mock_p_" + Math.random().toString(36).substr(2, 5),
              nickname: selectedName,
              score: 0,
              isHost: false,
              status: "waiting"
            };
            this.waitingList.push(mockPlayer);
            this.registerPlayerInAdmin(mockPlayer);
            this.notifyQueueChanged();
          }
        }
      }, 3500);

      // 대기열 로직 작동 (5초 후 매칭 완료되어 룸으로 입장)
      setTimeout(() => {
        if (!this.currentRoom && this.currentUser) {
          // 대기열 중 나를 제외한 대기 함장 중 하나 매칭
          const pool = this.waitingList.filter(p => p.id !== this.currentUser.id);
          const opponent = pool.length > 0 ? pool[0] : {
            id: "player_opp_backup",
            nickname: "백업 에디슨",
            score: 0,
            isBot: false,
            status: "waiting"
          };

          // 대기열 제거
          this.waitingList = this.waitingList.filter(p => p.id !== this.currentUser.id && p.id !== opponent.id);
          this.notifyQueueChanged();

          if (this.mockQueueInterval) {
            clearInterval(this.mockQueueInterval);
            this.mockQueueInterval = null;
          }

          this.registerPlayerInAdmin(opponent);
          this.simulatedOpponent = opponent;
          this.createMockRoom(this.currentUser, this.simulatedOpponent, false, onMatchFound);
        }
      }, 5000);
    }
  }

  // 선생님의 강제 매칭 기능 시뮬레이션
  forceMatchmaking(nickname, onMatchFound) {
    this.currentUser = {
      id: "player_" + Math.random().toString(36).substr(2, 9),
      nickname: nickname || "훈련 함장",
      score: 0,
      isHost: true,
      status: "waiting"
    };
    
    this.registerPlayerInAdmin(this.currentUser);

    // 즉각 매칭 수행
    const opponent = {
      id: "player_quick_opp",
      nickname: "신속한 가우스",
      score: 0,
      isBot: false,
      status: "waiting"
    };
    
    this.registerPlayerInAdmin(opponent);
    this.createMockRoom(this.currentUser, opponent, false, onMatchFound);
  }

  // 선생님 관리자 전용 - 대기 중인 모든 참가자 무작위 1:1 일괄 매칭 수행
  // --- REAL FIREBASE FIRESTORE CODE GUIDE ---
  /*
  forceMatchAllPlayersRealtime(onMatchFound) {
    // Firestore users 컬렉션에서 status == "waiting"인 문서를 가져와서
    // 2개씩 짝지어서 rooms 컬렉션에 새 방 문서를 생성하고 각 user 상태를 "playing"으로 업데이트합니다.
  }
  */
  forceMatchAllPlayers(onMatchFound) {
    if (this.waitingList.length === 0) return;

    if (this.mockQueueInterval) {
      clearInterval(this.mockQueueInterval);
      this.mockQueueInterval = null;
    }

    // 대기열 목록을 돌며 2명씩 짝지어서 mock 방 생성
    while (this.waitingList.length >= 2) {
      const p1 = this.waitingList.shift();
      const p2 = this.waitingList.shift();
      
      this.createMockRoom(p1, p2, false, onMatchFound);
    }

    // 만약 1명이 남는다면 홀수이므로 AI 봇과 매칭
    if (this.waitingList.length === 1) {
      const single = this.waitingList.shift();
      const bot = {
        id: "bot_alpha",
        nickname: "AI 봇 (수학 마스터)",
        score: 0,
        isBot: true
      };
      this.createMockRoom(single, bot, true, onMatchFound);
    }

    this.notifyQueueChanged();
  }

  // 관리자용 실시간 닉네임 수정 기능 구현
  // --- REAL FIREBASE FIRESTORE CODE GUIDE ---
  /*
  updateNicknameRealtime(playerId, newNickname) {
    return db.collection("users").doc(playerId).update({
      nickname: newNickname
    });
  }
  */
  updateNickname(playerId, newNickname) {
    const trimmed = newNickname.trim();
    if (!trimmed) {
      return { success: false, error: "닉네임은 공백일 수 없습니다." };
    }

    // 이미 존재하는 닉네임과 중복 여부 검사 (본인 제외)
    const exists = this.playersList.some(p => p.id !== playerId && p.nickname.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      return { success: false, error: "이미 존재하는 닉네임과 중복됩니다." };
    }

    // 접속 명단 업데이트
    const player = this.playersList.find(p => p.id === playerId);
    if (player) {
      player.nickname = trimmed;
    }

    // 대기열 목록 업데이트
    const queuePlayer = this.waitingList.find(p => p.id === playerId);
    if (queuePlayer) {
      queuePlayer.nickname = trimmed;
    }

    // 현재 플레이어 정보 업데이트
    if (this.currentUser && this.currentUser.id === playerId) {
      this.currentUser.nickname = trimmed;
    }
    if (this.simulatedOpponent && this.simulatedOpponent.id === playerId) {
      this.simulatedOpponent.nickname = trimmed;
    }

    // ** [변경된 닉네임 실시간 동기화] **
    // 현재 작동 중인 대전 룸의 플레이어 정보를 수정하여 즉각 화면 HUD에 실시간 동기화시킵니다.
    if (this.currentRoom) {
      let changed = false;
      if (this.currentRoom.p1.id === playerId) {
        this.currentRoom.p1.nickname = trimmed;
        changed = true;
      }
      if (this.currentRoom.p2.id === playerId) {
        this.currentRoom.p2.nickname = trimmed;
        changed = true;
      }

      if (changed) {
        // Room update 발송 -> listenRoom 리스너들이 감지해 실시간 HUD 수정
        this.updateRoomState(this.currentRoom.id, {
          p1: this.currentRoom.p1,
          p2: this.currentRoom.p2
        });
      }
    }

    this.notifyQueueChanged();
    this.notifyPlayersChanged();
    return { success: true };
  }

  // 관리자용 세션 시스템 초기화 기능 구현
  // --- REAL FIREBASE FIRESTORE CODE GUIDE ---
  /*
  triggerResetRealtime() {
    // 모든 사용자 상태를 'idle'로 변경하고 방을 삭제하는 트랜잭션 수행
    const batch = db.batch();
    // ... batch operations
    return batch.commit();
  }
  */
  triggerReset() {
    this.waitingList = [];
    this.playersList = [];
    this.currentRoom = null;
    this.currentUser = null;
    this.simulatedOpponent = null;
    
    if (this.aiInterval) {
      clearInterval(this.aiInterval);
      this.aiInterval = null;
    }
    if (this.mockQueueInterval) {
      clearInterval(this.mockQueueInterval);
      this.mockQueueInterval = null;
    }

    this.notifyQueueChanged();
    this.notifyPlayersChanged();

    // 현재 방의 구독자들에게 강제 퇴출 통지
    this.stateListeners.forEach(listener => listener({ status: "reset" }));
    this.stateListeners = [];
  }

  // 가상의 게임 룸 생성 및 초기 상태 설정
  createMockRoom(player1, player2, isPvE, onMatchFound) {
    const roomId = "room_" + Math.random().toString(36).substr(2, 9);
    
    // ** 정수 범위 제한 수학 문제 생성 로직 **
    // 모든 연산과 점 획득이 정확한 정수 그리드에 떨어지도록 targets(별)을 생성합니다.
    const targets = this.generateIntegerTargets();

    this.currentRoom = {
      id: roomId,
      p1: player1,
      p2: player2,
      targets: targets,
      isPvE: isPvE,
      timeRemaining: 120,
      status: "playing",
      lastAction: null // { type: 'fire', playerId: '...', laser: { a, b }, hits: [...] }
    };

    // 대기 상태 제거 및 게임룸 상태 변경 기록
    this.updatePlayerStatusInAdmin(player1.id, "playing", roomId);
    if (!player2.isBot) {
      this.updatePlayerStatusInAdmin(player2.id, "playing", roomId);
    }

    onMatchFound({
      roomId: roomId,
      player: player1,
      opponent: player2,
      targets: targets,
      isPvE: isPvE
    });
  }

  // 수학 문제 생성 시 모든 연산 결과가 "정수 범위"로 제한되는 타겟(별) 생성 함수
  // 1차함수 y = ax + b (여기서 a, b, x, y는 모두 정수)
  generateIntegerTargets() {
    const targets = [];
    const usedCoords = new Set();
    
    // 정수 범위 내에서 일차함수 식 5~6개 정의 (범위 [-4, 4]에 맞춤)
    const testLines = [
      { a: 1, b: 1 },   // y = x + 1
      { a: -1, b: 0 },  // y = -x
      { a: 2, b: -1 },  // y = 2x - 1
      { a: -2, b: 2 },  // y = -2x + 2
      { a: 3, b: 0 },   // y = 3x
      { a: 0, b: -2 }   // y = -2 (기울기 0)
    ];

    // 각 함수 식에서 정수 격자점(x, y)을 추출하여 그 위치에 별을 배치합니다.
    // y축 범위는 [-4, 4], x축 범위는 [-4, 4] 사이의 정수로 제한하여 줌인 화면에 맞춤
    testLines.forEach(line => {
      const xChoices = [-3, -2, -1, 0, 1, 2, 3];
      // 무작위 셔플
      xChoices.sort(() => Math.random() - 0.5);
      
      let count = 0;
      for (let i = 0; i < xChoices.length; i++) {
        const x = xChoices[i];
        const y = line.a * x + line.b;
        
        // y 좌표도 격자 범위 [-4, 4] 내에 있고 중복되지 않았는지 검사
        if (y >= -4 && y <= 4) {
          const coordKey = `${x},${y}`;
          if (!usedCoords.has(coordKey)) {
            usedCoords.add(coordKey);
            targets.push({
              id: "star_" + Math.random().toString(36).substr(2, 5),
              x: x,
              y: y,
              points: 10,
              glowColor: this.getRandomNeonColor()
            });
            count++;
            if (count >= 2) break; // 한 식당 최대 2개 점만 추출
          }
        }
      }
    });

    // 만약 타겟 개수가 너무 적으면 기본 격자 추가 (최소 7개 보장)
    while (targets.length < 8) {
      const x = Math.floor(Math.random() * 9) - 4; // -4 ~ 4
      const y = Math.floor(Math.random() * 9) - 4; // -4 ~ 4
      const coordKey = `${x},${y}`;
      if (!usedCoords.has(coordKey)) {
        usedCoords.add(coordKey);
        targets.push({
          id: "star_" + Math.random().toString(36).substr(2, 5),
          x: x,
          y: y,
          points: 10,
          glowColor: this.getRandomNeonColor()
        });
      }
    }

    return targets;
  }

  getRandomNeonColor() {
    const colors = ["#ff3e96", "#00f3ff", "#ff9f00", "#d000ff", "#e0ff00"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // 실시간 방 상태 리스너 등록
  listenRoom(roomId, callback) {
    this.stateListeners.push(callback);
    // 첫 발송
    callback(this.currentRoom);
  }

  // 점수 업데이트 및 발사 동기화
  updateRoomState(roomId, updatedFields) {
    if (!this.currentRoom || this.currentRoom.id !== roomId) return;

    // 데이터 병합
    this.currentRoom = { ...this.currentRoom, ...updatedFields };

    // 모든 리스너에게 통지하여 화면 갱신
    this.stateListeners.forEach(listener => listener(this.currentRoom));
  }

  // 레이저 발사 이벤트 기록 및 득점 계산
  fireLaser(roomId, playerId, a, b, hitIds) {
    if (!this.currentRoom) return;

    const isP1 = (this.currentRoom.p1.id === playerId);
    const shooter = isP1 ? this.currentRoom.p1 : this.currentRoom.p2;

    // 콤보 점수 산정
    // 1개: 10점, 2개 동시: 25점, 3개 이상 동시: 40점
    let addedScore = 0;
    const hitCount = hitIds.length;
    if (hitCount === 1) addedScore = 10;
    else if (hitCount === 2) addedScore = 25;
    else if (hitCount >= 3) addedScore = 40;

    shooter.score += addedScore;

    // 파괴된 에너지 별 제거
    const remainingTargets = this.currentRoom.targets.filter(t => !hitIds.includes(t.id));

    const lastAction = {
      type: "fire",
      playerId: playerId,
      shooterName: shooter.nickname,
      a: a,
      b: b,
      hitIds: hitIds,
      addedScore: addedScore
    };

    this.updateRoomState(roomId, {
      p1: this.currentRoom.p1,
      p2: this.currentRoom.p2,
      targets: remainingTargets,
      lastAction: lastAction
    });
  }

  // 매칭 취소 / 로비 귀환 시 리소스를 정리합니다.
  disconnect() {
    this.currentUser = null;
    this.currentRoom = null;
    this.stateListeners = [];
    if (this.aiInterval) {
      clearInterval(this.aiInterval);
      this.aiInterval = null;
    }
  }
}

// 전역 시뮬레이터 인스턴스 노출
window.spaceDb = new CockpitDbSimulator();
