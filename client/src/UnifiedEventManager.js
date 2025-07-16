import EventDeduplicator from './EventDeduplicator.js';

/**
 * 통합 이벤트 관리자
 * EventDeduplicator와 배치 처리, 이벤트 통합 기능을 제공
 */
class UnifiedEventManager {
  /**
   * UnifiedEventManager 생성자
   * @param {Object} options - 설정 옵션
   * @param {number} options.windowMs - 중복 검사 시간 윈도우 (기본값: 1000ms)
   * @param {number} options.queueSize - 큐 최대 크기 (기본값: 20개)
   * @param {number} options.batchDelay - 배치 처리 지연시간 (기본값: 50ms)
   * @param {boolean} options.enableBatching - 배치 처리 활성화 (기본값: true)
   * @param {boolean} options.enableConsolidation - 이벤트 통합 활성화 (기본값: true)
   */
  constructor(options = {}) {
    const {
      windowMs = 1000,
      queueSize = 20,
      batchDelay = 50,
      enableBatching = true,
      enableConsolidation = true
    } = options;

    this.deduplicator = new EventDeduplicator(windowMs, queueSize);
    this.batchDelay = batchDelay;
    this.enableBatching = enableBatching;
    this.enableConsolidation = enableConsolidation;
    
    // 배치 처리용 큐
    this.batchedEvents = [];
    this.batchTimer = null;
    
    // 이벤트 핸들러 저장소
    this.eventHandlers = new Map();
    
    // 통계
    this.stats = {
      totalEmitted: 0,
      duplicatesFiltered: 0,
      batchesProcessed: 0,
      eventsConsolidated: 0
    };
  }

  /**
   * 이벤트 핸들러 등록
   * @param {string} eventType - 이벤트 타입
   * @param {Function} handler - 이벤트 핸들러 함수
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * 이벤트 핸들러 제거
   * @param {string} eventType - 이벤트 타입
   * @param {Function} handler - 제거할 핸들러 함수
   */
  off(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) return;
    
    const handlers = this.eventHandlers.get(eventType);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
    
