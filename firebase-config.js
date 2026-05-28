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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
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

  // 닉네임 등록 및 대기열 참가
  joinQueue(nickname, isPvE = false, onMatchFound) {
    this.currentUser = {
      id: "player_" + Math.random().toString(36).substr(2, 9),
      nickname: nickname || "무명 함장",
      score: 0,
      isHost: true,
      status: "waiting"
    };

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
            this.waitingList.push({
              id: "mock_p_" + i,
              nickname: name,
              score: 0,
              isHost: false,
              status: "waiting"
            });
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
            this.waitingList.push({
              id: "mock_p_" + Math.random().toString(36).substr(2, 5),
              nickname: selectedName,
              score: 0,
              isHost: false,
              status: "waiting"
            });
            this.notifyQueueChanged();
          }
        }
      }, 3500);

      // 대기열 로직 작동 (4초 후 매칭 완료되어 룸으로 입장)
      setTimeout(() => {
        if (!this.currentRoom && this.currentUser) {
          // 대기열 중 나를 제외한 대기 함장 중 하나 매칭
          const pool = this.waitingList.filter(p => p.id !== this.currentUser.id);
          const opponent = pool.length > 0 ? pool[0] : {
            id: "player_opp_backup",
            nickname: "백업 에디슨",
            score: 0,
            isBot: false
          };

          // 대기열 제거
          this.waitingList = this.waitingList.filter(p => p.id !== this.currentUser.id && p.id !== opponent.id);
          this.notifyQueueChanged();

          if (this.mockQueueInterval) {
            clearInterval(this.mockQueueInterval);
            this.mockQueueInterval = null;
          }

          this.simulatedOpponent = opponent;
          this.createMockRoom(this.currentUser, this.simulatedOpponent, false, onMatchFound);
        }
      }, 5000); // 5초 동안 대기열 명단을 실시간으로 볼 기회 제공 후 매칭 진행
    }
  }

  // 선생님의 강제 매칭 기능 시뮬레이션
  forceMatchmaking(nickname, onMatchFound) {
    this.currentUser = {
      id: "player_" + Math.random().toString(36).substr(2, 9),
      nickname: nickname || "훈련 함장",
      score: 0,
      isHost: true
    };
    
    // 즉각 매칭 수행
    const opponent = {
      id: "player_quick_opp",
      nickname: "신속한 가우스",
      score: 0,
      isBot: false
    };
    
    this.createMockRoom(this.currentUser, opponent, false, onMatchFound);
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
    
    // 정수 범위 내에서 일차함수 식 5~6개 정의
    const testLines = [
      { a: 1, b: 2 },   // y = x + 2
      { a: -1, b: 0 },  // y = -x
      { a: 2, b: -3 },  // y = 2x - 3
      { a: -2, b: 4 },  // y = -2x + 4
      { a: 3, b: -5 },  // y = 3x - 5
      { a: 0, b: 3 }    // y = 3 (기울기 0)
    ];

    // 각 함수 식에서 정수 격자점(x, y)을 추출하여 그 위치에 별을 배치합니다.
    // 이렇게 하면 무작위로 아무데나 별이 배치되는 것이 아니라,
    // 정수 기울기(yellow)와 정수 평행이동(green) 블록을 조합했을 때 정확히 적중할 수 있는 격자점이 보장됩니다.
    // y축 범위는 [-8, 8], x축 범위는 [-8, 8] 사이의 정수로 제한
    testLines.forEach(line => {
      // 각 식당 2~3개의 정수 포인트를 타겟으로 삼음 (일타쌍피, 일타삼피 각 유도)
      const xChoices = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
      // 무작위 셔플
      xChoices.sort(() => Math.random() - 0.5);
      
      let count = 0;
      for (let i = 0; i < xChoices.length; i++) {
        const x = xChoices[i];
        const y = line.a * x + line.b;
        
        // y 좌표도 정수 격자 범위 내에 있고 중복되지 않았는지 검사
        if (y >= -8 && y <= 8) {
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
      const x = Math.floor(Math.random() * 13) - 6; // -6 ~ 6
      const y = Math.floor(Math.random() * 13) - 6;
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
