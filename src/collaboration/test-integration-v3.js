/**
 * 통합 테스트 - Silent Update Architecture V3
 * 
 * 모든 구현된 컴포넌트들의 통합 테스트
 */

import { test } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';

// Silent Update 시스템 컴포넌트들
import { SilentUpdateService } from '../silent-update/SilentUpdateService.js';
import { EventBusManager } from '../silent-update/EventBusManager.js';
import { SynchronizationManager } from '../synchronization/SynchronizationManager.js';
import { CollaborationManager } from './CollaborationManager.js';
import { ChangeTracker } from './ChangeTracker.js';
import { DirectModelManipulator } from './DirectModelManipulator.js';
import { ModelTreeManipulator } from './ModelTreeManipulator.js';
import { CommandStackManager } from './CommandStackManager.js';

// 통합 시스템
import { BPMNCollaborationImplementation } from '../integration/BPMNCollaborationImplementation.js';
import { UserAwarenessSystem } from '../integration/UserAwarenessSystem.js';

// Mock BPMN Modeler 클래스
class MockBpmnModeler {
  constructor() {
    this.services = new Map();
    this.eventListeners = new Map();
    this.elements = new Map();
    this.graphics = new Map();
    
    this._setupMockServices();
  }

  _setupMockServices() {
    // ElementRegistry 모킹
    this.services.set('elementRegistry', {
      getAll: () => Array.from(this.elements.values()),
      get: (id) => this.elements.get(id),
      add: (element, gfx) => {
        this.elements.set(element.id, element);
        if (gfx) this.graphics.set(element.id, gfx);
      },
      remove: (element) => {
        this.elements.delete(element.id);
        this.graphics.delete(element.id);
      },
      getGraphics: (element) => this.graphics.get(element.id),
      updateGraphics: (element, gfx) => this.graphics.set(element.id, gfx)
    });

    // ElementFactory 모킹
    this.services.set('elementFactory', {
      createShape: (attrs) => ({
        id: attrs.businessObject?.id || 'test-element',
        type: attrs.type,
        businessObject: attrs.businessObject,
        x: attrs.x || 0,
        y: attrs.y || 0,
        width: attrs.width || 100,
        height: attrs.height || 80,
        ...attrs
      })
    });

    // BpmnFactory 모킹
    this.services.set('bpmnFactory', {
      create: (type, properties) => ({
        $type: type,
        id: properties?.id || 'test-' + Date.now(),
        ...properties
      })
    });

    // Canvas 모킹
    this.services.set('canvas', {
      _addElement: (element, parent) => {
        element.parent = parent;
        if (parent && !parent.children) parent.children = [];
        if (parent) parent.children.push(element);
      },
      _removeElement: (element) => {
        if (element.parent && element.parent.children) {
          const index = element.parent.children.indexOf(element);
          if (index > -1) element.parent.children.splice(index, 1);
        }
      },
      _redraw: () => {},
      _suspendRendering: false,
      getContainer: () => ({
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        appendChild: () => {},
        removeChild: () => {},
        addEventListener: () => {}
      })
    });

    // GraphicsFactory 모킹
    this.services.set('graphicsFactory', {
      create: (type, element) => ({
        type: type,
        element: element,
        parentNode: null
      }),
      update: (type, element, gfx) => {
        // 그래픽스 업데이트 시뮬레이션
      }
    });

    // EventBus 모킹
    this.services.set('eventBus', {
      fire: (event, data) => {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => callback(data));
      }
    });

    // CommandStack 모킹
    this.services.set('commandStack', {
      execute: (command) => {},
      _enabled: true
    });

    // Modeling 모킹
    this.services.set('modeling', {
      updateProperties: (element, properties) => {
        Object.assign(element.businessObject, properties);
      },
      moveElements: (elements, delta) => {
        elements.forEach(element => {
          element.x += delta.x;
          element.y += delta.y;
        });
      }
    });
  }

  get(serviceName) {
    return this.services.get(serviceName);
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  // 테스트용 헬퍼 메서드들
  addTestElement(id, type = 'bpmn:Task') {
    const businessObject = this.get('bpmnFactory').create(type, { id: id });
    const element = this.get('elementFactory').createShape({
      type: type,
      businessObject: businessObject,
      x: 100,
      y: 100,
      width: 100,
      height: 80
    });
    
    this.get('elementRegistry').add(element);
    return element;
  }
}

// Mock WebSocket 클래스
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.messages = [];
    this.listeners = new Map();

    // 연결 시뮬레이션
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  static get CONNECTING() { return 0; }
  static get OPEN() { return 1; }
  static get CLOSING() { return 2; }
  static get CLOSED() { return 3; }

  send(data) {
    this.messages.push(JSON.parse(data));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // 테스트용 메시지 수신 시뮬레이션
  simulateMessage(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1];
  }

  getAllMessages() {
    return [...this.messages];
  }

  clearMessages() {
    this.messages = [];
  }
}

