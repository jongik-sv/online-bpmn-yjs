/**
 * BPMN 모델러 서비스
 * BPMN.js 모델러 초기화 및 관리
 */
export class BpmnModelerService {
  constructor() {
    this.modeler = null;
    this.isInitialized = false;
  }

  /**
   * BPMN 모델러 초기화
   */
  initializeBpmnModeler() {
    try {
      this.modeler = new window.BpmnJS({
        container: '#canvas',
        keyboard: {
          bindTo: document
        },
        additionalModules: [],
        moddleExtensions: {}
      });

      this.isInitialized = true;
      
      // 모델러 로드 완료 후 이벤트 확인
      this.modeler.on('import.done', () => {
        console.log('📋 BPMN 다이어그램 import 완료');
        this.checkMoveCapability();
      });
      
      return this.modeler;
    } catch (error) {
      console.error('BPMN 모델러 초기화 실패:', error);
      throw error;
    }
  }
  
  /**
   * 이동 기능 확인
   */
  checkMoveCapability() {
    try {
      const move = this.getService('move');
      const modeling = this.getService('modeling');
      const elementRegistry = this.getService('elementRegistry');
      
      console.log('🔧 BPMN 서비스 확인:', {
        move: !!move,
        modeling: !!modeling,
        elementRegistry: !!elementRegistry
      });
      
      // 시작 이벤트 요소 확인
      const startEvent = elementRegistry.get('StartEvent_1');
      if (startEvent) {
        console.log('🎯 시작 이벤트 발견:', startEvent.id, '좌표:', startEvent.x, startEvent.y);
      }
      
    } catch (error) {
      console.error('❌ 이동 기능 확인 실패:', error);
    }
  }

  /**
   * 초기 다이어그램 로드
   */
  async loadInitialDiagram() {
    if (!this.modeler) {
      throw new Error('BPMN 모델러가 초기화되지 않았습니다.');
    }

    const initialDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
                  id="Definitions_1" 
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="시작">
      <bpmn:outgoing>SequenceFlow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="작업 1">
      <bpmn:incoming>SequenceFlow_1</bpmn:incoming>
      <bpmn:outgoing>SequenceFlow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="종료">
      <bpmn:incoming>SequenceFlow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="SequenceFlow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="SequenceFlow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="99" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <dc:Bounds x="187" y="142" width="20" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="270" y="77" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="432" y="99" width="36" height="36"/>
        <bpmndi:BPMNLabel>
          <dc:Bounds x="440" y="142" width="20" height="14"/>
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="SequenceFlow_1_di" bpmnElement="SequenceFlow_1">
        <di:waypoint x="215" y="117"/>
        <di:waypoint x="270" y="117"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="SequenceFlow_2_di" bpmnElement="SequenceFlow_2">
        <di:waypoint x="370" y="117"/>
        <di:waypoint x="432" y="117"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

    try {
      await this.modeler.importXML(initialDiagram);
      console.log('✅ 초기 BPMN 다이어그램 로드 완료');
    } catch (error) {
      console.error('❌ 초기 다이어그램 로드 실패:', error);
      throw error;
    }
  }

  /**
   * XML에서 다이어그램 로드
   */
  async loadDiagramFromXML(xml) {
    if (!this.modeler) {
      throw new Error('BPMN 모델러가 초기화되지 않았습니다.');
    }

    try {
      await this.modeler.importXML(xml);
      console.log('✅ 다이어그램 로드 완료');
    } catch (error) {
      console.error('❌ 다이어그램 로드 실패:', error);
      throw error;
    }
  }

  /**
   * 현재 다이어그램을 XML로 내보내기
   */
  async exportDiagramAsXML() {
    if (!this.modeler) {
      throw new Error('BPMN 모델러가 초기화되지 않았습니다.');
    }

    try {
      const result = await this.modeler.saveXML({ format: true });
      return result.xml;
    } catch (error) {
      console.error('❌ 다이어그램 내보내기 실패:', error);
      throw error;
    }
  }

  /**
   * 서비스 가져오기
   */
  getService(serviceName) {
    if (!this.modeler) {
      throw new Error('BPMN 모델러가 초기화되지 않았습니다.');
    }
    return this.modeler.get(serviceName);
  }

  /**
   * 모델러 인스턴스 가져오기
   */
  getModeler() {
    return this.modeler;
  }

  /**
   * 초기화 상태 확인
   */
  isReady() {
    return this.isInitialized && this.modeler !== null;
  }

  /**
   * 요소 이동 테스트
   */
  testElementMove(elementId = 'StartEvent_1') {
    try {
      const modeling = this.getService('modeling');
      const elementRegistry = this.getService('elementRegistry');
      
      const element = elementRegistry.get(elementId);
      if (!element) {
        console.error(`요소를 찾을 수 없습니다: ${elementId}`);
        return false;
      }
      
      console.log(`🎯 ${elementId} 이동 테스트 시작`);
      console.log('현재 위치:', { x: element.x, y: element.y });
      
      // 50px 오른쪽으로 이동
      const newPosition = { x: element.x + 50, y: element.y };
      modeling.moveElements([element], { x: 50, y: 0 });
      
      console.log('이동 후 위치:', newPosition);
      console.log('✅ 요소 이동 테스트 완료');
      return true;
      
    } catch (error) {
      console.error('❌ 요소 이동 테스트 실패:', error);
      return false;
    }
  }

  /**
   * 서비스 종료
   */
  destroy() {
    if (this.modeler) {
      this.modeler.destroy();
      this.modeler = null;
    }
    this.isInitialized = false;
  }
}