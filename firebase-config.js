/**
 * ==========================================
 * LINEAR BLOCK SHOOTING ONLINE - FIREBASE CONFIG
 * ==========================================
 * 
 * 실제 온라인 멀티플레이어로 배포하려면 아래 주석을 해제하고
 * Firebase Console에서 생성한 웹 앱 설정을 입력하세요.
 * Firebase Firestore가 연동되면 전국의 다른 함장들과 실시간 대결이 가능합니다!
 */

// Firebase SDK 초기화 및 구성 영역 (선생님/학생 입력용)
const firebaseConfig = {
  apiKey: "AIzaSyDX5TiB78wqtnzgwgOpfnEv7f0hcN0L4LU",
  authDomain: "duru20401-b60fa.firebaseapp.com",
  projectId: "duru20401-b60fa",
  storageBucket: "duru20401-b60fa.firebasestorage.app",
  messagingSenderId: "790407879385",
  appId: "1:790407879385:web:5e870c62480531fb1ebcc8",
  measurementId: "G-YC30724HMC"
};

// 브라우저 윈도우 객체에 firebase가 로드되어 있고 설정 키가 입력되어 있으면 활성화
if (typeof firebase !== "undefined" && firebaseConfig.apiKey) {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log("🔥 [Firebase Config] Firebase core app initialized.");
  } catch (error) {
    console.warn("⚠️ [Firebase Config] Firebase initialization warning:", error.message);
  }
}

// ==========================================
// DUAL-PATH SPACE COCKPIT DATABASE DRIVER
// ==========================================
// 이 드라이버는 Firebase 실시간 클라우드 연동 상태를 감지하여
// 활성화 시 실제 Firestore 서버와 양방향 동기화를 처리하고,
// 비활성화 시 브라우저 내 가상 메모리 시뮬레이터로 자동 변환하여 완벽한 오프라인 구동을 지원합니다.

class CockpitDbSimulator {
  constructor() {
    this.isRealFirebase = false;
    this.db = null;
    this.currentUser = null;
    this.currentRoom = null;
    
    // 리얼타임 리스너 수집 및 클린업용
    this.stateListeners = [];     // room listeners
    this.queueListeners = [];     // match lobby queue listeners
    this.adminListeners = [];     // teacher admin panel listeners
    this.userUnsubscribe = null;
    this.roomUnsubscribe = null;
    this.queueUnsubscribe = null;
    this.adminUnsubscribe = null;

    // 시뮬레이터 전용 임시 속성
    this.waitingList = [];
    this.playersList = [];
    this.mockQueueInterval = null;
    this.aiInterval = null;

    // 실시간 Firebase 연동 감지
    if (typeof firebase !== "undefined" && firebase.apps.length > 0) {
      this.isRealFirebase = true;
      this.db = firebase.firestore();
      console.log("📡 [Network Manager] Real Firebase Firestore connected successfully!");
    } else {
      this.isRealFirebase = false;
      console.log("📡 [Network Manager] Offline / Local Cockpit simulator active.");
    }
  }

