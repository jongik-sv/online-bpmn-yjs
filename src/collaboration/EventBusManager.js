/**
 * EventBus Manager
 * 
 * bpmn-js의 EventBus를 임시로 비활성화하여 원격 변경사항 적용 시
 * 이벤트 발생을 억제하는 매니저입니다.
 */
export class EventBusManager {
  constructor(modeler) {
    this.modeler = modeler;
    this.eventBus = modeler.get('eventBus');
    this.originalFire = this.eventBus.fire.bind(this.eventBus);
    this.isSilentMode = false;
    this.suppressedEvents = [];
    
    // 억제할 이벤트 타입들
    this.suppressedEventTypes = new Set([
      'element.changed',
      'element.updateId',
      'shape.move.start',
      'shape.move.move',
      'shape.move.end',
      'commandStack.changed',
      'commandStack.execute',
      'canvas.viewbox.changed'
    ]);
  }

  /**
   * Silent Mode 활성화 - 이벤트 발생 억제
   */
  enableSilentMode() {
    if (this.isSilentMode) return;
    
    this.isSilentMode = true;
    
    // EventBus.fire 메소드를 오버라이드
    this.eventBus.fire = (type, event) => {
      // 억제할 이벤트인지 확인
      if (this.suppressedEventTypes.has(type)) {
        this.suppressedEvents.push({ type, event, timestamp: Date.now() });
        return; // 이벤트 발생 억제
      }
      
      // 억제하지 않을 이벤트는 정상 처리
      return this.originalFire(type, event);
    };
  }

  /**
   * Silent Mode 비활성화 - 이벤트 발생 재개
   */
  disableSilentMode() {
    if (!this.isSilentMode) return;
    
    this.isSilentMode = false;
    this.eventBus.fire = this.originalFire;
    
    // 억제된 이벤트 기록 정리 (필요시 분석용으로 보관)
    if (this.suppressedEvents.length > 0) {
      console.debug('EventBusManager: Suppressed events:', this.suppressedEvents.length);
      this.suppressedEvents = [];
    }
  }

  /**
   * 특정 작업을 Silent Mode에서 실행
   * @param {Function} operation - 실행할 작업
   * @returns {*} 작업 결과
   */
  withSilentMode(operation) {
    this.enableSilentMode();
    
    try {
      return operation();
    } finally {
      this.disableSilentMode();
    }
  }

  /**
   * 비동기 작업을 Silent Mode에서 실행
   * @param {Function} asyncOperation - 실행할 비동기 작업
   * @returns {Promise} 작업 결과
   */
  async withSilentModeAsync(asyncOperation) {
    this.enableSilentMode();
    
    try {
      return await asyncOperation();
    } finally {
      this.disableSilentMode();
    }
  }

  /**
   * 특정 이벤트 타입을 억제 목록에 추가
   * @param {string} eventType - 억제할 이벤트 타입
   */
  addSuppressedEventType(eventType) {
    this.suppressedEventTypes.add(eventType);
  }

  /**
   * 특정 이벤트 타입을 억제 목록에서 제거
   * @param {string} eventType - 제거할 이벤트 타입
   */
  removeSuppressedEventType(eventType) {
    this.suppressedEventTypes.delete(eventType);
  }

  /**
   * 현재 억제 중인 이벤트 타입들 반환
   * @returns {Array<string>} 억제 중인 이벤트 타입 배열
   */
  getSuppressedEventTypes() {
    return Array.from(this.suppressedEventTypes);
  }

  /**
   * 마지막으로 억제된 이벤트들 반환 (디버깅용)
   * @returns {Array} 억제된 이벤트 배열
   */
  getLastSuppressedEvents() {
    return [...this.suppressedEvents];
  }

  /**
   * Silent Mode 상태 확인
   * @returns {boolean} Silent Mode 활성화 여부
   */
  isSilent() {
    return this.isSilentMode;
  }

  /**
   * 매니저 정리 및 원상복구
   */
  destroy() {
    this.disableSilentMode();
    this.suppressedEvents = [];
    this.suppressedEventTypes.clear();
    this.modeler = null;
    this.eventBus = null;
    this.originalFire = null;
  }
}

export default EventBusManager;