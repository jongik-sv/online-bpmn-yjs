/**
 * 표준 Diff 계산기
 * BPMN 요소의 변경사항을 계산하는 기본 구현
 */

import { BaseDiffCalculator } from './BaseDiffCalculator.js';

export class StandardDiffCalculator extends BaseDiffCalculator {
  constructor(config = {}) {
    super(config);
    this.options = {
      positionTolerance: 0.5,
      enableOptimization: true,
      ignoreMinorChanges: true,
      batchThreshold: 10,
      includeMetadataChanges: true,
      detectMoves: true,
      detectRenames: true,
      ...config.options
    };
  }

  /**
   * Diff 계산 실행
   * @param {DocumentState} oldState - 이전 상태
   * @param {DocumentState} newState - 현재 상태
   * @returns {Promise<DocumentDiff>}
   */
  async calculate(oldState, newState) {
    const startTime = performance.now();

    try {
      // 기본 Diff 구조 생성
      const diff = this._createBaseDiff(oldState, newState);

      // 초기 상태 처리
      if (!oldState) {
        return this._handleInitialState(newState, diff);
      }

      const oldElements = oldState.elements || {};
      const newElements = newState.elements || {};

      // 변경사항 감지
      this._detectAddedElements(oldElements, newElements, diff);
      this._detectModifiedElements(oldElements, newElements, diff);
      this._detectRemovedElements(oldElements, newElements, diff);

      // 메타데이터 변경 감지
      if (this.options.includeMetadataChanges && oldState.metadata && newState.metadata) {
        const metadataChanges = this._detectMetadataChanges(oldState.metadata, newState.metadata);
        if (metadataChanges) {
          diff.metadata = metadataChanges;
          diff.hasChanges = true;
        }
      }

      // 이동 감지 (추가/삭제가 실제로는 이동인 경우)
      if (this.options.detectMoves) {
        this._detectMoves(diff);
      }

      // 통계 업데이트
      this._updateStatistics(diff);

      // 최적화 적용
      if (this.options.enableOptimization) {
        this._optimizeDiff(diff);
      }

      // 성능 정보 추가
      const calculationTime = performance.now() - startTime;
      diff.timing = { calculation: calculationTime };

      this.logger.debug(`Diff calculated in ${calculationTime.toFixed(2)}ms: ${diff.statistics.totalChanges} changes`);
      
      return diff;

    } catch (error) {
      this._handleError(error, 'StandardDiffCalculator.calculate');
    }
  }

  /**
   * 초기 상태 처리
   * @private
   * @param {DocumentState} newState - 새 상태
   * @param {DocumentDiff} diff - Diff 객체
   * @returns {DocumentDiff}
   */
  _handleInitialState(newState, diff) {
    const elements = Object.values(newState.elements || {});
    
    // 의존성 순서로 정렬
    diff.added = this._sortByDependency(elements);
    diff.hasChanges = diff.added.length > 0;
    
    this._updateStatistics(diff);
    
    this.logger.debug(`Initial state: ${diff.added.length} elements`);
    return diff;
  }

  /**
   * 추가된 요소 감지
   * @private
   * @param {Object} oldElements - 이전 요소들
   * @param {Object} newElements - 현재 요소들
   * @param {DocumentDiff} diff - Diff 객체
   */
  _detectAddedElements(oldElements, newElements, diff) {
    const addedElements = [];

    for (const [id, element] of Object.entries(newElements)) {
      if (!oldElements[id]) {
        addedElements.push(element);
        diff.hasChanges = true;
      }
    }

    // 의존성 순서로 정렬
    diff.added = this._sortByDependency(addedElements);
  }

  /**
   * 수정된 요소 감지
   * @private
   * @param {Object} oldElements - 이전 요소들
   * @param {Object} newElements - 현재 요소들
   * @param {DocumentDiff} diff - Diff 객체
   */
  _detectModifiedElements(oldElements, newElements, diff) {
    for (const [id, newElement] of Object.entries(newElements)) {
      const oldElement = oldElements[id];
      
      if (!oldElement) continue;

      const changes = this._calculateElementChanges(oldElement, newElement);
      
      if (changes.length > 0) {
        // 미세 변경 무시 옵션 확인
        if (this.options.ignoreMinorChanges && this._isMinorChange(changes)) {
          continue;
        }

        diff.modified.push({
          id: id,
          element: newElement,
          changes: changes,
          changeTypes: this._extractChangeTypes(changes)
        });
        diff.hasChanges = true;
      }
    }
  }

  /**
   * 삭제된 요소 감지
   * @private
   * @param {Object} oldElements - 이전 요소들
   * @param {Object} newElements - 현재 요소들
   * @param {DocumentDiff} diff - Diff 객체
   */
  _detectRemovedElements(oldElements, newElements, diff) {
    for (const id of Object.keys(oldElements)) {
      if (!newElements[id]) {
        diff.removed.push(id);
        diff.hasChanges = true;
      }
    }
  }

