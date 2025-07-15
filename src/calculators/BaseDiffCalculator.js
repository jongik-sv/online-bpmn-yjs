/**
 * 기본 Diff 계산기
 * 모든 Diff 계산기의 베이스 클래스
 */

import { Logger } from '../utils/Logger.js';

export class BaseDiffCalculator {
  constructor(config = {}) {
    this.config = {
      positionTolerance: 0.5,
      enableOptimization: true,
      ignoreMinorChanges: false,
      ...config
    };
    this.logger = new Logger();
  }

  /**
   * Diff 계산 (추상 메서드)
   * @param {DocumentState} oldState - 이전 상태
   * @param {DocumentState} newState - 현재 상태
   * @returns {Promise<DocumentDiff>} 계산된 Diff
   */
  async calculate(oldState, newState) {
    throw new Error('BaseDiffCalculator.calculate() must be implemented by subclass');
  }

  /**
   * 기본 Diff 구조 생성
   * @protected
   * @param {DocumentState} oldState - 이전 상태
   * @param {DocumentState} newState - 현재 상태
   * @returns {DocumentDiff}
   */
  _createBaseDiff(oldState, newState) {
    return {
      id: this._generateDiffId(),
      timestamp: Date.now(),
      clientId: newState.clientId || 'unknown',
      fromVersion: oldState?.version || '0.0.0',
      toVersion: newState.version,
      added: [],
      modified: [],
      removed: [],
      hasChanges: false,
      statistics: {
        addedCount: 0,
        modifiedCount: 0,
        removedCount: 0,
        totalChanges: 0,
        changesByType: {}
      }
    };
  }

  /**
   * 두 객체가 같은지 비교
   * @protected
   * @param {any} obj1 - 첫 번째 객체
   * @param {any} obj2 - 두 번째 객체
   * @param {number} tolerance - 숫자 비교 시 허용 오차
   * @returns {boolean}
   */
  _areEqual(obj1, obj2, tolerance = 0) {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return obj1 === obj2;
    
    if (typeof obj1 === 'number' && typeof obj2 === 'number') {
      return Math.abs(obj1 - obj2) <= tolerance;
    }
    
    if (typeof obj1 !== typeof obj2) return false;
    
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      return this._areArraysEqual(obj1, obj2, tolerance);
    }
    
    if (typeof obj1 === 'object') {
      return this._areObjectsEqual(obj1, obj2, tolerance);
    }
    
