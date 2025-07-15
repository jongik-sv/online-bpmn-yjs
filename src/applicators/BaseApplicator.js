/**
 * 기본 Diff 적용기
 * 모든 Diff 적용기의 베이스 클래스
 */

import { Logger } from '../utils/Logger.js';

export class BaseApplicator {
  constructor(config = {}) {
    this.config = {
      validateBeforeApply: true,
      rollbackOnError: true,
      batchSize: 50,
      applyTimeout: 5000,
      ...config
    };
    this.logger = new Logger();
  }

  /**
   * Diff 적용 (추상 메서드)
   * @param {DocumentDiff} diff - 적용할 Diff
   * @param {Object} context - 적용 컨텍스트
   * @returns {Promise<SyncResult>} 적용 결과
   */
  async apply(diff, context) {
    throw new Error('BaseApplicator.apply() must be implemented by subclass');
  }

  /**
   * 기본 적용 결과 구조 생성
   * @protected
   * @param {DocumentDiff} diff - 적용할 Diff
   * @returns {SyncResult}
   */
  _createBaseResult(diff) {
    return {
      success: false,
      syncId: this._generateSyncId(),
      timestamp: Date.now(),
      appliedChanges: {
        added: 0,
        modified: 0,
        removed: 0
      },
      skippedChanges: {
        count: 0,
        reasons: []
      },
      errors: [],
      warnings: [],
      timing: {
        extraction: 0,
        calculation: 0,
        application: 0,
        total: 0
      },
      metadata: {
        conflictsResolved: 0,
        optimizationsApplied: []
      }
    };
  }

