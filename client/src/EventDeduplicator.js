/**
 * 이벤트 중복 방지를 위한 시간 윈도우 기반 큐 시스템
 * 1초 내 중복되는 같은 이벤트를 무시하도록 20개짜리 큐를 관리
 */
class EventDeduplicator {
  /**
   * EventDeduplicator 생성자
   * @param {number} windowMs - 중복 검사 시간 윈도우 (기본값: 1000ms)
   * @param {number} queueSize - 큐 최대 크기 (기본값: 20개)
   */
  constructor(windowMs = 1000, queueSize = 20) {
    this.windowMs = windowMs;
    this.queueSize = queueSize;
    this.eventQueue = []; // [{ timestamp, eventHash, eventData }]
    
    // 성능 통계 (선택적)
    this.stats = {
      totalEvents: 0,
      duplicateEvents: 0,
      cleanupCount: 0
    };
  }

  /**
   * 이벤트 중복 여부 확인
   * @param {string} eventType - 이벤트 타입
   * @param {Object} eventData - 이벤트 데이터
   * @returns {boolean} true이면 중복 이벤트
   */
  isDuplicate(eventType, eventData) {
    const eventHash = this.generateEventHash(eventType, eventData);
    const now = Date.now();
    
    // 성능 통계 업데이트
    this.stats.totalEvents++;
    
    // 오래된 이벤트 제거 (1초 초과)
    this.cleanOldEvents(now);
    
    // 중복 검사: 같은 해시 && 시간 윈도우 내
    const isDupe = this.eventQueue.some(event => 
      event.eventHash === eventHash && 
      (now - event.timestamp) <= this.windowMs
    );
    
    if (isDupe) {
      this.stats.duplicateEvents++;
      return true;
    }
    
    // 중복이 아니라면 큐에 추가
    this.addEvent(now, eventHash, eventData);
    return false;
  }

  /**
   * 이벤트 해시 생성 - 이벤트의 고유 식별자 생성
   * @param {string} eventType - 이벤트 타입
   * @param {Object} eventData - 이벤트 데이터
   * @returns {string} 이벤트 해시
   */
  generateEventHash(eventType, eventData) {
    const key = {
      type: eventType,
      elementId: eventData.elementId || eventData.id,
      action: eventData.action,
      
      // 위치 변경의 경우 좌표 반올림으로 미세한 차이 무시 (5px 단위)
      position: eventData.position ? {
        x: Math.round(eventData.position.x / 5) * 5,
        y: Math.round(eventData.position.y / 5) * 5
      } : undefined,
      
      // 크기 변경의 경우
      dimensions: eventData.dimensions ? {
        width: Math.round(eventData.dimensions.width / 5) * 5,
        height: Math.round(eventData.dimensions.height / 5) * 5
      } : undefined,
      
      // 속성 변경의 경우 변경된 속성만
      changedProperties: eventData.changedProperties ? 
        Object.keys(eventData.changedProperties).sort().join(',') : undefined,
      
      // 연결선 waypoint 변경의 경우
      waypoints: eventData.waypoints ? 
        eventData.waypoints.map(wp => ({
          x: Math.round(wp.x / 5) * 5,
          y: Math.round(wp.y / 5) * 5
        })) : undefined
    };
    
    // undefined 값 제거
    Object.keys(key).forEach(k => key[k] === undefined && delete key[k]);
    
    return JSON.stringify(key);
  }

  /**
   * 큐에 이벤트 추가 (FIFO 방식)
   * @param {number} timestamp - 이벤트 발생 시간
   * @param {string} eventHash - 이벤트 해시
   * @param {Object} eventData - 이벤트 데이터
   */
  addEvent(timestamp, eventHash, eventData) {
    this.eventQueue.push({ 
      timestamp, 
      eventHash, 
      eventData: this.sanitizeEventData(eventData)
    });
    
    // 큐 크기 제한 (오래된 것부터 제거)
    if (this.eventQueue.length > this.queueSize) {
      this.eventQueue.shift();
    }
  }

  /**
   * 오래된 이벤트 정리 (시간 윈도우 외부)
   * @param {number} currentTime - 현재 시간
   */
  cleanOldEvents(currentTime) {
    const initialLength = this.eventQueue.length;
    
    this.eventQueue = this.eventQueue.filter(event => 
      (currentTime - event.timestamp) <= this.windowMs
    );
    
    if (this.eventQueue.length < initialLength) {
      this.stats.cleanupCount++;
    }
  }

  /**
   * 이벤트 데이터 정리 (메모리 최적화)
   * @param {Object} eventData - 원본 이벤트 데이터
   * @returns {Object} 정리된 이벤트 데이터
   */
  sanitizeEventData(eventData) {
    // 메모리 절약을 위해 필수 정보만 저장
    return {
      elementId: eventData.elementId || eventData.id,
      action: eventData.action,
      timestamp: eventData.timestamp || Date.now()
    };
  }

  /**
   * 현재 큐 상태 반환
   * @returns {Object} 큐 통계 정보
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.eventQueue.length,
      duplicateRate: this.stats.totalEvents > 0 ? 
        (this.stats.duplicateEvents / this.stats.totalEvents * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 큐 초기화
   */
  clear() {
    this.eventQueue = [];
    this.stats = {
      totalEvents: 0,
      duplicateEvents: 0,
      cleanupCount: 0
    };
  }

  /**
   * 디버그용 큐 내용 출력
   * @returns {Array} 현재 큐 내용
   */
  getQueueSnapshot() {
    return this.eventQueue.map(event => ({
      timestamp: new Date(event.timestamp).toISOString(),
      hash: event.eventHash.substring(0, 50) + '...',
      elementId: event.eventData.elementId,
      action: event.eventData.action
    }));
  }

  /**
   * 강제 정리 (메모리 최적화용)
   */
  forceCleanup() {
    const now = Date.now();
    this.cleanOldEvents(now);
    
    // 큐가 가득 찬 경우 절반으로 줄이기
    if (this.eventQueue.length >= this.queueSize) {
      this.eventQueue = this.eventQueue.slice(-Math.floor(this.queueSize / 2));
    }
  }
}

export default EventDeduplicator;