    // 핸들러가 없으면 맵에서 제거
    if (handlers.length === 0) {
      this.eventHandlers.delete(eventType);
    }
  }

  /**
   * 이벤트 발생 및 중복 필터링
   * @param {string} eventType - 이벤트 타입
   * @param {Object} eventData - 이벤트 데이터
   * @returns {boolean} true이면 이벤트가 처리됨, false이면 중복으로 무시됨
   */
  emit(eventType, eventData) {
    this.stats.totalEmitted++;
    
    // 중복 이벤트 확인
    if (this.deduplicator.isDuplicate(eventType, eventData)) {
      this.stats.duplicatesFiltered++;
      return false;
    }

    // 배치 처리가 비활성화되면 즉시 처리
    if (!this.enableBatching) {
      this.processEvent(eventType, eventData);
      return true;
    }

    // 배치 처리를 위해 큐에 추가
    this.batchedEvents.push({ 
      eventType, 
      eventData, 
      timestamp: Date.now() 
    });
    
    // 배치 타이머 설정/재설정
    this.scheduleBatchProcessing();

    return true;
  }

  /**
   * 배치 처리 스케줄링
   */
  scheduleBatchProcessing() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.batchTimer = setTimeout(() => {
      this.processBatchedEvents();
    }, this.batchDelay);
  }

  /**
   * 배치된 이벤트들을 처리
   */
  processBatchedEvents() {
    if (this.batchedEvents.length === 0) return;

    let eventsToProcess = [...this.batchedEvents];
    
    // 이벤트 통합이 활성화되면 중복된 이벤트들을 통합
    if (this.enableConsolidation) {
      eventsToProcess = this.consolidateEvents(eventsToProcess);
    }
    
    // 통합된 이벤트들을 처리
    eventsToProcess.forEach(event => {
      this.processEvent(event.eventType, event.eventData);
    });

    // 통계 업데이트
    this.stats.batchesProcessed++;
    this.stats.eventsConsolidated += (this.batchedEvents.length - eventsToProcess.length);

    // 배치 초기화
    this.batchedEvents = [];
    this.batchTimer = null;
  }

  /**
   * 같은 요소에 대한 여러 이벤트를 하나로 통합
   * @param {Array} events - 배치된 이벤트 배열
   * @returns {Array} 통합된 이벤트 배열
   */
  consolidateEvents(events) {
    const eventMap = new Map();
    
    events.forEach(event => {
      const key = this.generateConsolidationKey(event);
      
      // 같은 키의 이벤트가 있으면 덮어쓰기 (마지막 것만 유지)
      if (eventMap.has(key)) {
        const existing = eventMap.get(key);
        // 더 최신 이벤트로 업데이트
        if (event.timestamp >= existing.timestamp) {
          eventMap.set(key, event);
        }
      } else {
        eventMap.set(key, event);
      }
    });
    
    return Array.from(eventMap.values());
  }

  /**
   * 이벤트 통합을 위한 키 생성
   * @param {Object} event - 이벤트 객체
   * @returns {string} 통합 키
   */
  generateConsolidationKey(event) {
    const { eventType, eventData } = event;
    
    // 같은 요소의 같은 타입 이벤트를 통합
    const elementId = eventData.elementId || eventData.id;
    
    // 위치 이동의 경우 연속적인 이동을 통합
    if (eventType.includes('move') || eventType.includes('position')) {
      return `${eventType}_${elementId}_position`;
    }
    
    // 크기 변경의 경우
    if (eventType.includes('resize') || eventType.includes('size')) {
      return `${eventType}_${elementId}_size`;
    }
    
    // 속성 변경의 경우 속성별로 분리
    if (eventType.includes('property') || eventType.includes('update')) {
      const properties = eventData.changedProperties ? 
        Object.keys(eventData.changedProperties).sort().join(',') : '';
      return `${eventType}_${elementId}_${properties}`;
    }
    
    // 기본적으로는 타입과 요소ID 조합
    return `${eventType}_${elementId}`;
  }

  /**
   * 실제 이벤트 처리 (핸들러 호출)
   * @param {string} eventType - 이벤트 타입
   * @param {Object} eventData - 이벤트 데이터
   */
  processEvent(eventType, eventData) {
    const handlers = this.eventHandlers.get(eventType);
    if (!handlers || handlers.length === 0) return;

    // 모든 등록된 핸들러 호출
    handlers.forEach(handler => {
      try {
        handler(eventData);
      } catch (error) {
        console.error(`이벤트 핸들러 오류 [${eventType}]:`, error);
      }
    });
  }

  /**
   * 즉시 배치 처리 실행 (디버깅/테스팅용)
   */
  flushBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.processBatchedEvents();
  }

  /**
   * 통계 정보 반환
   * @returns {Object} 통계 정보
   */
  getStats() {
    const dedupStats = this.deduplicator.getStats();
    
    return {
      ...this.stats,
      deduplicator: dedupStats,
      pendingBatchEvents: this.batchedEvents.length,
      registeredEventTypes: Array.from(this.eventHandlers.keys()),
      totalHandlers: Array.from(this.eventHandlers.values()).reduce((sum, handlers) => sum + handlers.length, 0)
    };
  }

  /**
   * 모든 상태 초기화
   */
  clear() {
    // 배치 타이머 정리
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // 큐 초기화
    this.batchedEvents = [];
    
    // Deduplicator 초기화
    this.deduplicator.clear();
    
    // 핸들러 유지 (필요시 별도 메서드로 분리)
    // this.eventHandlers.clear();
    
    // 통계 초기화
    this.stats = {
      totalEmitted: 0,
      duplicatesFiltered: 0,
      batchesProcessed: 0,
      eventsConsolidated: 0
    };
  }

  /**
   * 모든 이벤트 핸들러 제거
   */
  clearHandlers() {
    this.eventHandlers.clear();
  }

  /**
   * 설정 업데이트
   * @param {Object} newOptions - 새로운 설정 옵션
   */
  updateConfig(newOptions) {
    if (newOptions.batchDelay !== undefined) {
      this.batchDelay = newOptions.batchDelay;
    }
    if (newOptions.enableBatching !== undefined) {
      this.enableBatching = newOptions.enableBatching;
    }
    if (newOptions.enableConsolidation !== undefined) {
      this.enableConsolidation = newOptions.enableConsolidation;
    }
  }

  /**
   * 디버그 정보 출력
   */
  debug() {
    console.log('=== UnifiedEventManager Debug ===');
    console.log('Stats:', this.getStats());
    console.log('Batched Events:', this.batchedEvents);
    console.log('Event Handlers:', this.eventHandlers);
    console.log('Deduplicator Queue:', this.deduplicator.getQueueSnapshot());
    console.log('================================');
  }
}

export default UnifiedEventManager;