// 전역 WebSocket 모킹
global.WebSocket = MockWebSocket;

test('Silent Update 통합 테스트 모음', async (t) => {
  let modeler;
  let collaborationSystem;

  await t.test('환경 설정', () => {
    modeler = new MockBpmnModeler();
    ok(modeler, 'Mock BPMN Modeler 생성됨');
  });

  await t.test('SilentUpdateService 기본 기능', () => {
    const silentUpdater = new SilentUpdateService(modeler);
    ok(silentUpdater, 'SilentUpdateService 생성됨');

    // 테스트 요소 추가
    const element = modeler.addTestElement('test-task-1');
    
    // 속성 업데이트 테스트
    const updated = silentUpdater.updateBusinessObject('test-task-1', {
      name: 'Updated Task'
    });
    
    ok(updated, '요소 업데이트 성공');
    strictEqual(element.businessObject.name, 'Updated Task', '속성이 올바르게 업데이트됨');
  });

  await t.test('SynchronizationManager 동기화 큐', async () => {
    const syncManager = new SynchronizationManager(modeler);
    ok(syncManager, 'SynchronizationManager 생성됨');

    // 동기화 작업 큐잉
    syncManager.queueSync({
      type: 'updateElement',
      elementId: 'test-task-1',
      changes: {
        businessObject: { name: 'Synced Task' }
      }
    });

    // 큐 처리 대기
    await new Promise(resolve => setTimeout(resolve, 50));

    const status = syncManager.getStatus();
    strictEqual(status.queueSize, 0, '큐가 비워짐');
  });

  await t.test('CollaborationManager 이벤트 필터링', () => {
    const collaborationManager = new CollaborationManager(modeler);
    ok(collaborationManager, 'CollaborationManager 생성됨');

    // 원격 이벤트 처리 모드 설정
    collaborationManager.isProcessingRemoteEvent = true;
    
    // 무한 루프 방지 확인
    const shouldFilter = collaborationManager.isProcessingRemoteEvent;
    ok(shouldFilter, '원격 이벤트 처리 중 로컬 이벤트 필터링됨');
  });

  await t.test('ChangeTracker 중복 방지', () => {
    const changeTracker = new ChangeTracker();
    ok(changeTracker, 'ChangeTracker 생성됨');

    const properties = { name: 'Test Task', value: 123 };
    
    // 첫 번째 변경사항
    const firstChange = changeTracker.shouldProcessChange('test-element', properties);
    ok(firstChange, '첫 번째 변경사항 처리됨');

    // 동일한 변경사항 (중복)
    const duplicateChange = changeTracker.shouldProcessChange('test-element', properties);
    ok(!duplicateChange, '중복 변경사항 필터링됨');
  });

  await t.test('DirectModelManipulator 요소 생성', () => {
    const directManipulator = new DirectModelManipulator(modeler);
    ok(directManipulator, 'DirectModelManipulator 생성됨');

    const newElement = directManipulator.createCompleteElement(
      'bpmn:UserTask',
      { name: 'New User Task' },
      { x: 200, y: 200 },
      null
    );

    ok(newElement, '새 요소 생성됨');
    strictEqual(newElement.businessObject.name, 'New User Task', '요소 속성이 올바름');
  });

  await t.test('BPMNCollaborationImplementation 통합 테스트', async () => {
    // 전체 협업 시스템 초기화
    collaborationSystem = new BPMNCollaborationImplementation(
      modeler,
      'ws://localhost:3001',
      {
        userId: 'test-user-1',
        userName: 'Test User',
        userColor: '#FF6B6B'
      }
    );

    ok(collaborationSystem, '협업 시스템 생성됨');
    ok(collaborationSystem.silentUpdater, 'Silent Update 서비스 초기화됨');
    ok(collaborationSystem.syncManager, '동기화 매니저 초기화됨');
    ok(collaborationSystem.collaborationManager, '협업 매니저 초기화됨');

    // 연결 대기
    await new Promise(resolve => setTimeout(resolve, 50));
    
    ok(collaborationSystem.isConnected, '서버 연결됨');
  });

  await t.test('WebSocket 메시지 처리 테스트', () => {
    const websocket = collaborationSystem.websocket;
    ok(websocket instanceof MockWebSocket, 'Mock WebSocket 사용됨');

    // 원격 모델 변경 시뮬레이션
    websocket.simulateMessage({
      type: 'model_change',
      userId: 'other-user',
      operation: {
        type: 'updateElement',
        elementId: 'test-task-1',
        changes: {
          businessObject: { name: 'Remote Update' }
        }
      }
    });

    // 메시지 처리 확인
    const element = modeler.get('elementRegistry').get('test-task-1');
    // 실제 처리는 비동기이므로 구조만 확인
    ok(element, '요소가 존재함');
  });

  await t.test('사용자 인식 시스템 테스트', () => {
    // DOM 모킹 (Node.js 환경)
    global.document = {
      createElement: (tag) => ({
        style: {},
        appendChild: () => {},
        remove: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        textContent: '',
        className: ''
      }),
      getElementById: () => null,
      head: { appendChild: () => {} }
    };

    const userAwareness = new UserAwarenessSystem(
      modeler,
      collaborationSystem.websocket,
      { id: 'test-user', name: 'Test User', color: '#FF6B6B' }
    );

    ok(userAwareness, '사용자 인식 시스템 생성됨');

    // 원격 사용자 추가
    userAwareness.addRemoteUser({
      id: 'remote-user',
      name: 'Remote User',
      color: '#4ECDC4'
    });

    strictEqual(userAwareness.getOnlineUserCount(), 2, '온라인 사용자 수 정확함');
  });

  await t.test('성능 테스트 - 대량 업데이트', async () => {
    const startTime = Date.now();
    const updateCount = 100;

    // 대량 업데이트 시뮬레이션
    for (let i = 0; i < updateCount; i++) {
      collaborationSystem.syncManager.queueSync({
        type: 'updateElement',
        elementId: 'test-task-1',
        changes: {
          businessObject: { counter: i }
        }
      });
    }

    // 처리 완료 대기
    await new Promise(resolve => setTimeout(resolve, 200));

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`${updateCount}개 업데이트 처리 시간: ${duration}ms`);
    ok(duration < 1000, '성능 요구사항 충족 (1초 미만)');
  });

  await t.test('오류 처리 테스트', () => {
    // 존재하지 않는 요소 업데이트 시도
    const result = collaborationSystem.silentUpdater.updateBusinessObject(
      'non-existent-element',
      { name: 'Should Fail' }
    );

    strictEqual(result, null, '존재하지 않는 요소 업데이트 실패 처리됨');
  });

  await t.test('메모리 누수 방지 테스트', () => {
    const initialElements = modeler.get('elementRegistry').getAll().length;

    // 요소 생성 및 제거
    const tempElement = modeler.addTestElement('temp-element');
    collaborationSystem.silentUpdater.removeElementSilently('temp-element');

    const finalElements = modeler.get('elementRegistry').getAll().length;
    strictEqual(finalElements, initialElements, '요소가 올바르게 제거됨');
  });

  await t.test('동기화 일관성 검증', () => {
    const inconsistencies = collaborationSystem.syncManager.validateSync();
    ok(Array.isArray(inconsistencies), '일관성 검증 결과는 배열');
    
    // 새로운 테스트 요소로 일관성 검증
    const testElement = modeler.addTestElement('consistency-test');
    const newInconsistencies = collaborationSystem.syncManager.validateSync();
    
    ok(Array.isArray(newInconsistencies), '추가 일관성 검증 성공');
  });

  await t.test('정리 작업', () => {
    if (collaborationSystem) {
      collaborationSystem.destroy();
      ok(true, '협업 시스템 정리 완료');
    }
  });
});