  /**
   * 요소 변경사항 계산
   * @private
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Array} 변경사항 목록
   */
  _calculateElementChanges(oldElement, newElement) {
    const changes = [];

    // 위치 변경
    const positionChange = this._detectPositionChange(oldElement, newElement);
    if (positionChange) {
      changes.push(positionChange);
    }

    // 크기 변경
    const sizeChange = this._detectSizeChange(oldElement, newElement);
    if (sizeChange) {
      changes.push(sizeChange);
    }

    // Waypoints 변경
    const waypointsChange = this._detectWaypointsChange(oldElement, newElement);
    if (waypointsChange) {
      changes.push(waypointsChange);
    }

    // 비즈니스 객체 변경
    const businessObjectChange = this._detectBusinessObjectChange(oldElement, newElement);
    if (businessObjectChange) {
      changes.push(businessObjectChange);
    }

    // 연결 관계 변경
    const connectionChange = this._detectConnectionChange(oldElement, newElement);
    if (connectionChange) {
      changes.push(connectionChange);
    }

    // 부모 관계 변경
    const parentChange = this._detectParentChange(oldElement, newElement);
    if (parentChange) {
      changes.push(parentChange);
    }

    // 커스텀 속성 변경
    const customChange = this._detectCustomPropertiesChange(oldElement, newElement);
    if (customChange) {
      changes.push(customChange);
    }

    return changes;
  }

  /**
   * 부모 관계 변경 감지
   * @private
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Object|null}
   */
  _detectParentChange(oldElement, newElement) {
    const oldParent = oldElement.parent;
    const newParent = newElement.parent;

    if (oldParent !== newParent) {
      return {
        type: 'parent',
        old: oldParent,
        new: newParent,
        isReparenting: true
      };
    }

    return null;
  }

  /**
   * 커스텀 속성 변경 감지
   * @private
   * @param {Object} oldElement - 이전 요소
   * @param {Object} newElement - 현재 요소
   * @returns {Object|null}
   */
  _detectCustomPropertiesChange(oldElement, newElement) {
    const oldCustom = oldElement.customProperties || {};
    const newCustom = newElement.customProperties || {};

    if (!this._areObjectsEqual(oldCustom, newCustom)) {
      return {
        type: 'customProperties',
        old: oldCustom,
        new: newCustom,
        changedProperties: this._getChangedProperties(oldCustom, newCustom)
      };
    }

    return null;
  }

  /**
   * 메타데이터 변경 감지
   * @private
   * @param {Object} oldMetadata - 이전 메타데이터
   * @param {Object} newMetadata - 현재 메타데이터
   * @returns {Object|null}
   */
  _detectMetadataChanges(oldMetadata, newMetadata) {
    const changes = {};
    let hasChanges = false;

    // 뷰포트 변경
    if (!this._areObjectsEqual(oldMetadata.canvasViewbox, newMetadata.canvasViewbox)) {
      changes.viewport = {
        old: oldMetadata.canvasViewbox,
        new: newMetadata.canvasViewbox
      };
      hasChanges = true;
    }

    // 줌 변경
    if (Math.abs((oldMetadata.zoom || 1) - (newMetadata.zoom || 1)) > 0.01) {
      changes.zoom = {
        old: oldMetadata.zoom,
        new: newMetadata.zoom
      };
      hasChanges = true;
    }

    // 스크롤 변경
    if (!this._areObjectsEqual(oldMetadata.scroll, newMetadata.scroll)) {
      changes.scroll = {
        old: oldMetadata.scroll,
        new: newMetadata.scroll
      };
      hasChanges = true;
    }

    return hasChanges ? changes : null;
  }

  /**
   * 이동 감지 (추가/삭제 쌍을 이동으로 변환)
   * @private
   * @param {DocumentDiff} diff - Diff 객체
   */
  _detectMoves(diff) {
    const moves = [];
    const addedByType = new Map();
    const removedByType = new Map();

    // 타입별로 그룹화
    diff.added.forEach((element, index) => {
      const key = this._getMoveKey(element);
      if (!addedByType.has(key)) {
        addedByType.set(key, []);
      }
      addedByType.get(key).push({ element, index });
    });

    diff.removed.forEach((elementId, index) => {
      // 삭제된 요소의 타입을 알 수 없으므로 모든 추가된 요소와 비교
      // 실제 구현에서는 이전 상태에서 타입 정보를 가져와야 함
    });

    // 이동 후 diff에서 해당 항목 제거
    if (moves.length > 0) {
      diff.moves = moves;
      // 이동으로 감지된 항목들을 added/removed에서 제거
      // 실제 구현 필요
    }
  }

  /**
   * 이동 감지를 위한 키 생성
   * @private
   * @param {Object} element - 요소
   * @returns {string}
   */
  _getMoveKey(element) {
    // 타입과 비즈니스 객체 이름을 기반으로 키 생성
    const name = element.businessObject?.name || '';
    return `${element.type}:${name}`;
  }

