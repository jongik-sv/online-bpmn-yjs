/**
 * BPMN 상태 추출기
 * BPMN.js 모델러에서 현재 다이어그램 상태를 추출
 */

import { BaseExtractor } from './BaseExtractor.js';

export class BpmnStateExtractor extends BaseExtractor {
  constructor(config = {}) {
    super(config);
    this.options = {
      includeMetadata: true,
      positionPrecision: 0,
      excludeLabels: true,
      excludeTypes: [],
      customProperties: [],
      includeBusinessObject: true,
      includeConnections: true,
      includeDiInfo: false,
      ...config.options
    };
  }

  /**
   * BPMN 상태 추출
   * @param {Object} context - 추출 컨텍스트 { modeler, clientId }
   * @returns {Promise<DocumentState>}
   */
  async extract(context) {
    const { modeler, clientId } = context;

    if (!modeler) {
      throw new Error('BPMN modeler is required');
    }

    try {
      const elementRegistry = modeler.get('elementRegistry');
      const canvas = modeler.get('canvas');
      
      if (!elementRegistry || !canvas) {
        throw new Error('Required BPMN services not available');
      }

      const elements = elementRegistry.getAll();
      const state = {
        timestamp: Date.now(),
        version: '1.0.0',
        clientId: clientId || 'unknown',
        elements: {},
        statistics: {
          elementCount: 0,
          connectionCount: 0,
          shapeCount: 0
        }
      };

      // 메타데이터 추출
      if (this.options.includeMetadata) {
        state.metadata = this._extractCanvasMetadata(canvas);
      }

      // 요소별 데이터 추출
      const filteredElements = elements.filter(element => this._shouldIncludeElement(element));
      
      for (const element of filteredElements) {
        try {
          const elementData = this._extractElementData(element);
          state.elements[element.id] = elementData;
          
          // 통계 업데이트
          this._updateStatistics(state.statistics, element);
          
        } catch (error) {
          this.logger.warn(`Failed to extract element ${element.id}:`, error);
        }
      }

      // 상태 검증
      if (!this.validate(state)) {
        throw new Error('Extracted state is invalid');
      }

      this.logger.debug(`Extracted state: ${state.statistics.elementCount} elements, ${state.statistics.connectionCount} connections`);
      return state;

    } catch (error) {
      this._handleError(error, 'BPMN state extraction');
    }
  }

  /**
   * 요소 포함 여부 판단
   * @private
   * @param {Object} element - BPMN 요소
   * @returns {boolean}
   */
  _shouldIncludeElement(element) {
    // 라벨 제외
    if (this.options.excludeLabels && element.type === 'label') {
      return false;
    }

    // 임시 요소 제외
    if (element.id.startsWith('_tmp_') || element.id === '__implicitroot') {
      return false;
    }

    // 제외 타입 체크
    if (this.options.excludeTypes.includes(element.type)) {
      return false;
    }

    // 숨겨진 요소 제외
    if (element.hidden) {
      return false;
    }

    return true;
  }

  /**
   * 요소 데이터 추출
   * @private
   * @param {Object} element - BPMN 요소
   * @returns {Object}
   */
  _extractElementData(element) {
    const base = {
      id: element.id,
      type: element.type,
      x: this._roundNumber(element.x || 0),
      y: this._roundNumber(element.y || 0),
      width: this._roundNumber(element.width || 0),
      height: this._roundNumber(element.height || 0)
    };

    // 부모 관계
    if (element.parent && element.parent.id !== '__implicitroot') {
      base.parent = element.parent.id;
    }

    // 비즈니스 객체 정보
    if (this.options.includeBusinessObject && element.businessObject) {
      base.businessObject = this._extractBusinessObject(element.businessObject);
    }

    // 연결선 정보
    if (this.options.includeConnections && this._isConnectionElement(element)) {
      this._addConnectionInfo(base, element);
    }

    // DI 정보
    if (this.options.includeDiInfo && element.di) {
      base.di = this._extractDiInfo(element.di);
    }

    // 커스텀 속성
    if (this.options.customProperties.length > 0) {
      const customProps = this._extractCustomProperties(element);
      if (Object.keys(customProps).length > 0) {
        base.customProperties = customProps;
      }
    }

    return base;
  }

  /**
   * 비즈니스 객체 추출
   * @private
   * @param {Object} businessObject - BPMN 비즈니스 객체
   * @returns {Object}
   */
  _extractBusinessObject(businessObject) {
    const extracted = {
      id: businessObject.id,
      $type: businessObject.$type
    };

    // 기본 속성
    const basicProps = ['name', 'documentation'];
    for (const prop of basicProps) {
      if (businessObject[prop] !== undefined) {
        extracted[prop] = businessObject[prop];
      }
    }

    // 참조 속성
    if (businessObject.sourceRef) {
      extracted.sourceRef = this._extractReference(businessObject.sourceRef);
    }

    if (businessObject.targetRef) {
      extracted.targetRef = this._extractReference(businessObject.targetRef);
    }

    // 프로세스 관련 속성
    if (businessObject.isExecutable !== undefined) {
      extracted.isExecutable = businessObject.isExecutable;
    }

    // 확장 속성 (extensionElements)
    if (businessObject.extensionElements) {
      extracted.extensionElements = this._extractExtensionElements(businessObject.extensionElements);
    }

    // 기타 표준 속성
    const standardProps = [
      'conditionExpression', 'defaultFlow', 'gatewayDirection',
      'instantiate', 'eventDefinitions', 'loopCharacteristics'
    ];

    for (const prop of standardProps) {
      if (businessObject[prop] !== undefined) {
        extracted[prop] = this._extractPropertyValue(businessObject[prop]);
      }
    }

    return extracted;
  }

