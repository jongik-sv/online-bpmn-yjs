/**
 * 단계 4: 협업 매니저 및 이벤트 필터링 테스트
 * CollaborationManager와 ChangeTracker 통합 테스트
 */

import BpmnModeler from 'bpmn-js/lib/Modeler';
import CollaborationManager from './CollaborationManager.js';
import ChangeTracker from './ChangeTracker.js';
import SilentUpdateService from './SilentUpdateService.js';
import EventBusManager from './EventBusManager.js';

// 테스트용 간단한 BPMN XML
const testDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI" 
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1"/>
    <bpmn:task id="Task_1" name="Test Task"/>
    <bpmn:endEvent id="EndEvent_1"/>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="100" y="100" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1" bpmnElement="Task_1">
        <dc:Bounds x="200" y="80" width="100" height="80"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Event_1" bpmnElement="EndEvent_1">
        <dc:Bounds x="350" y="100" width="36" height="36"/>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="136" y="118"/>
        <di:waypoint x="200" y="120"/>
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="300" y="120"/>
        <di:waypoint x="350" y="118"/>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

class CollaborationTestSuite {
  constructor() {
    this.modeler = null;
    this.collaborationManager = null;
    this.changeTracker = null;
    this.silentUpdateService = null;
    this.eventBusManager = null;
    
    this.testResults = [];
    this.broadcastedChanges = [];
    this.remoteChanges = [];
  }
  
  async initialize() {
    console.log('🚀 협업 시스템 테스트 초기화...');
    
    // 컨테이너 생성
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '600px';
    document.body.appendChild(container);
    
    // Modeler 초기화
    this.modeler = new BpmnModeler({
      container: container
    });
    
    // 다이어그램 로드
    await this.modeler.importXML(testDiagram);
    
    // 서비스들 초기화
    this.silentUpdateService = new SilentUpdateService(this.modeler);
    this.eventBusManager = new EventBusManager(this.modeler);
    this.changeTracker = new ChangeTracker();
    this.collaborationManager = new CollaborationManager(this.modeler);
    
    // 의존성 주입
    this.collaborationManager.setDependencies(this.silentUpdateService, this.changeTracker);
    
    // 테스트용 이벤트 리스너
    this.setupTestEventListeners();
    
    console.log('✅ 초기화 완료');
  }
  
  setupTestEventListeners() {
    // 브로드캐스트된 변경사항 캡처
    this.modeler.on('collaboration.change', (event) => {
      this.broadcastedChanges.push({
        timestamp: Date.now(),
        operation: event.operation,
        source: event.source
      });
      console.log('📡 브로드캐스트된 변경사항:', event.operation);
    });
    
    // 배치 변경 콜백 설정
    this.changeTracker.setBatchChangeCallback((change) => {
      console.log('📦 배치 변경사항:', change);
    });
  }
  
  async runAllTests() {
    console.log('\n🧪 협업 시스템 통합 테스트 시작\n');
    
    try {
      await this.testBasicFunctionality();
      await this.testInfiniteLoopPrevention();
      await this.testRemoteChangeApplication();
      await this.testChangeTracking();
      await this.testEventFiltering();
      await this.testBatchProcessing();
      await this.testErrorHandling();
      
      this.printTestResults();
      
    } catch (error) {
      console.error('❌ 테스트 실행 중 오류:', error);
      this.addTestResult('전체 테스트', false, `실행 오류: ${error.message}`);
    }
  }
  