  /**
   * Diff 검증
   * @protected
   * @param {DocumentDiff} diff - 검증할 Diff
   * @returns {Object} 검증 결과
   */
  _validateDiff(diff) {
    const errors = [];
    const warnings = [];

    if (!diff) {
      errors.push('Diff is null or undefined');
      return { valid: false, errors, warnings };
    }

    // 필수 필드 검증
    const requiredFields = ['id', 'timestamp', 'added', 'modified', 'removed'];
    for (const field of requiredFields) {
      if (!(field in diff)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // 배열 타입 검증
    if (!Array.isArray(diff.added)) {
      errors.push('diff.added must be an array');
    }
    if (!Array.isArray(diff.modified)) {
      errors.push('diff.modified must be an array');
    }
    if (!Array.isArray(diff.removed)) {
      errors.push('diff.removed must be an array');
    }

    // 요소 ID 검증
    if (diff.added) {
      diff.added.forEach((element, index) => {
        if (!element.id) {
          errors.push(`Added element at index ${index} missing id`);
        }
        if (!element.type) {
          warnings.push(`Added element ${element.id} missing type`);
        }
      });
    }

    if (diff.modified) {
      diff.modified.forEach((mod, index) => {
        if (!mod.id) {
          errors.push(`Modified element at index ${index} missing id`);
        }
        if (!mod.changes || !Array.isArray(mod.changes)) {
          errors.push(`Modified element ${mod.id} missing changes array`);
        }
      });
    }

    // 중복 ID 검증
    const allIds = new Set();
    const duplicates = [];

    [...(diff.added || []), ...(diff.modified || [])].forEach(item => {
      const id = item.id || item.element?.id;
      if (id) {
        if (allIds.has(id)) {
          duplicates.push(id);
        } else {
          allIds.add(id);
        }
      }
    });

    if (duplicates.length > 0) {
      warnings.push(`Duplicate IDs found: ${duplicates.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 컨텍스트 검증
   * @protected
   * @param {Object} context - 검증할 컨텍스트
   * @returns {Object} 검증 결과
   */
  _validateContext(context) {
    const errors = [];
    const warnings = [];

    if (!context) {
      errors.push('Context is null or undefined');
      return { valid: false, errors, warnings };
    }

    if (!context.modeler) {
      errors.push('Missing modeler in context');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 배치 처리 계획 생성
   * @protected
   * @param {DocumentDiff} diff - Diff 객체
   * @returns {Array} 배치 목록
   */
  _createBatches(diff) {
    const batches = [];
    const batchSize = this.config.batchSize;

    // 우선순위 순서: 삭제 → 추가 → 수정
    const operations = [
      ...diff.removed.map(id => ({ type: 'remove', id, data: id })),
      ...diff.added.map(element => ({ type: 'add', id: element.id, data: element })),
      ...diff.modified.map(mod => ({ type: 'modify', id: mod.id, data: mod }))
    ];

    // 의존성 정렬
    const sortedOperations = this._sortOperationsByDependency(operations, diff);

    // 배치로 분할
    for (let i = 0; i < sortedOperations.length; i += batchSize) {
      const batch = sortedOperations.slice(i, i + batchSize);
      batches.push({
        id: this._generateBatchId(),
        operations: batch,
        size: batch.length
      });
    }

    return batches;
  }

  /**
   * 연산을 의존성 순서로 정렬
   * @protected
   * @param {Array} operations - 연산 목록
   * @param {DocumentDiff} diff - Diff 객체
   * @returns {Array} 정렬된 연산 목록
   */
  _sortOperationsByDependency(operations, diff) {
    // 의존성 맵 생성
    const dependencyMap = new Map();
    const elementMap = new Map();

    // 요소 맵 구성
    diff.added.forEach(el => elementMap.set(el.id, el));
    diff.modified.forEach(mod => elementMap.set(mod.id, mod.element));

    // 연산별 의존성 분석
    operations.forEach(op => {
      dependencyMap.set(op.id, new Set());
      
      if (op.type === 'add' || op.type === 'modify') {
        const element = op.data.element || op.data;
        
        // 부모 의존성
        if (element.parent && elementMap.has(element.parent)) {
          dependencyMap.get(op.id).add(element.parent);
        }
        
        // 연결 의존성
        if (element.source && elementMap.has(element.source)) {
          dependencyMap.get(op.id).add(element.source);
        }
        if (element.target && elementMap.has(element.target)) {
          dependencyMap.get(op.id).add(element.target);
        }
      }
    });

    // 위상 정렬
    return this._topologicalSort(operations, dependencyMap);
  }

  /**
   * 위상 정렬
   * @private
   * @param {Array} operations - 연산 목록
   * @param {Map} dependencyMap - 의존성 맵
   * @returns {Array} 정렬된 연산 목록
   */
  _topologicalSort(operations, dependencyMap) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (operation) => {
      if (visited.has(operation.id)) return;
      if (visiting.has(operation.id)) {
        // 순환 의존성 - 타입 우선순위로 처리
        return;
      }

      visiting.add(operation.id);

      // 의존성 먼저 방문
      const dependencies = dependencyMap.get(operation.id) || new Set();
      for (const depId of dependencies) {
        const depOp = operations.find(op => op.id === depId);
        if (depOp) {
          visit(depOp);
        }
      }

      visiting.delete(operation.id);
      visited.add(operation.id);
      sorted.push(operation);
    };

    // 타입별 우선순위로 시작
    const prioritizedOps = [...operations].sort((a, b) => {
      const typeOrder = { 'remove': 0, 'add': 1, 'modify': 2 };
      return typeOrder[a.type] - typeOrder[b.type];
    });

    prioritizedOps.forEach(visit);

    return sorted;
  }

  /**
   * 적용 성공 처리
   * @protected
   * @param {SyncResult} result - 결과 객체
   * @param {string} operation - 연산 타입
   * @param {string} elementId - 요소 ID
   */
  _recordSuccess(result, operation, elementId) {
    switch (operation) {
      case 'add':
        result.appliedChanges.added++;
        break;
      case 'modify':
        result.appliedChanges.modified++;
        break;
      case 'remove':
        result.appliedChanges.removed++;
        break;
    }

    this.logger.debug(`Successfully applied ${operation} for element ${elementId}`);
  }

  /**
   * 적용 실패 처리
   * @protected
   * @param {SyncResult} result - 결과 객체
   * @param {string} operation - 연산 타입
   * @param {string} elementId - 요소 ID
   * @param {Error} error - 오류 객체
   */
  _recordFailure(result, operation, elementId, error) {
    const syncError = {
      code: this._getErrorCode(operation, error),
      message: error.message,
      elementId: elementId,
      operation: operation,
      recoverable: this._isRecoverableError(error),
      timestamp: Date.now()
    };

    result.errors.push(syncError);
    
    this.logger.error(`Failed to apply ${operation} for element ${elementId}:`, error);
  }

  /**
   * 적용 건너뛰기 처리
   * @protected
   * @param {SyncResult} result - 결과 객체
   * @param {string} reason - 건너뛴 이유
   * @param {string} elementId - 요소 ID
   */
  _recordSkip(result, reason, elementId) {
    result.skippedChanges.count++;
    if (!result.skippedChanges.reasons.includes(reason)) {
      result.skippedChanges.reasons.push(reason);
    }

    const warning = {
      code: 'CHANGE_SKIPPED',
      message: `Skipped ${elementId}: ${reason}`,
      elementId: elementId,
      suggestion: this._getSkipSuggestion(reason)
    };

    result.warnings.push(warning);
    
    this.logger.warn(`Skipped element ${elementId}: ${reason}`);
  }

  /**
   * 오류 코드 생성
   * @private
   * @param {string} operation - 연산 타입
   * @param {Error} error - 오류 객체
   * @returns {string}
   */
  _getErrorCode(operation, error) {
    const base = {
      'add': 'ADD_FAILED',
      'modify': 'MODIFY_FAILED',
      'remove': 'REMOVE_FAILED'
    };

    if (error.message.includes('not found')) {
      return base[operation] + '_NOT_FOUND';
    }
    if (error.message.includes('validation')) {
      return base[operation] + '_VALIDATION';
    }
    if (error.message.includes('timeout')) {
      return base[operation] + '_TIMEOUT';
    }

    return base[operation];
  }

  /**
   * 복구 가능한 오류 여부 확인
   * @private
   * @param {Error} error - 오류 객체
   * @returns {boolean}
   */
  _isRecoverableError(error) {
    const recoverableMessages = [
      'timeout',
      'network',
      'temporary',
      'retry'
    ];

    return recoverableMessages.some(msg => 
      error.message.toLowerCase().includes(msg)
    );
  }

  /**
   * 건너뛰기 제안 생성
   * @private
   * @param {string} reason - 건너뛴 이유
   * @returns {string}
   */
  _getSkipSuggestion(reason) {
    const suggestions = {
      'invalid_element': 'Check element data structure',
      'dependency_missing': 'Ensure dependencies are applied first',
      'validation_failed': 'Verify element properties',
      'already_exists': 'Check for duplicate elements',
      'permission_denied': 'Verify user permissions'
    };

    return suggestions[reason] || 'Review and retry';
  }

  /**
   * 동기화 ID 생성
   * @private
   * @returns {string}
   */
  _generateSyncId() {
    return 'sync-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 배치 ID 생성
   * @private
   * @returns {string}
   */
  _generateBatchId() {
    return 'batch-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  }

  /**
   * 오류 처리
   * @protected
   * @param {Error} error - 오류 객체
   * @param {string} context - 오류 컨텍스트
   */
  _handleError(error, context = 'application') {
    this.logger.error(`${context} failed:`, error);
    throw new Error(`Diff application failed in ${context}: ${error.message}`);
  }
}