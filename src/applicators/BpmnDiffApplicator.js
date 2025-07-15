/**
 * BPMN Diff 적용기
 * BPMN.js 모델러에 Diff를 적용하는 구현
 */

import { BaseApplicator } from './BaseApplicator.js';

export class BpmnDiffApplicator extends BaseApplicator {
  constructor(config = {}) {
    super(config);
    this.options = {
      validateBeforeApply: true,
      rollbackOnError: true,
      batchSize: 50,
      applyTimeout: 5000,
      skipInvalidElements: true,
      preserveSelection: false,
      updateConnections: true,
      ...config.options
    };
  }

  /**
   * BPMN Diff 적용
   * @param {DocumentDiff} diff - 적용할 Diff
   * @param {Object} context - 적용 컨텍스트 { modeler, clientId }
   * @returns {Promise<SyncResult>}
   */
  async apply(diff, context) {
    const startTime = performance.now();
    const result = this._createBaseResult(diff);

    try {
      // 입력 검증
      const diffValidation = this._validateDiff(diff);
      if (!diffValidation.valid) {
        result.errors.push(...diffValidation.errors.map(msg => ({
          code: 'VALIDATION_ERROR',
          message: msg,
          recoverable: false
        })));
        return result;
      }

      const contextValidation = this._validateContext(context);
      if (!contextValidation.valid) {
        result.errors.push(...contextValidation.errors.map(msg => ({
          code: 'CONTEXT_ERROR',
          message: msg,
          recoverable: false
        })));
        return result;
      }

      // BPMN 서비스 가져오기
      const services = this._getBpmnServices(context.modeler);
      if (!services.modeling || !services.elementRegistry) {
        result.errors.push({
          code: 'SERVICES_ERROR',
          message: 'Required BPMN services not available',
          recoverable: false
        });
        return result;
      }

      // 배치 처리 계획 생성
      const batches = this._createBatches(diff);
      
      // 상태 백업 (롤백용)
      const backup = this.options.rollbackOnError ? 
        this._createBackup(services) : null;

      let hasErrors = false;

      try {
        // 배치별 적용
        for (const batch of batches) {
          const batchResult = await this._applyBatch(batch, services, context);
          
          // 결과 병합
          this._mergeBatchResult(result, batchResult);
          
          if (batchResult.errors.length > 0) {
            hasErrors = true;
            if (!this.options.rollbackOnError) {
              // 부분 실패 허용
              continue;
            } else {
              // 즉시 중단하고 롤백
              break;
            }
          }
        }

        // 롤백 처리
        if (hasErrors && this.options.rollbackOnError && backup) {
          await this._rollback(backup, services);
          result.metadata.rolledBack = true;
          this.logger.warn('Changes rolled back due to errors');
        }

        // 연결 업데이트
        if (!hasErrors && this.options.updateConnections) {
          await this._updateConnections(services, diff);
        }

        // 성공 여부 결정
        result.success = !hasErrors || !this.options.rollbackOnError;

      } catch (error) {
        // 예상치 못한 오류 발생
        if (this.options.rollbackOnError && backup) {
          await this._rollback(backup, services);
          result.metadata.rolledBack = true;
        }
        throw error;
      }

      // 타이밍 정보 업데이트
      result.timing.application = performance.now() - startTime;
      result.timing.total = result.timing.application;

      this.logger.info(`Diff applied: ${result.appliedChanges.added}/${result.appliedChanges.modified}/${result.appliedChanges.removed} (A/M/R), ${result.errors.length} errors`);

      return result;

    } catch (error) {
      this._handleError(error, 'BpmnDiffApplicator.apply');
    }
  }

  /**
   * BPMN 서비스 가져오기
   * @private
   * @param {Object} modeler - BPMN 모델러
   * @returns {Object} BPMN 서비스
   */
  _getBpmnServices(modeler) {
    try {
      return {
        modeling: modeler.get('modeling'),
        elementRegistry: modeler.get('elementRegistry'),
        elementFactory: modeler.get('elementFactory'),
        canvas: modeler.get('canvas'),
        rules: modeler.get('rules'),
        commandStack: modeler.get('commandStack')
      };
    } catch (error) {
      this.logger.error('Failed to get BPMN services:', error);
      return {};
    }
  }