  async testBasicFunctionality() {
    console.log('📋 기본 기능 테스트...');
    
    try {
      // 요소 가져오기
      const elementRegistry = this.modeler.get('elementRegistry');
      const modeling = this.modeler.get('modeling');
      const task = elementRegistry.get('Task_1');
      
      if (!task) {
        throw new Error('테스트 태스크를 찾을 수 없음');
      }
      
      // 초기 상태 기록
      const initialBroadcastCount = this.broadcastedChanges.length;
      
      // 로컬 변경 수행 (이름 변경)
      modeling.updateProperties(task, { name: 'Updated Task' });
      
      // 변경사항이 브로드캐스트되었는지 확인
      await this.waitForEvents(100);
      
      const newBroadcastCount = this.broadcastedChanges.length;
      const changeDetected = newBroadcastCount > initialBroadcastCount;
      
      this.addTestResult('기본 기능 - 로컬 변경 감지', changeDetected, 
        changeDetected ? '로컬 변경사항이 정상적으로 감지됨' : '로컬 변경사항 감지 실패');
      
      // 요소 속성이 실제로 변경되었는지 확인
      const updatedTask = elementRegistry.get('Task_1');
      const nameUpdated = updatedTask.businessObject.name === 'Updated Task';
      
      this.addTestResult('기본 기능 - 속성 업데이트', nameUpdated,
        nameUpdated ? '요소 속성이 정상적으로 업데이트됨' : '요소 속성 업데이트 실패');
      
    } catch (error) {
      this.addTestResult('기본 기능', false, `오류: ${error.message}`);
    }
  }
  
  async testInfiniteLoopPrevention() {
    console.log('🔄 무한 루프 방지 테스트...');
    
    try {
      const elementRegistry = this.modeler.get('elementRegistry');
      const task = elementRegistry.get('Task_1');
      
      // 원격 변경사항 시뮬레이션
      const remoteChange = {
        type: 'property',
        elementId: 'Task_1',
        properties: {
          businessObject: {
            name: 'Remote Updated Task',
            id: 'Task_1',
            $type: 'bpmn:Task'
          }
        },
        timestamp: Date.now(),
        origin: 'remote'
      };
      
      const initialBroadcastCount = this.broadcastedChanges.length;
      
      // 원격 변경사항 적용
      this.collaborationManager.applyRemoteChanges([remoteChange]);
      
      await this.waitForEvents(200);
      
      // 원격 변경사항이 추가적인 브로드캐스트를 유발하지 않았는지 확인
      const finalBroadcastCount = this.broadcastedChanges.length;
      const noLoop = finalBroadcastCount === initialBroadcastCount;
      
      this.addTestResult('무한 루프 방지', noLoop,
        noLoop ? '원격 변경사항이 추가 브로드캐스트를 유발하지 않음' : '무한 루프 위험 감지');
      
      // 변경사항이 실제로 적용되었는지 확인
      const updatedTask = elementRegistry.get('Task_1');
      const remoteChangeApplied = updatedTask.businessObject.name === 'Remote Updated Task';
      
      this.addTestResult('원격 변경 적용', remoteChangeApplied,
        remoteChangeApplied ? '원격 변경사항이 정상적으로 적용됨' : '원격 변경사항 적용 실패');
      
    } catch (error) {
      this.addTestResult('무한 루프 방지', false, `오류: ${error.message}`);
    }
  }
  
  async testRemoteChangeApplication() {
    console.log('🌐 원격 변경사항 적용 테스트...');
    
    try {
      const elementRegistry = this.modeler.get('elementRegistry');
      
      // 여러 유형의 원격 변경사항 시뮬레이션
      const remoteChanges = [
        {
          type: 'visual',
          elementId: 'Task_1',
          properties: {
            x: 300,
            y: 200
          }
        },
        {
          type: 'property',
          elementId: 'StartEvent_1',
          properties: {
            businessObject: {
              name: 'Remote Start'
            }
          }
        }
      ];
      
      // 배치 업데이트 적용
      this.collaborationManager.applyRemoteChanges(remoteChanges);
      
      await this.waitForEvents(150);
      
      // 위치 변경 확인
      const task = elementRegistry.get('Task_1');
      const positionChanged = task.x === 300 && task.y === 200;
      
      this.addTestResult('원격 위치 변경', positionChanged,
        positionChanged ? '원격 위치 변경이 정상적으로 적용됨' : '원격 위치 변경 실패');
      
      // 속성 변경 확인
      const startEvent = elementRegistry.get('StartEvent_1');
      const propertyChanged = startEvent.businessObject.name === 'Remote Start';
      
      this.addTestResult('원격 속성 변경', propertyChanged,
        propertyChanged ? '원격 속성 변경이 정상적으로 적용됨' : '원격 속성 변경 실패');
      
    } catch (error) {
      this.addTestResult('원격 변경사항 적용', false, `오류: ${error.message}`);
    }
  }
  