  // 관리자/선생님 화면 - 전체 참가자 목록 실시간 구독 (Listen)
  listenPlayers(callback) {
    if (this.isRealFirebase) {
      console.log("🛡️ [Admin DB Setup] Hooking real-time observer to waiting_room collection.");
      console.log("👉 [디버그] 관리자 화면 - Firestore waiting_room 컬렉션 실시간 감시 시작");
      
      // waiting_room 컬렉션 전체를 실시간 감시 (인덱스 에러 방지를 위해 orderBy를 제거하고 클라이언트 측에서 정렬)
      this.adminUnsubscribe = this.db.collection("waiting_room")
        .onSnapshot((snapshot) => {
          const players = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            const joinedAtDate = data.joinedAt ? (data.joinedAt.toDate ? data.joinedAt.toDate() : new Date(data.joinedAt)) : new Date(0);
            players.push({
              id: doc.id,
              nickname: data.nickname,
              status: data.status,
              room: data.roomId,
              joinedAtDate: joinedAtDate
            });
          });
          
          // 클라이언트 사이드 정렬: joinedAtDate 기준 내림차순 (최신 가입 순)
          players.sort((a, b) => b.joinedAtDate - a.joinedAtDate);
          
          console.log("🛡️ [Admin DB Sync] Active student lists synchronized in real-time:", players);
          console.log("👀 [디버그] 관리자 화면 - 수신된 전체 참가자 데이터:", players);
          callback(players);
        }, (error) => {
          console.error("🛡️ [Admin DB Error] Real-time observer hook failed:", error);
          console.error("❌ [디버그] 관리자 화면 - waiting_room snapshot 구독 실패!", error);
        });
    } else {
      this.adminListeners.push(callback);
      callback(this.playersList);
    }
  }

  // 관리자 참가자 명단 변동 전파 (시뮬레이터용)
  notifyPlayersChanged() {
    this.adminListeners.forEach(callback => callback(this.playersList));
  }

  // 관리자용 신규 함장 등록 도우미 (시뮬레이터용)
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

  // 함장 세션 상태 갱신 도우미 (시뮬레이터용)
  updatePlayerStatusInAdmin(playerId, status, roomId = null) {
    const player = this.playersList.find(p => p.id === playerId);
    if (player) {
      player.status = status;
      player.room = roomId;
      this.notifyPlayersChanged();
    }
  }

  // 참가자 대기열 참가 실시간 구독 (Lobby Screen)
  listenQueue(callback) {
    if (this.isRealFirebase) {
      console.log("👀 [디버그] 대기열(queue) 실시간 구독 시작");
      // status == 'waiting' 인 사용자들 실시간 구독 (복합 인덱스 에러 방지를 위해 orderBy를 제거하고 클라이언트 측에서 정렬)
      this.queueUnsubscribe = this.db.collection("waiting_room")
        .where("status", "==", "waiting")
        .onSnapshot((snapshot) => {
          const list = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            const joinedAtDate = data.joinedAt ? (data.joinedAt.toDate ? data.joinedAt.toDate() : new Date(data.joinedAt)) : new Date();
            list.push({ id: doc.id, ...data, joinedAtDate: joinedAtDate });
          });
          
          // 클라이언트 측 정렬: 가입 일시 기준 오름차순
          list.sort((a, b) => a.joinedAtDate - b.joinedAtDate);
          
          console.log("📡 [Queue DB Sync] Queue list updated:", list);
          console.log("👀 [디버그] 대기열 실시간 업데이트 수신 완료. 대기 인원:", list.length);
          callback(list);
        }, (error) => {
          console.error("📡 [Queue DB Error] Queue snapshot observer hook failed:", error);
          console.error("❌ [디버그] 대기열 snapshot 구독 실패!", error);
        });
    } else {
      this.queueListeners.push(callback);
      callback(this.waitingList);
    }
  }

  // 대기열 변동 상황 전파 (시뮬레이터용)
  notifyQueueChanged() {
    this.queueListeners.forEach(callback => callback(this.waitingList));
  }

  // 닉네임 등록 및 대기열 참가
  joinQueue(nickname, isPvE = false, onMatchFound) {
    const playerId = "player_" + Math.random().toString(36).substr(2, 9);
    
    this.currentUser = {
      id: playerId,
      nickname: nickname || (isPvE ? "연습 함장" : "무명 함장"),
      score: 0,
      isHost: true,
      status: "waiting"
    };

    console.log(`📡 [Queue Action] Nickname "${this.currentUser.nickname}" joining queue. (ID: ${playerId})`);

    if (this.isRealFirebase) {
      console.log(`👉 [디버그] 참가자 대기열 등록을 위한 Firestore 쓰기 시도. 닉네임: ${this.currentUser.nickname}, ID: ${playerId}`);
      // 1. 실제 Firebase Firestore에 사용자 세션 데이터 등록
      this.db.collection("waiting_room").doc(playerId).set({
        nickname: this.currentUser.nickname,
        status: isPvE ? "pve" : "waiting",
        roomId: null,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        console.log(`📡 [Firebase Firestore] Player registered successfully in waiting_room collection.`);
        console.log(`✅ [디버그] Firestore 등록 완료! 경로: waiting_room/${playerId}`);
      }).catch(err => {
        console.error("❌ [Firebase Firestore] User registration document write error:", err);
        console.error("❌ [디버그] Firestore 등록 실패!", err);
      });

      // 2. 내 사용자 문서의 roomId 실시간 감시 (매칭 매니저나 교사가 매칭시켜서 roomId가 기입되길 대기)
      this.userUnsubscribe = this.db.collection("waiting_room").doc(playerId).onSnapshot((doc) => {
        const data = doc.data();
        if (data && data.roomId && data.status === "playing") {
          console.log(`📡 [Lobby Connection] Matchmaker paired player. Assigned Room ID: ${data.roomId}`);
          
          // 방 정보 로드
          this.db.collection("rooms").doc(data.roomId).get().then(roomDoc => {
            const roomData = roomDoc.data();
            
            // 매칭 정보 콜백 트리거
            onMatchFound({
              roomId: data.roomId,
              player: this.currentUser,
              opponent: roomData.p1.id === playerId ? roomData.p2 : roomData.p1,
              targets: roomData.targets,
              isPvE: roomData.isPvE
            });
          });
          
          // 리스너 자가 해제
          this.userUnsubscribe();
          this.userUnsubscribe = null;
        }
      });

      // PVE인 경우 즉각 AI 봇 매칭 방 생성 트리거
      if (isPvE) {
        setTimeout(() => {
          const mockOpponent = {
            id: "bot_alpha",
            nickname: "AI 봇 (수학 마스터)",
            score: 0,
            isBot: true
          };
          this.createMockRoom(this.currentUser, mockOpponent, true, onMatchFound);
        }, 1000);
      }
    } else {
      // 오프라인/로컬 시뮬레이터 구동
      this.registerPlayerInAdmin(this.currentUser);

      if (isPvE) {
        this.waitingList.push(this.currentUser);
        this.notifyQueueChanged();

        setTimeout(() => {
          this.simulatedOpponent = {
            id: "bot_alpha",
            nickname: "AI 봇 (수학 마스터)",
            score: 0,
            isBot: true
          };
          this.waitingList = this.waitingList.filter(p => p.id !== this.currentUser.id);
          this.notifyQueueChanged();
          this.createMockRoom(this.currentUser, this.simulatedOpponent, true, onMatchFound);
        }, 1000);
      } else {
        this.waitingList.push(this.currentUser);
        
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

        // ⚠️ 관리자 주도 매칭을 위해 로컬 시뮬레이터 자동 매칭(setTimeout 5초) 제거함
      }
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
  forceMatchAllPlayers(onMatchFound) {
    console.log("🛡️ [Admin Action] Triggering forceMatchAllPlayers matchmaking batch.");
    
    if (this.isRealFirebase) {
      // 1. 데이터베이스에서 waiting 인 학생들 쿼리 로드 (복합 인덱스 에러 방지를 위해 orderBy 제거)
      this.db.collection("waiting_room")
        .where("status", "==", "waiting")
        .get()
        .then((snapshot) => {
          const waiting = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            const joinedAtDate = data.joinedAt ? (data.joinedAt.toDate ? data.joinedAt.toDate() : new Date(data.joinedAt)) : new Date();
            waiting.push({ id: doc.id, ...data, joinedAtDate: joinedAtDate });
          });

          // 클라이언트 측 정렬
          waiting.sort((a, b) => a.joinedAtDate - b.joinedAtDate);

          console.log(`🛡️ [Admin Action] Found waiting student count: ${waiting.length}`);
          if (waiting.length === 0) return;

          // 2. 2명씩 짝지어서 방 문서 생성하고 user 문서에 status, roomId 입력
          while (waiting.length >= 2) {
            const p1 = waiting.shift();
            const p2 = waiting.shift();
            const roomId = "room_" + Math.random().toString(36).substr(2, 9);
            const targets = this.generateIntegerTargets();

            console.log(`🛡️ [Match Success] Creating room: ${roomId} with P1: ${p1.nickname}, P2: ${p2.nickname}`);
            
            // 방 생성
            this.db.collection("rooms").doc(roomId).set({
              id: roomId,
              p1: { id: p1.id, nickname: p1.nickname, score: 0 },
              p2: { id: p2.id, nickname: p2.nickname, score: 0 },
              targets: targets,
              isPvE: false,
              timeRemaining: 120,
              status: "playing",
              lastAction: null
            });

            // 유저 문서 수정 -> 학생 클라이언트 side에서 감지하여 코핏으로 진입
            this.db.collection("waiting_room").doc(p1.id).update({ status: "playing", roomId: roomId });
            this.db.collection("waiting_room").doc(p2.id).update({ status: "playing", roomId: roomId });
          }

          // 홀수 시 마지막 한 명 AI 봇 할당
          if (waiting.length === 1) {
            const single = waiting.shift();
            const roomId = "room_" + Math.random().toString(36).substr(2, 9);
            const targets = this.generateIntegerTargets();

            console.log(`🛡️ [Match Success] Creating PVE bot room: ${roomId} for single player: ${single.nickname}`);

            this.db.collection("rooms").doc(roomId).set({
              id: roomId,
              p1: { id: single.id, nickname: single.nickname, score: 0 },
              p2: { id: "bot_alpha", nickname: "AI 봇 (수학 마스터)", score: 0, isBot: true },
              targets: targets,
              isPvE: true,
              timeRemaining: 120,
              status: "playing",
              lastAction: null
            });

            this.db.collection("waiting_room").doc(single.id).update({ status: "playing", roomId: roomId });
          }
        }).catch(err => {
          console.error("❌ [Admin Action] Force Matchmaking batch fetch error:", err);
        });
    } else {
      if (this.waitingList.length === 0) return;

      if (this.mockQueueInterval) {
        clearInterval(this.mockQueueInterval);
        this.mockQueueInterval = null;
      }

      while (this.waitingList.length >= 2) {
        const p1 = this.waitingList.shift();
        const p2 = this.waitingList.shift();
        this.createMockRoom(p1, p2, false, onMatchFound);
      }

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
  }

  // 관리자용 실시간 닉네임 수정 기능 구현
  updateNickname(playerId, newNickname) {
    const trimmed = newNickname.trim();
    if (!trimmed) {
      return { success: false, error: "닉네임은 공백일 수 없습니다." };
    }

    console.log(`🛡️ [Admin Action] Requesting nickname modification for ID: ${playerId} to: "${trimmed}"`);

    if (this.isRealFirebase) {
      // 1. 중복성 닉네임 검사
      return this.db.collection("waiting_room")
        .where("nickname", "==", trimmed)
        .get()
        .then((snapshot) => {
          // 본인을 제외한 다른 사용자 중 동일한 닉네임이 있는지 확인
          let isDup = false;
          snapshot.forEach(doc => {
            if (doc.id !== playerId) {
              isDup = true;
            }
          });

          if (isDup) {
            console.warn("⚠️ [Nickname Edit] Duplicated name rejected.");
            return { success: false, error: "이미 존재하는 닉네임과 중복됩니다." };
          }

          // 2. 유저 컬렉션 내 닉네임 업데이트
          this.db.collection("waiting_room").doc(playerId).update({
            nickname: trimmed
          });

          // 3. 만약 해당 플레이어가 현재 활성화된 방에서 게임 중인 경우, 방 문서 내 닉네임 필드도 실시간 수정
          // 이 변경값은 양 클라이언트 listenRoom 스냅샷에 잡혀 HUD가 실시간 동기화됩니다!
          this.db.collection("waiting_room").doc(playerId).get().then(playerDoc => {
            const userData = playerDoc.data();
            if (userData && userData.roomId && userData.status === "playing") {
              const roomRef = this.db.collection("rooms").doc(userData.roomId);
              
              this.db.runTransaction(transaction => {
                return transaction.get(roomRef).then(roomDoc => {
                  if (!roomDoc.exists) return;
                  const roomData = roomDoc.data();
                  
                  if (roomData.p1.id === playerId) {
                    roomData.p1.nickname = trimmed;
                  }
                  if (roomData.p2.id === playerId) {
                    roomData.p2.nickname = trimmed;
                  }
                  
                  transaction.update(roomRef, {
                    p1: roomData.p1,
                    p2: roomData.p2
                  });
                });
              }).then(() => {
                console.log("✏️ [Admin Action] Room database nickname sync complete.");
              });
            }
          });

          return { success: true };
        });
    } else {
      const exists = this.playersList.some(p => p.id !== playerId && p.nickname.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return { success: false, error: "이미 존재하는 닉네임과 중복됩니다." };
      }

      const player = this.playersList.find(p => p.id === playerId);
      if (player) player.nickname = trimmed;

      const queuePlayer = this.waitingList.find(p => p.id === playerId);
      if (queuePlayer) queuePlayer.nickname = trimmed;

      if (this.currentUser && this.currentUser.id === playerId) {
        this.currentUser.nickname = trimmed;
      }
      if (this.simulatedOpponent && this.simulatedOpponent.id === playerId) {
        this.simulatedOpponent.nickname = trimmed;
      }

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
  }

  // 관리자용 세션 시스템 초기화 기능 구현
  triggerReset() {
    console.log("🧹 [Admin Action] System full reset requested. Purging database.");
    
    if (this.isRealFirebase) {
      // 1. 방을 전부 터트려 active 플레이어들 강제 퇴출 통지
      // status = 'reset' 상태 룸 브로드캐스트 발송
      this.db.collection("rooms").get().then(snapshot => {
        snapshot.forEach(doc => {
          this.db.collection("rooms").doc(doc.id).update({ status: "reset" }).then(() => {
            // 퇴출 전파 완료 후 방 문서 삭제
            this.db.collection("rooms").doc(doc.id).delete();
          });
        });
      });

      // 2. 유저 컬렉션 도큐먼트 전부 삭제
      this.db.collection("waiting_room").get().then(snapshot => {
        snapshot.forEach(doc => {
          this.db.collection("waiting_room").doc(doc.id).delete();
        });
      });

      console.log("🧹 [Firebase Firestore] Database clean reset completed.");
    } else {
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

      this.stateListeners.forEach(listener => listener({ status: "reset" }));
      this.stateListeners = [];
    }
  }

  // 가상의 게임 룸 생성 및 초기 상태 설정 (시뮬레이터용)
  createMockRoom(player1, player2, isPvE, onMatchFound) {
    const roomId = "room_" + Math.random().toString(36).substr(2, 9);
    const targets = this.generateIntegerTargets();

    this.currentRoom = {
      id: roomId,
      p1: player1,
      p2: player2,
      targets: targets,
      isPvE: isPvE,
      timeRemaining: 120,
      status: "playing",
      lastAction: null
    };

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
  generateIntegerTargets() {
    const targets = [];
    const possibleCoords = [];
    
    // [-2, 2] 범위 내의 모든 25개 정수 좌표쌍 나열
    for (let x = -2; x <= 2; x++) {
      for (let y = -2; y <= 2; y++) {
        possibleCoords.push({ x: x, y: y });
      }
    }
    
    // Fisher-Yates 무작위 셔플로 골고루 분포하게 섞기
    for (let i = possibleCoords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [possibleCoords[i], possibleCoords[j]] = [possibleCoords[j], possibleCoords[i]];
    }
    
    // 정확히 15개 좌표를 추출하여 별 객체 생성
    const selectedCoords = possibleCoords.slice(0, 15);
    selectedCoords.forEach(coord => {
      targets.push({
        id: "star_" + Math.random().toString(36).substr(2, 5),
        x: coord.x,
        y: coord.y,
        points: 10,
        glowColor: this.getRandomNeonColor()
      });
    });
    
    console.log("🪐 [별 생성 로그] 중복 없이 정수 좌표 상에 15개의 차원 에너지 별을 고르게 분산 배치 완료:", targets);
    return targets;
  }

  getRandomNeonColor() {
    const colors = ["#ff3e96", "#00f3ff", "#ff9f00", "#d000ff", "#e0ff00"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // 실시간 방 상태 리스너 등록
  listenRoom(roomId, callback) {
    const isLocalRoom = !roomId || String(roomId).startsWith("room_") && (!this.db || !this.isRealFirebase || this.currentRoom && this.currentRoom.id === roomId && this.currentRoom.isPvE);

    if (this.isRealFirebase && !isLocalRoom) {
      this.roomUnsubscribe = this.db.collection("rooms").doc(roomId)
        .onSnapshot((doc) => {
          const data = doc.data();
          if (data) {
            console.log("🎮 [Room Sync] Room database state updated in real-time:", data);
            callback(data);
          }
        }, (error) => {
          console.error("❌ [Room Sync Error] Room observer hook failed:", error);
        });
    } else {
      this.stateListeners.push(callback);
      callback(this.currentRoom);
    }
  }

  // 점수 업데이트 및 발사 동기화
  updateRoomState(roomId, updatedFields) {
    const isLocalRoom = !roomId || String(roomId).startsWith("room_") && (!this.db || !this.isRealFirebase || this.currentRoom && this.currentRoom.id === roomId && this.currentRoom.isPvE);

    if (this.isRealFirebase && !isLocalRoom) {
      // Firebase 방 데이터 업데이트
      this.db.collection("rooms").doc(roomId).update(updatedFields)
        .then(() => {
          console.log("🎮 [Firebase Firestore] Room state written successfully:", updatedFields);
        })
        .catch(err => {
          console.error("❌ [Firebase Firestore] Room state write error:", err);
        });
    } else {
      if (!this.currentRoom || this.currentRoom.id !== roomId) return;
      this.currentRoom = { ...this.currentRoom, ...updatedFields };
      this.stateListeners.forEach(listener => listener(this.currentRoom));
    }
  }

  // 레이저 발사 이벤트 기록 및 득점 계산
  fireLaser(roomId, playerId, a, b, hitIds) {
    const isLocalRoom = !roomId || String(roomId).startsWith("room_") && (!this.db || !this.isRealFirebase || this.currentRoom && this.currentRoom.id === roomId && this.currentRoom.isPvE);
    
    console.log(`📡 [데이터 드라이버 디버그] fireLaser 시작. roomId: ${roomId}, playerId: ${playerId}, hits: ${hitIds}, isLocal: ${isLocalRoom}`);

    if (this.isRealFirebase && !isLocalRoom) {
      console.log(`🚀 [Laser Fired] Player ID: ${playerId} | Slope: ${a} | Intercept: ${b} | Hits: ${hitIds}`);

      const roomRef = this.db.collection("rooms").doc(roomId);
      
      // 트랜잭션 처리를 통해 멀티 플레이어 동시 타격 데이터 동기화 안전성 보장
      this.db.runTransaction((transaction) => {
        return transaction.get(roomRef).then((roomDoc) => {
          if (!roomDoc.exists) return;
          const roomData = roomDoc.data();
          
          const isP1 = (roomData.p1.id === playerId);
          const shooter = isP1 ? roomData.p1 : roomData.p2;

          let addedScore = 0;
          const hitCount = hitIds.length;
          if (hitCount === 1) addedScore = 10;
          else if (hitCount === 2) addedScore = 25;
          else if (hitCount >= 3) addedScore = 40;

          shooter.score += addedScore;
          
          // 맞은 별들 제거 (형변환 대조 강화 적용하여 안전성 보장)
          const remainingTargets = roomData.targets.filter(t => !hitIds.map(String).includes(String(t.id)));

          console.log(`✅ [Firebase 디버그] 별 타격 성공. 기존 별 개수: ${roomData.targets.length} -> 잔여 별 개수: ${remainingTargets.length}`);

          transaction.update(roomRef, {
            p1: roomData.p1,
            p2: roomData.p2,
            targets: remainingTargets,
            lastAction: {
              type: "fire",
              playerId: playerId,
              shooterName: shooter.nickname,
              a: a,
              b: b,
              hitIds: hitIds,
              addedScore: addedScore
            }
          });
        });
      }).then(() => {
        console.log("🚀 [Firebase Firestore] Firing sweep transaction committed successfully.");
      }).catch((err) => {
        console.error("❌ [Firebase Firestore] Firing transaction failed:", err);
      });

    } else {
      if (!this.currentRoom) {
        console.warn("⚠️ [디버그] fireLaser 오류: 로컬 가상 방(currentRoom)이 비어있습니다.");
        return;
      }

      const isP1 = (this.currentRoom.p1.id === playerId);
      const shooter = isP1 ? this.currentRoom.p1 : this.currentRoom.p2;

      let addedScore = 0;
      const hitCount = hitIds.length;
      if (hitCount === 1) addedScore = 10;
      else if (hitCount === 2) addedScore = 25;
      else if (hitCount >= 3) addedScore = 40;

      shooter.score += addedScore;
      
      // 맞은 별들 제거 (형변환 대조 강화 적용하여 안전성 보장)
      const remainingTargets = this.currentRoom.targets.filter(t => !hitIds.map(String).includes(String(t.id)));

      console.log(`✅ [시뮬레이터 디버그] 별 타격 성공. 슈터: ${shooter.nickname}, 획득점수: +${addedScore}, 누적 점수: ${shooter.score}`);
      console.log(`✅ [시뮬레이터 디버그] 기존 별 개수: ${this.currentRoom.targets.length} -> 잔여 별 개수: ${remainingTargets.length}`);

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
  }

  // 매칭 취소 / 로비 귀환 시 리소스를 정리합니다.
  disconnect() {
    console.log("📡 [Network Manager] Disconnecting and unsubscribing listeners.");
    
    // 리얼타임 리스너 구독 취소 실행
    if (this.userUnsubscribe) {
      this.userUnsubscribe();
      this.userUnsubscribe = null;
    }
    if (this.roomUnsubscribe) {
      this.roomUnsubscribe();
      this.roomUnsubscribe = null;
    }
    if (this.queueUnsubscribe) {
      this.queueUnsubscribe();
      this.queueUnsubscribe = null;
    }
    if (this.adminUnsubscribe) {
      this.adminUnsubscribe();
      this.adminUnsubscribe = null;
    }

    if (this.isRealFirebase && this.currentUser) {
      // 내 로그인 문서 제거
      this.db.collection("waiting_room").doc(this.currentUser.id).delete()
        .then(() => console.log("🧹 [Firebase Firestore] Current user document deleted."))
        .catch(err => console.error("❌ [Firebase Firestore] Delete current user document error:", err));
    }

    this.currentUser = null;
    this.currentRoom = null;
    this.stateListeners = [];
    
    if (this.aiInterval) {
      clearInterval(this.aiInterval);
      this.aiInterval = null;
    }
    if (this.mockQueueInterval) {
      clearInterval(this.mockQueueInterval);
      this.mockQueueInterval = null;
    }
  }
}

// 전역 시뮬레이터 인스턴스 노출
window.spaceDb = new CockpitDbSimulator();
