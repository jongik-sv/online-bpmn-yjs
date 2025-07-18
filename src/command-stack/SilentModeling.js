/**
 * Silent Modeling Service
 * 
 * 기본 Modeling 서비스와 동일한 인터페이스를 제공하지만
 * SilentCommandStack을 사용하여 undo/redo 히스토리에 영향을 주지 않음
 */

import Modeling from 'bpmn-js/lib/features/modeling/Modeling';

export class SilentModeling extends Modeling {
  constructor(eventBus, elementFactory, silentCommandStack, bpmnRules) {
    // 부모 클래스의 생성자를 호출하되 silentCommandStack 사용
    super(eventBus, elementFactory, silentCommandStack, bpmnRules);
    
    this._silentCommandStack = silentCommandStack;
    this._isSilent = true;
  }

  /**
   * 요소의 속성을 업데이트 (Silent)
   * @param {Object} element - 업데이트할 요소
   * @param {Object} properties - 새로운 속성들
   */
  updateProperties(element, properties) {
    return this._silentCommandStack.execute('element.updateProperties', {
      element: element,
      properties: properties
    });
  }

  /**
   * 요소 이동 (Silent)
   * @param {Object} element - 이동할 요소
   * @param {Object} delta - 이동 거리 {x, y}
   * @param {Object} newParent - 새로운 부모 (선택사항)
   */
  moveElements(elements, delta, newParent) {
    return this._silentCommandStack.execute('elements.move', {
      shapes: elements,
      delta: delta,
      newParent: newParent
    });
  }

  /**
   * 요소 크기 조정 (Silent)
   * @param {Object} element - 크기를 조정할 요소
   * @param {Object} newBounds - 새로운 경계 {x, y, width, height}
   */
  resizeShape(element, newBounds) {
    return this._silentCommandStack.execute('shape.resize', {
      shape: element,
      newBounds: newBounds
    });
  }

  /**
   * 요소 생성 (Silent)
   * @param {string} type - 요소 타입
   * @param {Object} attrs - 요소 속성
   * @param {Object} parent - 부모 요소
   * @param {Object} position - 위치 {x, y}
   */
  createShape(type, attrs, parent, position) {
    return this._silentCommandStack.execute('shape.create', {
      type: type,
      businessObject: attrs,
      parent: parent,
      position: position
    });
  }

  /**
   * 요소 삭제 (Silent)
   * @param {Object} element - 삭제할 요소
   */
  removeShape(element) {
    return this._silentCommandStack.execute('shape.delete', {
      shape: element
    });
  }

  /**
   * 연결 생성 (Silent)
   * @param {Object} source - 시작 요소
   * @param {Object} target - 끝 요소
   * @param {Object} attrs - 연결 속성
   * @param {Object} parent - 부모 요소
   */
  createConnection(source, target, attrs, parent) {
    return this._silentCommandStack.execute('connection.create', {
      source: source,
      target: target,
      businessObject: attrs,
      parent: parent
    });
  }

  /**
   * 연결 삭제 (Silent)
   * @param {Object} connection - 삭제할 연결
   */
  removeConnection(connection) {
    return this._silentCommandStack.execute('connection.delete', {
      connection: connection
    });
  }

  /**
   * 연결점 업데이트 (Silent)
   * @param {Object} connection - 연결
   * @param {Array} waypoints - 새로운 연결점들
   */
  updateWaypoints(connection, waypoints) {
    return this._silentCommandStack.execute('connection.updateWaypoints', {
      connection: connection,
      newWaypoints: waypoints
    });
  }

  /**
   * 요소의 Business Object 업데이트 (Silent)
   * @param {Object} element - 요소
   * @param {Object} businessObject - 새로운 Business Object
   */
  updateBusinessObject(element, businessObject) {
    return this._silentCommandStack.execute('element.updateBusinessObject', {
      element: element,
      businessObject: businessObject
    });
  }

  /**
   * 라벨 업데이트 (Silent)
   * @param {Object} element - 라벨 요소
   * @param {string} newLabel - 새로운 라벨 텍스트
   */
  updateLabel(element, newLabel) {
    if (element.label) {
      return this.updateProperties(element.label, { 
        businessObject: { name: newLabel }
      });
    }
    return this.updateProperties(element, { 
      businessObject: { name: newLabel }
    });
  }

  /**
   * 복수 요소 업데이트 (Silent)
   * @param {Array} updates - 업데이트 배열 [{element, properties}, ...]
   */
  batchUpdateProperties(updates) {
    return this._silentCommandStack.execute('elements.updateProperties', {
      updates: updates
    });
  }

  /**
   * Silent 모드 확인
   * @returns {boolean} 항상 true
   */
  isSilent() {
    return this._isSilent;
  }

  /**
   * 사용된 CommandStack 반환
   * @returns {Object} SilentCommandStack 인스턴스
   */
  getCommandStack() {
    return this._silentCommandStack;
  }
}