  async testChangeTracking() {
    console.log('📊 변경사항 추적 테스트...');
    
    try {
      const elementRegistry = this.modeler.get('elementRegistry');
      const task = elementRegistry.get('Task_1');
      
      // ChangeTracker 상태 초기화
      this.changeTracker.reset();
      
      // 동일한 속성으로 여러 번 업데이트 (중복 방지 테스트)
      const properties = {
        businessObject: { name: 'Duplicate Test' },
        visual: { x: 250, y: 150 }
      };
      
      const shouldProcess1 = this.changeTracker.shouldProcessChange('Task_1', properties);
      const shouldProcess2 = this.changeTracker.shouldProcessChange('Task_1', properties);
      
      this.addTestResult('중복 변경 방지', shouldProcess1 && !shouldProcess2,
        shouldProcess1 && !shouldProcess2 ? '중복 변경사항이 정상적으로 필터링됨' : '중복 변경 방지 실패');
      
      // 변경 히스토리 테스트
      const historyBefore = this.changeTracker.getChangeHistory('Task_1').length;
      
      // 새로운 변경사항
      const newProperties = {
        businessObject: { name: 'History Test' },
        visual: { x: 260, y: 160 }
      };
      
      this.changeTracker.shouldProcessChange('Task_1', newProperties);
      
      const historyAfter = this.changeTracker.getChangeHistory('Task_1').length;
      const historyRecorded = historyAfter > historyBefore;
      
      this.addTestResult('변경 히스토리', historyRecorded,
        historyRecorded ? '변경 히스토리가 정상적으로 기록됨' : '변경 히스토리 기록 실패');
      
      // 상태 정보 확인
      const status = this.changeTracker.getStatus();
      const statusValid = status.trackedElements > 0;
      
      this.addTestResult('추적 상태', statusValid,
        statusValid ? `${status.trackedElements}개 요소 추적 중` : '추적 상태 정보 오류');
      
    } catch (error) {
      this.addTestResult('변경사항 추적', false, `오류: ${error.message}`);
    }
  }
  
  async testEventFiltering() {
    console.log('🎯 이벤트 필터링 테스트...');
    
    try {
      // Silent 모드 테스트
      this.eventBusManager.enableSilentMode();
      
      const modeling = this.modeler.get('modeling');
      const elementRegistry = this.modeler.get('elementRegistry');
      const task = elementRegistry.get('Task_1');
      
      const broadcastCountBefore = this.broadcastedChanges.length;
      
      // Silent 모드에서 변경 수행
      modeling.updateProperties(task, { name: 'Silent Update' });
      
      await this.waitForEvents(100);
      
      const broadcastCountAfter = this.broadcastedChanges.length;
      const silentModeWorks = broadcastCountBefore === broadcastCountAfter;
      
      // Silent 모드 해제
      this.eventBusManager.disableSilentMode();
      
      this.addTestResult('Silent 모드', silentModeWorks,
        silentModeWorks ? 'Silent 모드에서 이벤트가 억제됨' : 'Silent 모드 실패');
      
      // 일시적 무시 테스트
      this.changeTracker.addToTemporaryIgnore('Task_1', 200);
      
      const properties = { businessObject: { name: 'Ignored' } };
      const shouldIgnore = !this.changeTracker.shouldProcessChange('Task_1', properties);
      
      this.addTestResult('임시 무시', shouldIgnore,
        shouldIgnore ? '요소가 임시적으로 무시됨' : '임시 무시 실패');
      
      // 200ms 후 무시 해제 확인
      await this.waitForEvents(250);
      
      const shouldProcessAfter = this.changeTracker.shouldProcessChange('Task_1', {
        businessObject: { name: 'After Ignore' }
      });
      
      this.addTestResult('무시 해제', shouldProcessAfter,
        shouldProcessAfter ? '임시 무시가 정상적으로 해제됨' : '무시 해제 실패');
      
    } catch (error) {
      this.addTestResult('이벤트 필터링', false, `오류: ${error.message}`);
    }
  }
  
