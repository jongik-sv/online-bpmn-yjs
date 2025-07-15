/**
 * 상태 관리자
 * 문서 상태의 저장, 관리, 히스토리를 담당
 */

import { Logger } from '../utils/Logger.js';

export class StateManager {
  constructor(config = {}) {
    this.config = {
      maxHistorySize: 100,
      enableSnapshots: true,
      snapshotInterval: 10, // 10번마다 스냅샷 생성
      ...config
    };
    
    this.logger = new Logger();
    
    // 상태 저장소
    this.currentState = null;
    this.stateHistory = [];
    this.snapshots = [];
    this.operationCount = 0;
    
    this.logger.debug('StateManager created');
  }

  /**
   * 상태 관리자 초기화
   * @param {Object} context - 초기화 컨텍스트
   */
  async initialize(context) {
    this.context = context;
    this.logger.info('StateManager initialized');
  }

  /**
   * 현재 상태 조회
   * @returns {DocumentState|null}
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * 마지막 상태 조회 (이전 상태)
   * @returns {DocumentState|null}
   */
  getLastState() {
    if (this.stateHistory.length === 0) {
      return null;
    }
    return this.stateHistory[this.stateHistory.length - 1];
  }

  /**
   * 상태 업데이트
   * @param {DocumentState} newState - 새로운 상태
   */
  async updateState(newState) {
    // 현재 상태를 히스토리에 추가
    if (this.currentState) {
      this.stateHistory.push({ ...this.currentState });
      
      // 히스토리 크기 제한
      if (this.stateHistory.length > this.config.maxHistorySize) {
        this.stateHistory.shift();
      }
    }

    // 새 상태 설정
    this.currentState = { ...newState };
    this.operationCount++;

    // 스냅샷 생성 (주기적)
    if (this.config.enableSnapshots && 
        this.operationCount % this.config.snapshotInterval === 0) {
      this._createSnapshot();
    }

    this.logger.debug(`State updated: ${Object.keys(newState.elements || {}).length} elements`);
  }

  /**
   * 상태 히스토리 조회
   * @param {number} limit - 조회할 항목 수
   * @returns {DocumentState[]}
   */
  getStateHistory(limit = 10) {
    return this.stateHistory.slice(-limit);
  }

  /**
   * 특정 시점 상태 조회
   * @param {number} timestamp - 타임스탬프
   * @returns {DocumentState|null}
   */
  getStateAtTime(timestamp) {
    // 현재 상태가 해당 시간보다 이후라면 현재 상태 반환
    if (this.currentState && this.currentState.timestamp <= timestamp) {
      return this.currentState;
    }

    // 히스토리에서 가장 가까운 상태 찾기
    let closestState = null;
    let minDiff = Infinity;

    for (const state of this.stateHistory) {
      if (state.timestamp <= timestamp) {
        const diff = timestamp - state.timestamp;
        if (diff < minDiff) {
          minDiff = diff;
          closestState = state;
        }
      }
    }

    return closestState;
  }

  /**
   * 상태 롤백
   * @param {number} steps - 롤백할 단계 수
   * @returns {DocumentState|null}
   */
  rollback(steps = 1) {
    if (steps <= 0 || this.stateHistory.length === 0) {
      return null;
    }

    const rollbackSteps = Math.min(steps, this.stateHistory.length);
    
    // 현재 상태를 히스토리에 추가 (롤백 전 백업)
    if (this.currentState) {
      this.stateHistory.push({ ...this.currentState });
    }

    // 롤백 실행
    for (let i = 0; i < rollbackSteps; i++) {
      this.currentState = this.stateHistory.pop();
    }

    this.logger.info(`Rolled back ${rollbackSteps} steps`);
    return this.currentState;
  }

  /**
   * 스냅샷 생성
   * @private
   */
  _createSnapshot() {
    if (!this.currentState) {
      return;
    }

    const snapshot = {
      id: this._generateSnapshotId(),
      timestamp: Date.now(),
      operationCount: this.operationCount,
      state: this._deepClone(this.currentState)
    };

    this.snapshots.push(snapshot);

    // 스냅샷 개수 제한 (최대 10개)
    if (this.snapshots.length > 10) {
      this.snapshots.shift();
    }

    this.logger.debug(`Snapshot created: ${snapshot.id}`);
  }