  /**
   * 변경 타입 추출
   * @private
   * @param {Array} changes - 변경사항 목록
   * @returns {Array} 변경 타입 목록
   */
  _extractChangeTypes(changes) {
    return changes.map(change => change.type);
  }

  /**
   * Diff 최적화
   * @private
   * @param {DocumentDiff} diff - Diff 객체
   */
  _optimizeDiff(diff) {
    // 중복 제거
    diff.added = this._removeDuplicateElements(diff.added);
    diff.modified = this._removeDuplicateModifications(diff.modified);
    diff.removed = [...new Set(diff.removed)];

    // 대량 변경사항 경고
    if (diff.statistics.totalChanges > this.options.batchThreshold) {
      this.logger.warn(`Large diff detected: ${diff.statistics.totalChanges} changes`);
      
      // 배치 처리 힌트 추가
      diff.batchHints = {
        recommended: true,
        batchSize: Math.ceil(diff.statistics.totalChanges / 5),
        priority: this._calculateChangePriority(diff)
      };
    }

    // 성능 최적화를 위한 인덱스 생성
    if (diff.statistics.totalChanges > 50) {
      diff.indices = {
        addedById: new Map(diff.added.map(el => [el.id, el])),
        modifiedById: new Map(diff.modified.map(mod => [mod.id, mod])),
        removedSet: new Set(diff.removed)
      };
    }
  }

  /**
   * 중복 요소 제거
   * @private
   * @param {Array} elements - 요소 목록
   * @returns {Array}
   */
  _removeDuplicateElements(elements) {
    const seen = new Set();
    return elements.filter(element => {
      if (seen.has(element.id)) {
        this.logger.warn(`Duplicate element found: ${element.id}`);
        return false;
      }
      seen.add(element.id);
      return true;
    });
  }

  /**
   * 중복 수정사항 제거
   * @private
   * @param {Array} modifications - 수정사항 목록
   * @returns {Array}
   */
  _removeDuplicateModifications(modifications) {
    const seen = new Set();
    return modifications.filter(mod => {
      if (seen.has(mod.id)) {
        this.logger.warn(`Duplicate modification found: ${mod.id}`);
        return false;
      }
      seen.add(mod.id);
      return true;
    });
  }

  /**
   * 변경 우선순위 계산
   * @private
   * @param {DocumentDiff} diff - Diff 객체
   * @returns {Array} 우선순위 배열
   */
  _calculateChangePriority(diff) {
    const priority = [];

    // 1. 구조적 변경 (추가/삭제)
    if (diff.added.length > 0 || diff.removed.length > 0) {
      priority.push('structural');
    }

    // 2. 연결 관계 변경
    const hasConnectionChanges = diff.modified.some(mod => 
      mod.changeTypes.includes('connection')
    );
    if (hasConnectionChanges) {
      priority.push('connections');
    }

    // 3. 속성 변경
    const hasPropertyChanges = diff.modified.some(mod => 
      mod.changeTypes.includes('businessObject')
    );
    if (hasPropertyChanges) {
      priority.push('properties');
    }

    // 4. 위치/크기 변경
    const hasVisualChanges = diff.modified.some(mod => 
      mod.changeTypes.includes('position') || mod.changeTypes.includes('size')
    );
    if (hasVisualChanges) {
      priority.push('visual');
    }

    return priority;
  }

  /**
   * 상세 변경 분석
   * @param {DocumentDiff} diff - Diff 객체
   * @returns {Object} 분석 결과
   */
  analyzeChanges(diff) {
    const analysis = {
      complexity: 'low',
      categories: {
        structural: 0,
        visual: 0,
        semantic: 0,
        metadata: 0
      },
      impacts: [],
      recommendations: []
    };

    // 복잡성 계산
    const totalChanges = diff.statistics.totalChanges;
    if (totalChanges > 50) {
      analysis.complexity = 'high';
    } else if (totalChanges > 20) {
      analysis.complexity = 'medium';
    }

    // 카테고리별 분류
    analysis.categories.structural = diff.added.length + diff.removed.length;
    
    diff.modified.forEach(mod => {
      mod.changeTypes.forEach(type => {
        switch (type) {
          case 'position':
          case 'size':
          case 'waypoints':
            analysis.categories.visual++;
            break;
          case 'businessObject':
          case 'connection':
          case 'parent':
            analysis.categories.semantic++;
            break;
        }
      });
    });

    if (diff.metadata) {
      analysis.categories.metadata = 1;
    }

    // 영향도 분석
    if (analysis.categories.structural > 0) {
      analysis.impacts.push('workflow_structure');
    }
    if (analysis.categories.semantic > 0) {
      analysis.impacts.push('business_logic');
    }
    if (analysis.categories.visual > 10) {
      analysis.impacts.push('visual_layout');
    }

    // 권장사항
    if (analysis.complexity === 'high') {
      analysis.recommendations.push('batch_processing');
    }
    if (analysis.categories.structural > 10) {
      analysis.recommendations.push('structure_validation');
    }

    return analysis;
  }
}