  /**
   * 배치 적용
   * @private
   * @param {Object} batch - 배치
   * @param {Object} services - BPMN 서비스
   * @param {Object} context - 컨텍스트
   * @returns {Promise<Object>} 배치 결과
   */
  async _applyBatch(batch, services, context) {
    const batchResult = {
      appliedChanges: { added: 0, modified: 0, removed: 0 },
      errors: [],
      warnings: []
    };

    for (const operation of batch.operations) {
      try {
        switch (operation.type) {
          case 'add':
            await this._applyAddition(operation.data, services, batchResult);
            break;
          case 'modify':
            await this._applyModification(operation.data, services, batchResult);
            break;
          case 'remove':
            await this._applyRemoval(operation.data, services, batchResult);
            break;
        }
      } catch (error) {
        this._recordFailure(batchResult, operation.type, operation.id, error);
      }
    }

    return batchResult;
  }

  /**
   * 요소 추가 적용
   * @private
   * @param {Object} element - 추가할 요소
   * @param {Object} services - BPMN 서비스
   * @param {Object} result - 결과 객체
   */
  async _applyAddition(element, services, result) {
    const { modeling, elementFactory, canvas, elementRegistry } = services;

    // 이미 존재하는지 확인
    if (elementRegistry.get(element.id)) {
      this._recordSkip(result, 'already_exists', element.id);
      return;
    }

    // 부모 요소 확인
    let parent = canvas.getRootElement();
    if (element.parent) {
      const parentElement = elementRegistry.get(element.parent);
      if (parentElement) {
        parent = parentElement;
      } else {
        this._recordSkip(result, 'parent_not_found', element.id);
        return;
      }
    }

    try {
      let createdElement;

      if (this._isConnectionElement(element)) {
        // 연결선 생성
        createdElement = await this._createConnection(element, services);
      } else {
        // 도형 생성
        createdElement = await this._createShape(element, services, parent);
      }

      if (createdElement) {
        this._recordSuccess(result, 'add', element.id);
        
        // 추가 속성 설정
        await this._applyElementProperties(createdElement, element, services);
      }

    } catch (error) {
      throw new Error(`Failed to add element ${element.id}: ${error.message}`);
    }
  }

  /**
   * 도형 생성
   * @private
   * @param {Object} element - 요소 데이터
   * @param {Object} services - BPMN 서비스
   * @param {Object} parent - 부모 요소
   * @returns {Object} 생성된 요소
   */
  async _createShape(element, services, parent) {
    const { modeling, elementFactory } = services;

    // 비즈니스 객체 생성
    const businessObject = this._createBusinessObject(element, services);

    // 요소 팩토리로 도형 생성
    const shape = elementFactory.createShape({
      type: element.type,
      businessObject,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height
    });

    // 모델링 서비스로 도형 추가
    const createdShape = modeling.createShape(
      shape,
      { x: element.x, y: element.y },
      parent
    );

    return createdShape;
  }

  /**
   * 연결선 생성
   * @private
   * @param {Object} element - 연결선 데이터
   * @param {Object} services - BPMN 서비스
   * @returns {Object} 생성된 연결선
   */
  async _createConnection(element, services) {
    const { modeling, elementFactory, elementRegistry } = services;

    // 소스와 타겟 요소 찾기
    const source = elementRegistry.get(element.source);
    const target = elementRegistry.get(element.target);

    if (!source || !target) {
      throw new Error(`Source (${element.source}) or target (${element.target}) not found`);
    }

    // 비즈니스 객체 생성
    const businessObject = this._createBusinessObject(element, services);

    // 연결선 팩토리로 생성
    const connection = elementFactory.createConnection({
      type: element.type,
      businessObject,
      source,
      target,
      waypoints: element.waypoints || []
    });

    // 모델링 서비스로 연결선 추가
    const createdConnection = modeling.createConnection(
      source,
      target,
      connection,
      source.parent
    );

    // Waypoints 업데이트
    if (element.waypoints && element.waypoints.length > 0) {
      modeling.updateWaypoints(createdConnection, element.waypoints);
    }

    return createdConnection;
  }

  /**
   * 비즈니스 객체 생성
   * @private
   * @param {Object} element - 요소 데이터
   * @param {Object} services - BPMN 서비스
   * @returns {Object} 비즈니스 객체
   */
  _createBusinessObject(element, services) {
    const moddle = services.modeling._moddle;
    
    const businessObject = moddle.create(element.type, {
      id: element.id,
      ...(element.businessObject || {})
    });

    return businessObject;
  }