  /**
   * 스냅샷 목록 조회
   * @returns {Array}
   */
  getSnapshots() {
    return this.snapshots.map(snap => ({
      id: snap.id,
      timestamp: snap.timestamp,
      operationCount: snap.operationCount,
      elementCount: Object.keys(snap.state.elements || {}).length
    }));
  }

  /**
   * 스냅샷 복원
   * @param {string} snapshotId - 스냅샷 ID
   * @returns {boolean}
   */
  restoreSnapshot(snapshotId) {
    const snapshot = this.snapshots.find(snap => snap.id === snapshotId);
    
    if (!snapshot) {
      this.logger.error(`Snapshot not found: ${snapshotId}`);
      return false;
    }

    // 현재 상태를 히스토리에 백업
    if (this.currentState) {
      this.stateHistory.push({ ...this.currentState });
    }

    // 스냅샷 복원
    this.currentState = this._deepClone(snapshot.state);
    
    this.logger.info(`Snapshot restored: ${snapshotId}`);
    return true;
  }

  /**
   * 상태 통계 정보 조회
   * @returns {Object}
   */
  getStatistics() {
    const currentElementCount = this.currentState ? 
      Object.keys(this.currentState.elements || {}).length : 0;

    return {
      currentElementCount,
      historySize: this.stateHistory.length,
      snapshotCount: this.snapshots.length,
      operationCount: this.operationCount,
      memoryUsage: this._estimateMemoryUsage()
    };
  }

  /**
   * 상태 검증
   * @param {DocumentState} state - 검증할 상태
   * @returns {Object}
   */
  validateState(state) {
    const errors = [];
    const warnings = [];

    if (!state) {
      errors.push('State is null or undefined');
      return { valid: false, errors, warnings };
    }

    // 기본 구조 검증
    if (!state.timestamp) {
      errors.push('Missing timestamp');
    }

    if (!state.version) {
      errors.push('Missing version');
    }

    if (!state.elements || typeof state.elements !== 'object') {
      errors.push('Missing or invalid elements object');
    } else {
      // 요소 검증
      for (const [id, element] of Object.entries(state.elements)) {
        if (!element.id) {
          errors.push(`Element ${id} missing id`);
        }

        if (!element.type) {
          errors.push(`Element ${id} missing type`);
        }

        if (typeof element.x !== 'number' || typeof element.y !== 'number') {
          warnings.push(`Element ${id} has invalid position`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 메모리 정리
   */
  cleanup() {
    // 오래된 히스토리 정리
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24시간 전
    
    this.stateHistory = this.stateHistory.filter(state => 
      state.timestamp > cutoff
    );

    // 오래된 스냅샷 정리
    this.snapshots = this.snapshots.filter(snapshot => 
      snapshot.timestamp > cutoff
    );

    this.logger.debug('StateManager cleanup completed');
  }

  /**
   * 상태 내보내기
   * @returns {Object}
   */
  exportData() {
    return {
      currentState: this.currentState,
      stateHistory: this.stateHistory,
      snapshots: this.snapshots.map(snap => ({
        id: snap.id,
        timestamp: snap.timestamp,
        operationCount: snap.operationCount
      })),
      statistics: this.getStatistics()
    };
  }

  /**
   * 상태 가져오기
   * @param {Object} data - 가져올 데이터
   */
  importData(data) {
    if (data.currentState) {
      this.currentState = data.currentState;
    }

    if (data.stateHistory) {
      this.stateHistory = data.stateHistory;
    }

    this.logger.info('StateManager data imported');
  }

  /**
   * 메모리 사용량 추정
   * @private
   * @returns {number}
   */
  _estimateMemoryUsage() {
    const currentStateSize = this.currentState ? 
      JSON.stringify(this.currentState).length : 0;
    
    const historySize = this.stateHistory.reduce((total, state) => 
      total + JSON.stringify(state).length, 0);
    
    const snapshotSize = this.snapshots.reduce((total, snapshot) => 
      total + JSON.stringify(snapshot.state).length, 0);

    return currentStateSize + historySize + snapshotSize;
  }

  /**
   * 깊은 복사
   * @private
   * @param {Object} obj - 복사할 객체
   * @returns {Object}
   */
  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * 스냅샷 ID 생성
   * @private
   * @returns {string}
   */
  _generateSnapshotId() {
    return 'snapshot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  }

  /**
   * 리소스 정리
   */
  destroy() {
    this.currentState = null;
    this.stateHistory = [];
    this.snapshots = [];
    this.operationCount = 0;
    
    this.logger.info('StateManager destroyed');
  }
}