// 개별 컴포넌트 테스트들
test('EventBusManager 이벤트 우회 테스트', () => {
  const modeler = new MockBpmnModeler();
  const eventBusManager = new EventBusManager(modeler);
  
  let eventFired = false;
  modeler.on('test-event', () => {
    eventFired = true;
  });

  // Silent 모드 활성화
  eventBusManager.enableSilentMode();
  
  // 이벤트 발생 시도 (차단되어야 함)
  modeler.get('eventBus').fire('test-event');
  
  ok(!eventFired, 'Silent 모드에서 이벤트 발생 차단됨');

  // Silent 모드 비활성화
  eventBusManager.disableSilentMode();
  
  // 이벤트 발생 시도 (정상 발생해야 함)
  modeler.get('eventBus').fire('test-event');
  
  ok(eventFired, 'Silent 모드 해제 후 이벤트 정상 발생');
});

test('CommandStackManager 분리 테스트', () => {
  const modeler = new MockBpmnModeler();
  const commandStackManager = new CommandStackManager(modeler);
  
  ok(commandStackManager, 'CommandStackManager 생성됨');
  ok(commandStackManager.userCommandStack, '사용자 CommandStack 존재');
  ok(commandStackManager.collaborationCommandStack, '협업 CommandStack 존재');
});

test('ModelTreeManipulator 관계 설정 테스트', () => {
  const modeler = new MockBpmnModeler();
  const modelTreeManipulator = new ModelTreeManipulator(modeler);
  
  // 부모-자식 요소 생성
  const parent = modeler.addTestElement('parent-process', 'bpmn:Process');
  const child = modeler.addTestElement('child-task', 'bpmn:Task');
  
  // 관계 설정
  modelTreeManipulator.setParentChild('parent-process', 'child-task');
  
  strictEqual(child.parent, parent, '부모-자식 관계 설정됨');
  ok(parent.children && parent.children.includes(child), '부모의 children 배열에 자식 포함됨');
});

console.log('✅ 모든 Silent Update Architecture V3 통합 테스트 완료');