  /**
   * 요소 수정 적용
   * @private
   * @param {Object} modification - 수정 데이터
   * @param {Object} services - BPMN 서비스
   * @param {Object} result - 결과 객체
   */
  async _applyModification(modification, services, result) {
    const { modeling, elementRegistry } = services;
    
    const element = elementRegistry.get(modification.id);
    if (!element) {
      this._recordSkip(result, 'element_not_found', modification.id);
      return;
    }

    try {
      for (const change of modification.changes) {
        await this._applyElementChange(element, change, services);
      }

      this._recordSuccess(result, 'modify', modification.id);

    } catch (error) {
      throw new Error(`Failed to modify element ${modification.id}: ${error.message}`);
    }
  }

  /**
   * 요소 변경사항 적용
   * @private
   * @param {Object} element - 대상 요소
   * @param {Object} change - 변경사항
   * @param {Object} services - BPMN 서비스
   */
  async _applyElementChange(element, change, services) {
    const { modeling } = services;

    switch (change.type) {
      case 'position':
        modeling.moveElements([element], {
          x: change.new.x - change.old.x,
          y: change.new.y - change.old.y
        });
        break;

      case 'size':
        modeling.resizeShape(element, {
          x: element.x,
          y: element.y,
          width: change.new.width,
          height: change.new.height
        });
        break;

      case 'waypoints':
        if (element.waypoints) {
          modeling.updateWaypoints(element, change.new);
        }
        break;

      case 'businessObject':
        await this._updateBusinessObject(element, change, services);
        break;

      case 'connection':
        await this._updateConnection(element, change, services);
        break;

      case 'parent':
        await this._updateParent(element, change, services);
        break;

      case 'customProperties':
        await this._updateCustomProperties(element, change, services);
        break;

      default:
        this.logger.warn(`Unknown change type: ${change.type}`);
    }
  }

  /**
   * 비즈니스 객체 업데이트
   * @private
   */
  async _updateBusinessObject(element, change, services) {
    const { modeling } = services;

    // 변경된 속성들 적용
    const updates = {};
    change.changedProperties.forEach(prop => {
      updates[prop.property] = prop.newValue;
    });

    modeling.updateProperties(element, updates);
  }

  /**
   * 연결 관계 업데이트
   * @private
   */
  async _updateConnection(element, change, services) {
    const { modeling, elementRegistry } = services;

    if (change.sourceChanged) {
      const newSource = elementRegistry.get(change.new.source);
      if (newSource) {
        modeling.reconnectStart(element, newSource, element.waypoints);
      }
    }

    if (change.targetChanged) {
      const newTarget = elementRegistry.get(change.new.target);
      if (newTarget) {
        modeling.reconnectEnd(element, newTarget, element.waypoints);
      }
    }
  }

  /**
   * 부모 관계 업데이트
   * @private
   */
  async _updateParent(element, change, services) {
    const { modeling, elementRegistry } = services;

    const newParent = elementRegistry.get(change.new);
    if (newParent) {
      modeling.moveElements([element], { x: 0, y: 0 }, newParent);
    }
  }

  /**
   * 커스텀 속성 업데이트
   * @private
   */
  async _updateCustomProperties(element, change, services) {
    // 커스텀 속성 업데이트 로직
    change.changedProperties.forEach(prop => {
      element[prop.property] = prop.newValue;
    });
  }

  /**
   * 요소 삭제 적용
   * @private
   * @param {string} elementId - 삭제할 요소 ID
   * @param {Object} services - BPMN 서비스
   * @param {Object} result - 결과 객체
   */
  async _applyRemoval(elementId, services, result) {
    const { modeling, elementRegistry } = services;
    
    const element = elementRegistry.get(elementId);
    if (!element) {
      this._recordSkip(result, 'element_not_found', elementId);
      return;
    }

    try {
      // 연결된 요소들 확인
      const connections = this._getElementConnections(element, services);
      
      // 요소 삭제 (연결선도 자동으로 삭제됨)
      modeling.removeElements([element]);
      
      this._recordSuccess(result, 'remove', elementId);

    } catch (error) {
      throw new Error(`Failed to remove element ${elementId}: ${error.message}`);
    }
  }

