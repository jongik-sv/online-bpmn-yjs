import ElementFactory from 'diagram-js/lib/core/ElementFactory';

/**
 * 협업 ID를 지원하는 커스텀 ElementFactory
 * 기본 ElementFactory를 확장해서 협업용 결정론적 ID를 생성
 */
export default class CustomElementFactory extends ElementFactory {
  constructor(injector) {
    super(injector);
    
    // 의존성 주입으로 필요한 서비스들 가져오기
    this._bpmnFactory = injector.get('bpmnFactory');
    this._moddle = injector.get('moddle');
    
    // 협업 데모 인스턴스 참조 (전역에서 가져오기)
    this._collaborationDemo = null;
  }

  /**
   * 협업 데모 인스턴스 설정
   */
  setCollaborationDemo(demo) {
    this._collaborationDemo = demo;
  }

  /**
   * Shape 생성 - 협업 ID 로직 적용
   */
  createShape(attrs) {
    console.log('CustomElementFactory.createShape 호출됨:', attrs);
    
    // 먼저 부모 클래스의 createShape 호출하여 정상적인 shape 생성
    const shape = super.createShape(attrs);
    
    // 협업 데모가 설정되고 연결된 상태에서만 협업 ID 적용 (생성 후)
    if (this._collaborationDemo && 
        this._collaborationDemo.isConnected && 
        !this._collaborationDemo.isApplyingRemoteChange && 
        attrs && 
        attrs.type !== 'label') {
      
      this._applyCollaborativeIdToShape(shape, attrs);
    }

    return shape;
  }

  /**
   * Shape에 협업 ID 적용 (Shape 생성 후)
   */
  _applyCollaborativeIdToShape(shape, attrs) {
    try {
      // 이미 협업 ID인 경우는 건드리지 않음
      if (this._isCollaborativeId(shape.id)) {
        return;
      }

      // 위치 정보 추출
      const position = {
        x: shape.x || attrs.x || 100,
        y: shape.y || attrs.y || 100
      };

      // 협업 ID 생성
      const collaborativeId = this._collaborationDemo.generateCollaborativeId(
        attrs.type,
        position,
        Date.now()
      );

      console.log(`ElementFactory에서 협업 ID 생성: ${attrs.type} → ${collaborativeId}`, 'position:', position);

      // Shape ID 변경
      const oldId = shape.id;
      shape.id = collaborativeId;

      // BusinessObject ID 변경
      if (shape.businessObject) {
        shape.businessObject.id = collaborativeId;
      }

      // DI (Diagram Interchange) ID 변경
      if (shape.di) {
        shape.di.id = collaborativeId + '_di';
      }

      this._collaborationDemo.addLog(`ElementFactory에서 협업 ID 생성: ${oldId} → ${collaborativeId}`, 'success');
      
    } catch (error) {
      console.error('협업 ID shape 적용 오류:', error);
    }
  }

  /**
   * 협업 ID인지 확인
   */
  _isCollaborativeId(id) {
    if (!id) return false;
    const collaborativePrefixes = ['Activity_', 'Event_', 'Gateway_', 'Flow_', 'StartEvent_', 'EndEvent_', 'Element_'];
    return collaborativePrefixes.some(prefix => 
      id.startsWith(prefix) && id.includes('_') && id.length > prefix.length + 7
    );
  }

  /**
   * Connection 생성 - 필요시 오버라이드
   */
  createConnection(attrs) {
    console.log('CustomElementFactory.createConnection 호출됨:', attrs);
    return super.createConnection(attrs);
  }
}

// 의존성 주입 설정
CustomElementFactory.$inject = ['injector'];