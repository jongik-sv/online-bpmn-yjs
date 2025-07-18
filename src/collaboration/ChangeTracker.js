/**
 * 변경사항 추적 및 중복 방지 시스템
 * 설계문서: silentUpdateArchitecture.md 참조
 */

export class ChangeTracker {
  constructor() {
    // 마지막 알려진 상태 저장
    this.lastKnownState = new Map();
    
    // 처리 중인 변경사항 추적 (중복 방지)
    this.pendingChanges = new Set();
    
    // 변경사항 히스토리 (디버깅용)
    this.changeHistory = [];
    this.maxHistorySize = 50;
    
    // 변경사항 큐 (배치 처리용)
    this.changeQueue = [];
    this.batchProcessingDelay = 50; // ms
    this.batchProcessingTimer = null;
    
    // 무시할 속성들 (변경 감지에서 제외)
    this.ignoredProperties = new Set([
      'parent', 'children', 'incoming', 'outgoing', 
      'waypoints', 'labels', '_eventBusListeners'
    ]);
    
    // 임시 상태 (원격 업데이트 중)
    this.temporaryIgnoreSet = new Set();
  }
  
  /**
   * 변경사항을 처리해야 하는지 확인
   */
  shouldProcessChange(elementId, newProperties) {
    // 임시 무시 목록에 있는 경우
    if (this.temporaryIgnoreSet.has(elementId)) {
      return false;
    }
    
    // 중복 처리 방지
    if (this.pendingChanges.has(elementId)) {
      return false;
    }
    
    // 현재 상태와 비교
    const currentState = this.lastKnownState.get(elementId);
    if (!currentState) {
      // 새로운 요소
      this.updateLastKnownState(elementId, newProperties);
      this.markAsPending(elementId);
      return true;
    }
    
    // 실제 변경사항인지 확인
    if (this.deepEqual(currentState, newProperties)) {
      return false;
    }
    
    // 중요한 변경사항인지 확인
    if (!this.isSignificantChange(currentState, newProperties)) {
      return false;
    }
    
    // 상태 업데이트 및 처리 마킹
    this.updateLastKnownState(elementId, newProperties);
    this.markAsPending(elementId);
    
    // 변경사항 히스토리에 기록
    this.recordChange(elementId, currentState, newProperties);
    
    return true;
  }
  
  /**
   * 요소의 현재 상태 업데이트
   */
  updateLastKnownState(elementId, properties) {
    // 깊은 복사로 상태 저장
    this.lastKnownState.set(elementId, this.deepClone(properties));
  }
  
  /**
   * 처리 중 상태로 마킹
   */
  markAsPending(elementId) {
    this.pendingChanges.add(elementId);
    
    // 일정 시간 후 자동 제거
    setTimeout(() => {
      this.pendingChanges.delete(elementId);
    }, 1000);
  }
  
  /**
   * 변경사항이 중요한지 확인
   */
  isSignificantChange(oldState, newState) {
    // BusinessObject 속성 변경
    if (this.hasBusinessObjectChanges(oldState, newState)) {
      return true;
    }
    
    // 위치/크기 변경
    if (this.hasVisualChanges(oldState, newState)) {
      return true;
    }
    
    // 기타 중요한 속성 변경
    return this.hasOtherSignificantChanges(oldState, newState);
  }
  
  /**
   * BusinessObject 변경 확인
   */
  hasBusinessObjectChanges(oldState, newState) {
    const oldBO = oldState.businessObject || {};
    const newBO = newState.businessObject || {};
    
    // 중요한 BPMN 속성들
    const importantProps = ['name', 'id', '$type', 'conditionExpression', 'documentation'];
    
    return importantProps.some(prop => {
      return !this.deepEqual(oldBO[prop], newBO[prop]);
    });
  }
  
  /**
   * 시각적 변경 확인
   */
  hasVisualChanges(oldState, newState) {
    const oldVisual = oldState.visual || {};
    const newVisual = newState.visual || {};
    
    const visualProps = ['x', 'y', 'width', 'height'];
    const threshold = 1; // 1px 이하 변경은 무시
    
    return visualProps.some(prop => {
      const oldVal = oldVisual[prop] || 0;
      const newVal = newVisual[prop] || 0;
      return Math.abs(oldVal - newVal) > threshold;
    });
  }
  