  /**
   * 요소 속성 적용
   * @private
   */
  async _applyElementProperties(element, elementData, services) {
    const { modeling } = services;

    // 비즈니스 객체 속성 설정
    if (elementData.businessObject) {
      const updates = { ...elementData.businessObject };
      delete updates.id; // ID는 변경하지 않음
      modeling.updateProperties(element, updates);
    }

    // 커스텀 속성 설정
    if (elementData.customProperties) {
      Object.assign(element, elementData.customProperties);
    }
  }

  /**
   * 연결 업데이트
   * @private
   */
  async _updateConnections(services, diff) {
    const { elementRegistry } = services;

    // 새로 추가된 연결선들의 waypoints 재계산
    for (const element of diff.added) {
      if (this._isConnectionElement(element)) {
        const connection = elementRegistry.get(element.id);
        if (connection && !element.waypoints) {
          // 자동 라우팅으로 waypoints 생성
          this._autoRouteConnection(connection, services);
        }
      }
    }
  }

  /**
   * 자동 연결선 라우팅
   * @private
   */
  _autoRouteConnection(connection, services) {
    const { modeling } = services;
    
    try {
      // BPMN.js의 자동 라우팅 기능 사용
      const waypoints = this._calculateWaypoints(connection);
      if (waypoints && waypoints.length >= 2) {
        modeling.updateWaypoints(connection, waypoints);
      }
    } catch (error) {
      this.logger.warn(`Failed to auto-route connection ${connection.id}:`, error);
    }
  }

  /**
   * Waypoints 계산
   * @private
   */
  _calculateWaypoints(connection) {
    const source = connection.source;
    const target = connection.target;

    if (!source || !target) return null;

    // 간단한 직선 연결
    const sourceCenter = {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2
    };

    const targetCenter = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2
    };

    return [sourceCenter, targetCenter];
  }

  /**
   * 요소 연결선 가져오기
   * @private
   */
  _getElementConnections(element, services) {
    const { elementRegistry } = services;
    const connections = [];

    // 들어오는 연결선
    if (element.incoming) {
      element.incoming.forEach(conn => {
        const connection = elementRegistry.get(conn.id);
        if (connection) connections.push(connection);
      });
    }

    // 나가는 연결선
    if (element.outgoing) {
      element.outgoing.forEach(conn => {
        const connection = elementRegistry.get(conn.id);
        if (connection) connections.push(connection);
      });
    }

    return connections;
  }

  /**
   * 상태 백업 생성
   * @private
   */
  _createBackup(services) {
    try {
      const { elementRegistry } = services;
      const elements = elementRegistry.getAll();
      
      return {
        timestamp: Date.now(),
        elements: elements.map(el => ({
          id: el.id,
          type: el.type,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          parent: el.parent?.id,
          businessObject: { ...el.businessObject }
        }))
      };
    } catch (error) {
      this.logger.error('Failed to create backup:', error);
      return null;
    }
  }

  /**
   * 롤백 실행
   * @private
   */
  async _rollback(backup, services) {
    this.logger.warn('Rolling back changes...');
    
    try {
      // 간단한 롤백: CommandStack의 undo 사용
      const { commandStack } = services;
      
      // 최근 명령들을 undo
      let undoCount = 0;
      while (commandStack.canUndo() && undoCount < 100) {
        commandStack.undo();
        undoCount++;
      }
      
      this.logger.info(`Rolled back ${undoCount} commands`);
      
    } catch (error) {
      this.logger.error('Rollback failed:', error);
    }
  }

  /**
   * 배치 결과 병합
   * @private
   */
  _mergeBatchResult(mainResult, batchResult) {
    mainResult.appliedChanges.added += batchResult.appliedChanges.added;
    mainResult.appliedChanges.modified += batchResult.appliedChanges.modified;
    mainResult.appliedChanges.removed += batchResult.appliedChanges.removed;
    
    mainResult.errors.push(...batchResult.errors);
    mainResult.warnings.push(...batchResult.warnings);
  }

  /**
   * 연결 요소 여부 확인
   * @private
   */
  _isConnectionElement(element) {
    const connectionTypes = [
      'bpmn:SequenceFlow',
      'bpmn:MessageFlow',
      'bpmn:Association',
      'bpmn:DataInputAssociation',
      'bpmn:DataOutputAssociation'
    ];
    return connectionTypes.includes(element.type);
  }
}