  /**
   * 연결 정보 추가
   * @private
   * @param {Object} base - 기본 요소 데이터
   * @param {Object} element - 연결 요소
   */
  _addConnectionInfo(base, element) {
    // Waypoints
    if (element.waypoints && element.waypoints.length > 0) {
      base.waypoints = element.waypoints.map(wp => ({
        x: this._roundNumber(wp.x),
        y: this._roundNumber(wp.y)
      }));
    }

    // 소스와 타겟
    if (element.source) {
      base.source = element.source.id;
    }

    if (element.target) {
      base.target = element.target.id;
    }

    // 연결 타입별 추가 정보
    if (element.type === 'bpmn:SequenceFlow') {
      this._addSequenceFlowInfo(base, element);
    } else if (element.type === 'bpmn:MessageFlow') {
      this._addMessageFlowInfo(base, element);
    }
  }

  /**
   * 시퀀스 플로우 정보 추가
   * @private
   */
  _addSequenceFlowInfo(base, element) {
    if (element.businessObject) {
      const bo = element.businessObject;
      if (bo.conditionExpression) {
        base.conditionExpression = bo.conditionExpression.body || bo.conditionExpression;
      }
    }
  }

  /**
   * 메시지 플로우 정보 추가
   * @private
   */
  _addMessageFlowInfo(base, element) {
    if (element.businessObject && element.businessObject.messageRef) {
      base.messageRef = element.businessObject.messageRef.id || element.businessObject.messageRef;
    }
  }

  /**
   * 캔버스 메타데이터 추출
   * @private
   * @param {Object} canvas - BPMN 캔버스
   * @returns {Object}
   */
  _extractCanvasMetadata(canvas) {
    const metadata = {
      canvasViewbox: canvas.viewbox(),
      zoom: canvas.zoom(),
      rootElementId: canvas.getRootElement().id
    };

    // 스크롤 정보
    try {
      metadata.scroll = canvas.scroll();
    } catch (error) {
      // 스크롤 정보 없음
    }

    // 캔버스 크기
    const container = canvas.getContainer();
    if (container) {
      metadata.containerSize = {
        width: container.clientWidth,
        height: container.clientHeight
      };
    }

    return metadata;
  }

  /**
   * DI 정보 추출
   * @private
   * @param {Object} di - DI 객체
   * @returns {Object}
   */
  _extractDiInfo(di) {
    return {
      id: di.id,
      $type: di.$type,
      bounds: di.bounds ? {
        x: di.bounds.x,
        y: di.bounds.y,
        width: di.bounds.width,
        height: di.bounds.height
      } : undefined
    };
  }

  /**
   * 커스텀 속성 추출
   * @private
   * @param {Object} element - BPMN 요소
   * @returns {Object}
   */
  _extractCustomProperties(element) {
    const properties = {};

    for (const propName of this.options.customProperties) {
      if (element[propName] !== undefined) {
        properties[propName] = element[propName];
      }
    }

    return properties;
  }

  /**
   * 확장 요소 추출
   * @private
   * @param {Object} extensionElements - 확장 요소
   * @returns {Array}
   */
  _extractExtensionElements(extensionElements) {
    if (!extensionElements || !extensionElements.values) {
      return [];
    }

    return extensionElements.values.map(ext => ({
      $type: ext.$type,
      value: ext.value || ext.body,
      attributes: ext.$attrs
    }));
  }

  /**
   * 참조 추출
   * @private
   * @param {Object} ref - 참조 객체
   * @returns {string}
   */
  _extractReference(ref) {
    if (typeof ref === 'string') {
      return ref;
    }
    return ref.id || ref;
  }

  /**
   * 속성 값 추출
   * @private
   * @param {any} value - 속성 값
   * @returns {any}
   */
  _extractPropertyValue(value) {
    if (value && typeof value === 'object') {
      if (value.body !== undefined) {
        return value.body;
      }
      if (value.id !== undefined) {
        return value.id;
      }
      if (Array.isArray(value)) {
        return value.map(v => this._extractPropertyValue(v));
      }
    }
    return value;
  }

  /**
   * 연결 요소 여부 확인
   * @private
   * @param {Object} element - BPMN 요소
   * @returns {boolean}
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

  /**
   * 통계 업데이트
   * @private
   * @param {Object} statistics - 통계 객체
   * @param {Object} element - BPMN 요소
   */
  _updateStatistics(statistics, element) {
    if (this._isConnectionElement(element)) {
      statistics.connectionCount++;
    } else {
      statistics.shapeCount++;
    }
    statistics.elementCount++;
  }

  /**
   * 숫자 반올림 (기본 클래스 메서드 오버라이드)
   * @private
   * @param {number} value - 반올림할 값
   * @returns {number}
   */
  _roundNumber(value) {
    const precision = this.options.positionPrecision;
    if (precision > 0) {
      const factor = Math.pow(10, precision);
      return Math.round(value * factor) / factor;
    }
    return Math.round(value);
  }
}