  /**
   * 기타 중요한 변경 확인
   */
  hasOtherSignificantChanges(oldState, newState) {
    // 마커 변경
    if (!this.deepEqual(oldState.markers, newState.markers)) {
      return true;
    }
    
    // 연결 관계 변경
    if (!this.deepEqual(oldState.source, newState.source) || 
        !this.deepEqual(oldState.target, newState.target)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 변경사항 기록 (히스토리)
   */
  recordChange(elementId, oldState, newState) {
    const changeRecord = {
      elementId: elementId,
      timestamp: Date.now(),
      oldState: this.deepClone(oldState),
      newState: this.deepClone(newState),
      changeType: this.determineChangeType(oldState, newState)
    };
    
    this.changeHistory.push(changeRecord);
    
    // 히스토리 크기 제한
    if (this.changeHistory.length > this.maxHistorySize) {
      this.changeHistory.shift();
    }
  }
  
  /**
   * 변경 타입 결정
   */
  determineChangeType(oldState, newState) {
    if (this.hasBusinessObjectChanges(oldState, newState)) {
      return 'business-object';
    }
    if (this.hasVisualChanges(oldState, newState)) {
      return 'visual';
    }
    return 'other';
  }
  
  /**
   * 요소를 임시로 무시 목록에 추가
   */
  addToTemporaryIgnore(elementId, duration = 100) {
    this.temporaryIgnoreSet.add(elementId);
    
    setTimeout(() => {
      this.temporaryIgnoreSet.delete(elementId);
    }, duration);
  }
  
  /**
   * 배치 변경사항 처리를 위한 큐 추가
   */
  queueChange(elementId, properties) {
    this.changeQueue.push({
      elementId: elementId,
      properties: properties,
      timestamp: Date.now()
    });
    
    // 배치 처리 스케줄링
    this.scheduleBatchProcessing();
  }
  
  /**
   * 배치 처리 스케줄링
   */
  scheduleBatchProcessing() {
    if (this.batchProcessingTimer) {
      clearTimeout(this.batchProcessingTimer);
    }
    
    this.batchProcessingTimer = setTimeout(() => {
      this.processBatch();
    }, this.batchProcessingDelay);
  }
  
  /**
   * 배치 처리 실행
   */
  processBatch() {
    if (this.changeQueue.length === 0) {
      return;
    }
    
    const batch = [...this.changeQueue];
    this.changeQueue = [];
    
    // 중복 제거 및 최신 상태로 병합
    const mergedChanges = this.mergeChanges(batch);
    
    // 각 변경사항에 대해 shouldProcessChange 확인
    mergedChanges.forEach(change => {
      if (this.shouldProcessChange(change.elementId, change.properties)) {
        // 실제 처리는 외부에서 담당
        this.onBatchChange && this.onBatchChange(change);
      }
    });
  }
  
  /**
   * 변경사항 병합 (같은 요소의 변경사항을 최신 것으로 통합)
   */
  mergeChanges(changes) {
    const merged = new Map();
    
    changes.forEach(change => {
      const existing = merged.get(change.elementId);
      if (!existing || change.timestamp > existing.timestamp) {
        merged.set(change.elementId, change);
      }
    });
    
    return Array.from(merged.values());
  }
  
  /**
   * 깊은 비교
   */
  deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
      return true;
    }
    
    if (obj1 == null || obj2 == null) {
      return obj1 === obj2;
    }
    
    if (typeof obj1 !== typeof obj2) {
      return false;
    }
    
    if (typeof obj1 !== 'object') {
      return obj1 === obj2;
    }
    
    // 배열 처리
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      return false;
    }
    
    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) {
        return false;
      }
      return obj1.every((item, index) => this.deepEqual(item, obj2[index]));
    }
    
    // 객체 처리
    const keys1 = Object.keys(obj1).filter(key => !this.ignoredProperties.has(key));
    const keys2 = Object.keys(obj2).filter(key => !this.ignoredProperties.has(key));
    
    if (keys1.length !== keys2.length) {
      return false;
    }
    
    return keys1.every(key => {
      return keys2.includes(key) && this.deepEqual(obj1[key], obj2[key]);
    });
  }
  
  /**
   * 깊은 복사
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }
    
    const cloned = {};
    Object.keys(obj).forEach(key => {
      if (!this.ignoredProperties.has(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    });
    
    return cloned;
  }
  
  /**
   * 특정 요소의 변경 히스토리 조회
   */
  getChangeHistory(elementId) {
    return this.changeHistory.filter(record => record.elementId === elementId);
  }
  
  /**
   * 최근 변경사항 조회
   */
  getRecentChanges(timeWindow = 5000) {
    const cutoff = Date.now() - timeWindow;
    return this.changeHistory.filter(record => record.timestamp > cutoff);
  }
  
  /**
   * 요소 상태 초기화
   */
  resetElementState(elementId) {
    this.lastKnownState.delete(elementId);
    this.pendingChanges.delete(elementId);
    this.temporaryIgnoreSet.delete(elementId);
  }
  
  /**
   * 전체 상태 초기화
   */
  reset() {
    this.lastKnownState.clear();
    this.pendingChanges.clear();
    this.temporaryIgnoreSet.clear();
    this.changeHistory = [];
    this.changeQueue = [];
    
    if (this.batchProcessingTimer) {
      clearTimeout(this.batchProcessingTimer);
      this.batchProcessingTimer = null;
    }
  }
  
  /**
   * 배치 변경 콜백 설정
   */
  setBatchChangeCallback(callback) {
    this.onBatchChange = callback;
  }
  
  /**
   * 상태 정보 조회 (디버깅용)
   */
  getStatus() {
    return {
      trackedElements: this.lastKnownState.size,
      pendingChanges: this.pendingChanges.size,
      temporaryIgnored: this.temporaryIgnoreSet.size,
      historySize: this.changeHistory.length,
      queueSize: this.changeQueue.length
    };
  }
  
  /**
   * 리소스 정리
   */
  destroy() {
    this.reset();
    this.onBatchChange = null;
  }
}

export default ChangeTracker;