  async testBatchProcessing() {
    console.log('📦 배치 처리 테스트...');
    
    try {
      // 배치 변경사항 큐에 추가
      const batchChanges = [
        { elementId: 'Task_1', properties: { businessObject: { name: 'Batch 1' } } },
        { elementId: 'Task_1', properties: { businessObject: { name: 'Batch 2' } } },
        { elementId: 'StartEvent_1', properties: { businessObject: { name: 'Batch Start' } } }
      ];
      
      batchChanges.forEach(change => {
        this.changeTracker.queueChange(change.elementId, change.properties);
      });
      
      // 배치 처리 대기
      await this.waitForEvents(100);
      
      // 최신 상태가 적용되었는지 확인 (마지막 변경사항)
      const status = this.changeTracker.getStatus();
      const batchProcessed = status.queueSize === 0;
      
      this.addTestResult('배치 처리', batchProcessed,
        batchProcessed ? '배치 변경사항이 정상적으로 처리됨' : '배치 처리 실패');
      
    } catch (error) {
      this.addTestResult('배치 처리', false, `오류: ${error.message}`);
    }
  }
  
  async testErrorHandling() {
    console.log('⚠️ 오류 처리 테스트...');
    
    try {
      // 존재하지 않는 요소 변경 시도
      const invalidChange = {
        type: 'property',
        elementId: 'NonExistentElement',
        properties: { name: 'Should Fail' }
      };
      
      let errorCaught = false;
      try {
        this.collaborationManager.applyRemoteChanges([invalidChange]);
      } catch (error) {
        errorCaught = true;
      }
      
      // 오류가 발생해도 시스템이 계속 동작하는지 확인
      const elementRegistry = this.modeler.get('elementRegistry');
      const task = elementRegistry.get('Task_1');
      const systemStillWorks = task !== null;
      
      this.addTestResult('오류 처리', systemStillWorks,
        systemStillWorks ? '오류 발생 후에도 시스템이 정상 동작' : '오류로 인한 시스템 마비');
      
      // CollaborationManager 상태 확인
      const isProcessingRemote = this.collaborationManager.isProcessingRemote();
      
      this.addTestResult('상태 일관성', !isProcessingRemote,
        !isProcessingRemote ? '오류 후 상태가 정상적으로 복원됨' : '상태 불일치 발생');
      
    } catch (error) {
      this.addTestResult('오류 처리', false, `오류: ${error.message}`);
    }
  }
  
  addTestResult(testName, success, message) {
    this.testResults.push({
      name: testName,
      success: success,
      message: message,
      timestamp: new Date().toISOString()
    });
    
    const status = success ? '✅' : '❌';
    console.log(`${status} ${testName}: ${message}`);
  }
  
  printTestResults() {
    console.log('\n📊 테스트 결과 요약\n');
    
    const passed = this.testResults.filter(r => r.success).length;
    const total = this.testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);
    
    console.log(`총 테스트: ${total}`);
    console.log(`성공: ${passed}`);
    console.log(`실패: ${total - passed}`);
    console.log(`성공률: ${passRate}%`);
    
    console.log('\n📋 상세 결과:');
    this.testResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.name}: ${result.message}`);
    });
    
    console.log('\n📡 브로드캐스트 이벤트:', this.broadcastedChanges.length);
    console.log('📊 ChangeTracker 상태:', this.changeTracker.getStatus());
    
    if (passed === total) {
      console.log('\n🎉 모든 테스트가 성공적으로 완료되었습니다!');
    } else {
      console.log('\n⚠️ 일부 테스트가 실패했습니다. 로그를 확인해주세요.');
    }
  }
  
  waitForEvents(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  cleanup() {
    if (this.changeTracker) {
      this.changeTracker.destroy();
    }
    if (this.collaborationManager) {
      this.collaborationManager.destroy();
    }
    if (this.modeler) {
      this.modeler.destroy();
    }
  }
}

// 테스트 실행
async function runCollaborationTests() {
  const testSuite = new CollaborationTestSuite();
  
  try {
    await testSuite.initialize();
    await testSuite.runAllTests();
  } catch (error) {
    console.error('❌ 테스트 슈트 실행 실패:', error);
  } finally {
    testSuite.cleanup();
  }
}

// 자동 실행 (브라우저 환경)
if (typeof window !== 'undefined') {
  window.runCollaborationTests = runCollaborationTests;
  console.log('🧪 window.runCollaborationTests() 호출로 테스트를 실행할 수 있습니다.');
}

export { CollaborationTestSuite, runCollaborationTests };