    return obj1 === obj2;
  }

  /**
   * 두 배열이 같은지 비교
   * @private
   * @param {Array} arr1 - 첫 번째 배열
   * @param {Array} arr2 - 두 번째 배열
   * @param {number} tolerance - 허용 오차
   * @returns {boolean}
   */
  _areArraysEqual(arr1, arr2, tolerance) {
    if (arr1.length !== arr2.length) return false;
    
    for (let i = 0; i < arr1.length; i++) {
      if (!this._areEqual(arr1[i], arr2[i], tolerance)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 두 객체가 같은지 비교
   * @private
   * @param {Object} obj1 - 첫 번째 객체
   * @param {Object} obj2 - 두 번째 객체
   * @param {number} tolerance - 허용 오차
   * @returns {boolean}
   */
  _areObjectsEqual(obj1, obj2, tolerance) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this._areEqual(obj1[key], obj2[key], tolerance)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 위치 변경 감지
   * @protected
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Object|null} 위치 변경 정보
   */
  _detectPositionChange(oldElement, newElement) {
    const tolerance = this.config.positionTolerance;
    const oldX = oldElement.x || 0;
    const oldY = oldElement.y || 0;
    const newX = newElement.x || 0;
    const newY = newElement.y || 0;

    if (Math.abs(oldX - newX) > tolerance || Math.abs(oldY - newY) > tolerance) {
      return {
        type: 'position',
        old: { x: oldX, y: oldY },
        new: { x: newX, y: newY },
        delta: { x: newX - oldX, y: newY - oldY }
      };
    }

    return null;
  }

  /**
   * 크기 변경 감지
   * @protected
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Object|null} 크기 변경 정보
   */
  _detectSizeChange(oldElement, newElement) {
    const oldWidth = oldElement.width || 0;
    const oldHeight = oldElement.height || 0;
    const newWidth = newElement.width || 0;
    const newHeight = newElement.height || 0;

    if (oldWidth !== newWidth || oldHeight !== newHeight) {
      return {
        type: 'size',
        old: { width: oldWidth, height: oldHeight },
        new: { width: newWidth, height: newHeight },
        delta: { width: newWidth - oldWidth, height: newHeight - oldHeight }
      };
    }

    return null;
  }

  /**
   * Waypoints 변경 감지
   * @protected
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Object|null} Waypoints 변경 정보
   */
  _detectWaypointsChange(oldElement, newElement) {
    const oldWaypoints = oldElement.waypoints || [];
    const newWaypoints = newElement.waypoints || [];

    if (!this._areArraysEqual(oldWaypoints, newWaypoints, this.config.positionTolerance)) {
      return {
        type: 'waypoints',
        old: oldWaypoints,
        new: newWaypoints,
        pointsAdded: Math.max(0, newWaypoints.length - oldWaypoints.length),
        pointsRemoved: Math.max(0, oldWaypoints.length - newWaypoints.length)
      };
    }

    return null;
  }

  /**
   * 비즈니스 객체 변경 감지
   * @protected
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Object|null} 비즈니스 객체 변경 정보
   */
  _detectBusinessObjectChange(oldElement, newElement) {
    const oldBO = oldElement.businessObject || {};
    const newBO = newElement.businessObject || {};

    if (!this._areObjectsEqual(oldBO, newBO)) {
      return {
        type: 'businessObject',
        old: oldBO,
        new: newBO,
        changedProperties: this._getChangedProperties(oldBO, newBO)
      };
    }

    return null;
  }

  /**
   * 연결 관계 변경 감지
   * @protected
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Object|null} 연결 관계 변경 정보
   */
  _detectConnectionChange(oldElement, newElement) {
    const oldSource = oldElement.source;
    const oldTarget = oldElement.target;
    const newSource = newElement.source;
    const newTarget = newElement.target;

    if (oldSource !== newSource || oldTarget !== newTarget) {
      return {
        type: 'connection',
        old: { source: oldSource, target: oldTarget },
        new: { source: newSource, target: newTarget },
        sourceChanged: oldSource !== newSource,
        targetChanged: oldTarget !== newTarget
      };
    }

    return null;
  }

  /**
   * 변경된 속성 찾기
   * @private
   * @param {Object} oldObj - 이전 객체
   * @param {Object} newObj - 현재 객체
   * @returns {Array} 변경된 속성 목록
   */
  _getChangedProperties(oldObj, newObj) {
    const changed = [];
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const oldVal = oldObj[key];
      const newVal = newObj[key];

      if (!this._areEqual(oldVal, newVal)) {
        changed.push({
          property: key,
          oldValue: oldVal,
          newValue: newVal
        });
      }
    }

    return changed;
  }

  /**
   * 요소들을 의존성 순서로 정렬
   * @protected
   * @param {Array} elements - 정렬할 요소들
   * @returns {Array} 정렬된 요소들
   */
  _sortByDependency(elements) {
    // 의존성 그래프 생성
    const dependencyMap = new Map();
    const elementMap = new Map();

    // 요소 맵 생성
    elements.forEach(el => {
      elementMap.set(el.id, el);
      dependencyMap.set(el.id, new Set());
    });

    // 의존성 관계 분석
    elements.forEach(el => {
      // 부모 의존성
      if (el.parent && elementMap.has(el.parent)) {
        dependencyMap.get(el.id).add(el.parent);
      }

      // 연결 의존성 (연결선은 소스/타겟 이후)
      if (this._isConnectionType(el.type)) {
        if (el.source && elementMap.has(el.source)) {
          dependencyMap.get(el.id).add(el.source);
        }
        if (el.target && elementMap.has(el.target)) {
          dependencyMap.get(el.id).add(el.target);
        }
      }
    });

    // 위상 정렬
    return this._topologicalSort(elements, dependencyMap);
  }

  /**
   * 위상 정렬
   * @private
   * @param {Array} elements - 요소들
   * @param {Map} dependencyMap - 의존성 맵
   * @returns {Array} 정렬된 요소들
   */
  _topologicalSort(elements, dependencyMap) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (element) => {
      if (visited.has(element.id)) return;
      if (visiting.has(element.id)) {
        // 순환 의존성 감지 - 타입 순서로 처리
        return;
      }

      visiting.add(element.id);

      // 의존성 먼저 방문
      const dependencies = dependencyMap.get(element.id) || new Set();
      for (const depId of dependencies) {
        const depElement = elements.find(el => el.id === depId);
        if (depElement) {
          visit(depElement);
        }
      }

      visiting.delete(element.id);
      visited.add(element.id);
      sorted.push(element);
    };

    // 타입별 우선순위로 시작점 결정
    const prioritizedElements = [...elements].sort((a, b) => {
      const aIsConnection = this._isConnectionType(a.type);
      const bIsConnection = this._isConnectionType(b.type);

      if (!aIsConnection && bIsConnection) return -1;
      if (aIsConnection && !bIsConnection) return 1;
      return 0;
    });

    prioritizedElements.forEach(visit);

    return sorted;
  }

  /**
   * 연결 타입 여부 확인
   * @protected
   * @param {string} type - 요소 타입
   * @returns {boolean}
   */
  _isConnectionType(type) {
    const connectionTypes = [
      'bpmn:SequenceFlow',
      'bpmn:MessageFlow',
      'bpmn:Association',
      'bpmn:DataInputAssociation',
      'bpmn:DataOutputAssociation'
    ];
    return connectionTypes.includes(type);
  }

  /**
   * 미세 변경 여부 확인
   * @protected
   * @param {Array} changes - 변경 목록
   * @returns {boolean}
   */
  _isMinorChange(changes) {
    if (!this.config.ignoreMinorChanges) {
      return false;
    }

    // 위치 변경만 있는 경우
    if (changes.length === 1 && changes[0].type === 'position') {
      const posChange = changes[0];
      const deltaX = Math.abs(posChange.delta.x);
      const deltaY = Math.abs(posChange.delta.y);
      
      // 허용 오차 이내의 위치 변경
      return deltaX <= this.config.positionTolerance && 
             deltaY <= this.config.positionTolerance;
    }

    return false;
  }

  /**
   * Diff 통계 업데이트
   * @protected
   * @param {DocumentDiff} diff - Diff 객체
   */
  _updateStatistics(diff) {
    diff.statistics.addedCount = diff.added.length;
    diff.statistics.modifiedCount = diff.modified.length;
    diff.statistics.removedCount = diff.removed.length;
    diff.statistics.totalChanges = diff.added.length + diff.modified.length + diff.removed.length;

    // 타입별 통계
    const typeCount = {};
    
    diff.added.forEach(el => {
      typeCount[el.type] = (typeCount[el.type] || 0) + 1;
    });
    
    diff.modified.forEach(mod => {
      const type = mod.element.type;
      typeCount[type] = (typeCount[type] || 0) + 1;
    });

    diff.statistics.changesByType = typeCount;
  }

  /**
   * Diff ID 생성
   * @private
   * @returns {string}
   */
  _generateDiffId() {
    return 'diff-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 오류 처리
   * @protected
   * @param {Error} error - 오류 객체
   * @param {string} context - 오류 컨텍스트
   */
  _handleError(error, context = 'calculation') {
    this.logger.error(`${context} failed:`, error);
    throw new Error(`Diff calculation failed in ${context}: ${error.message}`);
  }
}