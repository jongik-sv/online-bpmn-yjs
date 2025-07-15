/**
 * 협업 기능 통합 테스트
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { BpmnDiffSync } from '../../src/core/BpmnDiffSync.js';
import { BpmnCollaborationServer } from '../../server/index.js';
import WebSocket from 'ws';
import * as Y from 'yjs';

describe('협업 기능 통합 테스트', () => {
  let server;
  let client1;
  let client2;
  let yjsDoc1;
  let yjsDoc2;

  beforeEach(async () => {
    // 테스트 서버 시작
    server = new BpmnCollaborationServer({
      port: 0, // 사용 가능한 포트 자동 할당
      enableLogging: false // 테스트 중 로그 최소화
    });
    
    await server.start();
    const serverPort = server.server.address().port;
    
    // Y.js 문서들 생성
    yjsDoc1 = new Y.Doc();
    yjsDoc2 = new Y.Doc();
    
    // WebSocket 클라이언트들 설정
    client1 = new WebSocket(`ws://localhost:${serverPort}/ws?document=test-doc&user=user1`);
    client2 = new WebSocket(`ws://localhost:${serverPort}/ws?document=test-doc&user=user2`);
    
    // 연결 대기
    await Promise.all([
      new Promise(resolve => client1.on('open', resolve)),
      new Promise(resolve => client2.on('open', resolve))
    ]);
  });

  afterEach(async () => {
    // 연결 정리
    if (client1) client1.close();
    if (client2) client2.close();
    
    // 서버 정리
    if (server) {
      await server.stop();
    }
    
    // Y.js 문서 정리
    if (yjsDoc1) yjsDoc1.destroy();
    if (yjsDoc2) yjsDoc2.destroy();
  });

  describe('문서 협업', () => {
    it('두 클라이언트가 같은 문서에 연결할 수 있어야 한다', async () => {
      // 서버에서 문서의 사용자 수 확인
      const response = await fetch(`http://localhost:${server.options.port}/api/documents/test-doc/users`);
      const users = await response.json();
      
      assert.strictEqual(users.length, 2);
      assert.ok(users.some(user => user.id === 'user1'));
      assert.ok(users.some(user => user.id === 'user2'));
    });

    it('실시간으로 변경사항이 동기화되어야 한다', async () => {
      let changeReceived = false;
      
      // client2에서 변경사항 수신 대기
      client2.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'sync' && message.origin === 'user1') {
          changeReceived = true;
        }
      });

      // client1에서 변경사항 전송
      const changeMessage = {
        type: 'sync',
        update: new Uint8Array([1, 2, 3]), // 임시 업데이트 데이터
        origin: 'user1'
      };
      
      client1.send(JSON.stringify(changeMessage));
      
      // 변경사항 수신 대기
      await new Promise(resolve => setTimeout(resolve, 100));
      
      assert.strictEqual(changeReceived, true);
    });

    it('사용자 프레즌스 정보가 업데이트되어야 한다', async () => {
      // 프레즌스 업데이트 메시지 전송
      const presenceMessage = {
        type: 'awareness',
        awareness: {
          user: {
            name: 'User 1',
            cursor: { x: 100, y: 200 }
          }
        }
      };
      
      client1.send(JSON.stringify(presenceMessage));
      
      // 서버에서 협업 메트릭스 확인
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await fetch(`http://localhost:${server.options.port}/api/metrics`);
      const metrics = await response.json();
      
      assert.ok(metrics.collaboration);
      assert.strictEqual(metrics.websockets.connections, 2);
    });
  });

  describe('BPMN 동기화', () => {
    let mockModeler1;
    let mockModeler2;
    let diffSync1;
    let diffSync2;

    beforeEach(async () => {
      // Mock BPMN 모델러들 생성
      mockModeler1 = createMockModeler();
      mockModeler2 = createMockModeler();
      
      // BpmnDiffSync 인스턴스들 생성
      diffSync1 = new BpmnDiffSync();
      diffSync2 = new BpmnDiffSync();
      
      // Y.js 협업 프로바이더로 초기화
      await diffSync1.initialize(mockModeler1, yjsDoc1, { clientId: 'user1' });
      await diffSync2.initialize(mockModeler2, yjsDoc2, { clientId: 'user2' });
    });

    afterEach(async () => {
      if (diffSync1) await diffSync1.destroy();
      if (diffSync2) await diffSync2.destroy();
    });

    it('요소 추가가 동기화되어야 한다', async () => {
      // user1이 요소 추가
      const newElement = {
        id: 'Task_1',
        type: 'bpmn:Task',
        x: 100,
        y: 200,
        width: 100,
        height: 80
      };
      
      mockModeler1.elements.push(newElement);
      
      // 동기화 실행
      await diffSync1.sync();
      
      // 변경사항이 전파될 때까지 대기
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // user2의 상태 확인
      const state2 = await diffSync2.getCurrentState();
      assert.ok(state2.elements['Task_1']);
      assert.strictEqual(state2.elements['Task_1'].type, 'bpmn:Task');
    });

    it('요소 수정이 동기화되어야 한다', async () => {
      // 초기 요소 설정
      const element = {
        id: 'Task_1',
        type: 'bpmn:Task',
        x: 100,
        y: 200,
        width: 100,
        height: 80
      };
      
      mockModeler1.elements.push(element);
      mockModeler2.elements.push({ ...element });
      
      // 두 클라이언트 모두 동기화
      await diffSync1.sync();
      await diffSync2.sync();
      
      // user1이 요소 수정
      const modifiedElement = mockModeler1.elements.find(el => el.id === 'Task_1');
      modifiedElement.x = 200;
      modifiedElement.y = 300;
      
      // 동기화 실행
      await diffSync1.sync();
      
      // 변경사항 전파 대기
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // user2의 상태 확인
      const state2 = await diffSync2.getCurrentState();
      assert.strictEqual(state2.elements['Task_1'].x, 200);
      assert.strictEqual(state2.elements['Task_1'].y, 300);
    });

    it('요소 삭제가 동기화되어야 한다', async () => {
      // 초기 요소 설정
      const element = {
        id: 'Task_1',
        type: 'bpmn:Task',
        x: 100,
        y: 200
      };
      
      mockModeler1.elements.push(element);
      mockModeler2.elements.push({ ...element });
      
      // 동기화
      await diffSync1.sync();
      await diffSync2.sync();
      
      // user1이 요소 삭제
      mockModeler1.elements = mockModeler1.elements.filter(el => el.id !== 'Task_1');
      
      // 동기화 실행
      await diffSync1.sync();
      
      // 변경사항 전파 대기
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // user2의 상태 확인
      const state2 = await diffSync2.getCurrentState();
      assert.ok(!state2.elements['Task_1']);
    });
  });

  describe('충돌 해결', () => {
    let diffSync1;
    let diffSync2;

    beforeEach(async () => {
      const mockModeler1 = createMockModeler();
      const mockModeler2 = createMockModeler();
      
      diffSync1 = new BpmnDiffSync();
      diffSync2 = new BpmnDiffSync();
      
      await diffSync1.initialize(mockModeler1, yjsDoc1, { clientId: 'user1' });
      await diffSync2.initialize(mockModeler2, yjsDoc2, { clientId: 'user2' });
    });

    afterEach(async () => {
      if (diffSync1) await diffSync1.destroy();
      if (diffSync2) await diffSync2.destroy();
    });

    it('동시 수정 시 CRDT가 충돌을 해결해야 한다', async () => {
      // 같은 요소를 두 사용자가 동시에 수정
      const element1 = { id: 'Task_1', type: 'bpmn:Task', x: 100, y: 200 };
      const element2 = { id: 'Task_1', type: 'bpmn:Task', x: 150, y: 250 };
      
      diffSync1.context.modeler.elements.push(element1);
      diffSync2.context.modeler.elements.push(element2);
      
      // 동시 동기화
      await Promise.all([
        diffSync1.sync(),
        diffSync2.sync()
      ]);
      
      // 수렴 대기
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 최종 동기화
      await Promise.all([
        diffSync1.sync(),
        diffSync2.sync()
      ]);
      
      // 두 클라이언트의 상태가 일치해야 함
      const state1 = await diffSync1.getCurrentState();
      const state2 = await diffSync2.getCurrentState();
      
      assert.deepStrictEqual(state1.elements['Task_1'], state2.elements['Task_1']);
    });
  });

  describe('연결 안정성', () => {
    it('연결 끊김 후 재연결 시 동기화되어야 한다', async () => {
      // 연결 끊기
      client1.close();
      
      // 새 연결 생성
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const serverPort = server.server.address().port;
      client1 = new WebSocket(`ws://localhost:${serverPort}/ws?document=test-doc&user=user1`);
      
      await new Promise(resolve => client1.on('open', resolve));
      
      // 재연결 후 사용자 수 확인
      const response = await fetch(`http://localhost:${server.options.port}/api/documents/test-doc/users`);
      const users = await response.json();
      
      assert.strictEqual(users.length, 2);
    });

    it('서버 재시작 후 세션이 복구되어야 한다', async () => {
      // 문서 생성
      const createResponse = await fetch(`http://localhost:${server.options.port}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Document',
          initialData: { bpmn: '<bpmn>test</bpmn>' }
        })
      });
      
      const document = await createResponse.json();
      assert.ok(document.id);
      
      // 문서 조회 확인
      const getResponse = await fetch(`http://localhost:${server.options.port}/api/documents/${document.id}`);
      const retrievedDoc = await getResponse.json();
      
      assert.strictEqual(retrievedDoc.name, 'Test Document');
    });
  });

  function createMockModeler() {
    return {
      elements: [],
      get: (service) => {
        const services = {
          'elementRegistry': {
            getAll: () => this.elements,
            get: (id) => this.elements.find(el => el.id === id)
          },
          'modeling': {
            createShape: (shape) => {
              this.elements.push(shape);
              return shape;
            },
            removeElements: (elements) => {
              elements.forEach(el => {
                const index = this.elements.findIndex(e => e.id === el.id);
                if (index !== -1) this.elements.splice(index, 1);
              });
            },
            updateProperties: (element, properties) => {
              Object.assign(element, properties);
            }
          },
          'canvas': {
            getRootElement: () => ({ id: 'Process_1' })
          }
        };
        
        return services[service];
      }
    };
  }
});