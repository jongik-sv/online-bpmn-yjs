/**
 * EventBus Manager
 * 
 * bpmn-js EventBus를 제어하여 Silent Mode에서 이벤트 발생을 억제하는 매니저
 * 원격 변경사항 적용 시 무한 루프를 방지하기 위해 사용
 */
export class EventBusManager {
  constructor(modeler) {
    this.modeler = modeler;
    this.eventBus = modeler.get('eventBus');
    
    // 원본 fire 메서드 백업
    this.originalFire = this.eventBus.fire.bind(this.eventBus);
    this.originalOn = this.eventBus.on.bind(this.eventBus);
    this.originalOff = this.eventBus.off.bind(this.eventBus);
    
    // Silent mode 상태
    this.isSilentMode = false;
    this.suppressedEvents = new Set();
    this.eventQueue = [];
    
    // 기본적으로 억제할 이벤트 타입들
    this.defaultSuppressedEvents = new Set([
      'element.changed',
      'element.updating',
      'element.updated',
      'shape.move.start',
      'shape.move.move',
      'shape.move.end',
      'commandStack.changed',
      'commandStack.execute',
      'commandStack.preExecute',
      'commandStack.postExecute'
    ]);
  }

  /**
   * Silent Mode 활성화
   * 지정된 이벤트들의 발생을 억제
   * @param {Array<string>} eventsToSuppress - 억제할 이벤트 타입 배열 (선택사항)
   */
  enableSilentMode(eventsToSuppress = null) {
    if (this.isSilentMode) {
      return; // 이미 Silent Mode
    }

    this.isSilentMode = true;
    
    // 억제할 이벤트 설정
    if (eventsToSuppress) {
      this.suppressedEvents = new Set(eventsToSuppress);
    } else {
      this.suppressedEvents = new Set(this.defaultSuppressedEvents);
    }

    // EventBus.fire 메서드 오버라이드
    this.eventBus.fire = (type, event) => {
      if (this.suppressedEvents.has(type)) {
        // 억제된 이벤트는 큐에 저장만 하고 발생시키지 않음
        this.eventQueue.push({ type, event, timestamp: Date.now() });
        return;
      }
      
      // 억제되지 않은 이벤트는 정상 발생
      return this.originalFire(type, event);
    };

    console.debug('EventBus Silent Mode enabled');
  }

  /**
   * Silent Mode 비활성화
   * 이벤트 발생을 정상화하고 큐에 저장된 이벤트들을 선택적으로 처리
   * @param {boolean} flushQueue - 큐에 저장된 이벤트들을 발생시킬지 여부
   */
  disableSilentMode(flushQueue = false) {
    if (!this.isSilentMode) {
      return; // 이미 Normal Mode
    }

    this.isSilentMode = false;
    
    // 원본 fire 메서드 복원
    this.eventBus.fire = this.originalFire;

    // 큐에 저장된 이벤트들 처리
    if (flushQueue && this.eventQueue.length > 0) {
      this.flushEventQueue();
    } else {
      this.clearEventQueue();
    }

    this.suppressedEvents.clear();
    console.debug('EventBus Silent Mode disabled');
  }

  /**
   * Silent Mode에서 작업 실행
   * 작업 완료 후 자동으로 Silent Mode 해제
   * @param {Function} operation - 실행할 작업
   * @param {Array<string>} eventsToSuppress - 억제할 이벤트 타입 (선택사항)
   * @param {boolean} flushQueue - 작업 후 큐 이벤트 발생 여부
   * @returns {any} 작업 결과
   */
  withSilentMode(operation, eventsToSuppress = null, flushQueue = false) {
    const wasInSilentMode = this.isSilentMode;
    
    try {
      if (!wasInSilentMode) {
        this.enableSilentMode(eventsToSuppress);
      }
      
      return operation();
    } finally {
      if (!wasInSilentMode) {
        this.disableSilentMode(flushQueue);
      }
    }
  }

  /**
   * 큐에 저장된 이벤트들을 발생시킴
   */
  flushEventQueue() {
    if (this.eventQueue.length === 0) {
      return;
    }

    console.debug(`Flushing ${this.eventQueue.length} queued events`);
    
    // 시간순으로 정렬
    this.eventQueue.sort((a, b) => a.timestamp - b.timestamp);
    
    // 이벤트 발생
    this.eventQueue.forEach(({ type, event }) => {
      try {
        this.originalFire(type, event);
      } catch (error) {
        console.error(`Error flushing event ${type}:`, error);
      }
    });

    this.clearEventQueue();
  }

  /**
   * 이벤트 큐 정리
   */
  clearEventQueue() {
    this.eventQueue.length = 0;
  }

  /**
   * 특정 이벤트 타입을 억제 목록에 추가
   * @param {string} eventType - 억제할 이벤트 타입
   */
  addSuppressedEvent(eventType) {
    this.suppressedEvents.add(eventType);
  }

  /**
   * 특정 이벤트 타입을 억제 목록에서 제거
   * @param {string} eventType - 억제 해제할 이벤트 타입
   */
  removeSuppressedEvent(eventType) {
    this.suppressedEvents.delete(eventType);
  }

  /**
   * 현재 억제되고 있는 이벤트 타입들 반환
   * @returns {Array<string>} 억제된 이벤트 타입 배열
   */
  getSuppressedEvents() {
    return Array.from(this.suppressedEvents);
  }

  /**
   * 큐에 저장된 이벤트 개수 반환
   * @returns {number} 큐 이벤트 개수
   */
  getQueuedEventCount() {
    return this.eventQueue.length;
  }

  /**
   * Silent Mode 상태 확인
   * @returns {boolean} Silent Mode 활성화 여부
   */
  isSilent() {
    return this.isSilentMode;
  }

  /**
   * 이벤트 리스너를 일시적으로 비활성화
   * @param {string} eventType - 비활성화할 이벤트 타입
   * @param {Function} listener - 비활성화할 리스너
   */
  temporarilyDisableListener(eventType, listener) {
    this.eventBus.off(eventType, listener);
    return () => {
      this.eventBus.on(eventType, listener);
    };
  }

  /**
   * 특정 이벤트를 강제로 발생시킴 (Silent Mode 무시)
   * @param {string} type - 이벤트 타입
   * @param {Object} event - 이벤트 객체
   */
  forceFireEvent(type, event) {
    this.originalFire(type, event);
  }

  /**
   * 매니저 정리
   */
  destroy() {
    // Silent Mode가 활성화되어 있다면 비활성화
    if (this.isSilentMode) {
      this.disableSilentMode(false);
    }
    
    // 원본 메서드들 복원
    this.eventBus.fire = this.originalFire;
    this.eventBus.on = this.originalOn;
    this.eventBus.off = this.originalOff;
    
    this.clearEventQueue();
  }
}