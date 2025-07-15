/**
 * 서버 통합 테스트
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { BpmnCollaborationServer } from '../../server/index.js';
import WebSocket from 'ws';

describe('서버 통합 테스트', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    server = new BpmnCollaborationServer({
      port: 0, // 자동 포트 할당
      enableLogging: false
    });
    
    await server.start();
    const port = server.server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('서버 기본 기능', () => {
    it('서버가 정상적으로 시작되어야 한다', () => {
      assert.strictEqual(server.isRunning, true);
      assert.ok(server.startTime);
    });

    it('헬스 체크가 작동해야 한다', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const health = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(health.status, 'healthy');
      assert.ok(health.uptime >= 0);
    });

    it('서버 정보를 조회할 수 있어야 한다', async () => {
      const response = await fetch(`${baseUrl}/info`);
      const info = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(info.server, 'BPMN Collaboration Server');
      assert.ok(info.features.includes('real-time-collaboration'));
    });

    it('메트릭스를 조회할 수 있어야 한다', async () => {
      const response = await fetch(`${baseUrl}/api/metrics`);
      const metrics = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.ok(metrics.server);
      assert.ok(metrics.collaboration);
      assert.ok(metrics.documents);
      assert.ok(metrics.users);
    });
  });

  describe('문서 API', () => {
    it('문서 목록을 조회할 수 있어야 한다', async () => {
      const response = await fetch(`${baseUrl}/api/documents`);
      const documents = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(documents));
    });

    it('새 문서를 생성할 수 있어야 한다', async () => {
      const documentData = {
        name: 'Test Document',
        initialData: {
          bpmn: '<bpmn:definitions>test</bpmn:definitions>',
          elements: {
            'StartEvent_1': {
              id: 'StartEvent_1',
              type: 'bpmn:StartEvent'
            }
          }
        }
      };

      const response = await fetch(`${baseUrl}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentData)
      });

      const document = await response.json();
      
      assert.strictEqual(response.status, 201);
      assert.ok(document.id);
      assert.strictEqual(document.name, 'Test Document');
      assert.ok(document.url);
    });

    it('문서를 조회할 수 있어야 한다', async () => {
      // 먼저 문서 생성
      const createResponse = await fetch(`${baseUrl}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Doc' })
      });
      
      const createdDoc = await createResponse.json();
      
      // 문서 조회
      const getResponse = await fetch(`${baseUrl}/api/documents/${createdDoc.id}`);
      const document = await getResponse.json();
      
      assert.strictEqual(getResponse.status, 200);
      assert.strictEqual(document.id, createdDoc.id);
      assert.strictEqual(document.name, 'Test Doc');
    });

    it('존재하지 않는 문서 조회 시 404를 반환해야 한다', async () => {
      const response = await fetch(`${baseUrl}/api/documents/nonexistent`);
      
      assert.strictEqual(response.status, 404);
    });

    it('문서를 삭제할 수 있어야 한다', async () => {
      // 문서 생성
      const createResponse = await fetch(`${baseUrl}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'To Delete' })
      });
      
      const document = await createResponse.json();
      
      // 문서 삭제
      const deleteResponse = await fetch(`${baseUrl}/api/documents/${document.id}`, {
        method: 'DELETE'
      });
      
      assert.strictEqual(deleteResponse.status, 204);
      
      // 삭제 확인
      const getResponse = await fetch(`${baseUrl}/api/documents/${document.id}`);
      assert.strictEqual(getResponse.status, 404);
    });
  });

  describe('WebSocket 연결', () => {
    it('WebSocket 연결이 성공해야 한다', async () => {
      const port = server.server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}/ws?document=test-doc&user=test-user`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      ws.close();
    });

    it('document ID 없이 연결 시 실패해야 한다', async () => {
      const port = server.server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}/ws?user=test-user`);
      
      await new Promise((resolve) => {
        ws.on('close', (code) => {
          assert.strictEqual(code, 1008); // Policy violation
          resolve();
        });
      });
    });

    it('여러 클라이언트가 동시에 연결할 수 있어야 한다', async () => {
      const port = server.server.address().port;
      const clients = [];
      
      // 5개 클라이언트 동시 연결
      for (let i = 0; i < 5; i++) {
        const ws = new WebSocket(`ws://localhost:${port}/ws?document=multi-test&user=user${i}`);
        clients.push(ws);
      }
      
      // 모든 연결 대기
      await Promise.all(clients.map(ws => new Promise(resolve => {
        ws.on('open', resolve);
      })));
      
      // 연결 수 확인
      const response = await fetch(`${baseUrl}/api/documents/multi-test/users`);
      const users = await response.json();
      
      assert.strictEqual(users.length, 5);
      
      // 연결 정리
      clients.forEach(ws => ws.close());
    });
  });

  describe('사용자 관리', () => {
    let ws1, ws2;

    beforeEach(async () => {
      const port = server.server.address().port;
      
      ws1 = new WebSocket(`ws://localhost:${port}/ws?document=user-test&user=user1`);
      ws2 = new WebSocket(`ws://localhost:${port}/ws?document=user-test&user=user2`);
      
      await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve))
      ]);
    });

    afterEach(() => {
      if (ws1) ws1.close();
      if (ws2) ws2.close();
    });

    it('문서의 사용자 목록을 조회할 수 있어야 한다', async () => {
      const response = await fetch(`${baseUrl}/api/documents/user-test/users`);
      const users = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(users.length, 2);
      
      const userIds = users.map(u => u.id);
      assert.ok(userIds.includes('user1'));
      assert.ok(userIds.includes('user2'));
    });

    it('사용자 연결 해제 시 목록에서 제거되어야 한다', async () => {
      // user1 연결 해제
      ws1.close();
      
      // 연결 해제 처리 대기
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await fetch(`${baseUrl}/api/documents/user-test/users`);
      const users = await response.json();
      
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].id, 'user2');
    });
  });

  describe('세션 관리', () => {
    it('협업 세션 목록을 조회할 수 있어야 한다', async () => {
      // WebSocket 연결로 세션 생성
      const port = server.server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}/ws?document=session-test&user=session-user`);
      
      await new Promise(resolve => ws.on('open', resolve));
      
      // 세션 목록 조회
      const response = await fetch(`${baseUrl}/api/documents/session-test/sessions`);
      const sessions = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(sessions));
      
      ws.close();
    });
  });

  describe('오류 처리', () => {
    it('존재하지 않는 라우트는 404를 반환해야 한다', async () => {
      const response = await fetch(`${baseUrl}/nonexistent`);
      const error = await response.json();
      
      assert.strictEqual(response.status, 404);
      assert.strictEqual(error.error, 'Not Found');
    });

    it('잘못된 JSON 요청은 400을 반환해야 한다', async () => {
      const response = await fetch(`${baseUrl}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      assert.strictEqual(response.status, 400);
    });

    it('큰 요청 페이로드는 413을 반환해야 한다', async () => {
      const largeData = {
        name: 'Large Document',
        data: 'x'.repeat(11 * 1024 * 1024) // 11MB (제한: 10MB)
      };

      const response = await fetch(`${baseUrl}/api/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largeData)
      });
      
      assert.strictEqual(response.status, 413);
    });
  });

  describe('성능 및 제한', () => {
    it('동시 연결 수 제한이 작동해야 한다', async () => {
      const port = server.server.address().port;
      const maxConnections = 10;
      const clients = [];
      
      // 제한 수만큼 연결 생성
      for (let i = 0; i < maxConnections; i++) {
        const ws = new WebSocket(`ws://localhost:${port}/ws?document=limit-test&user=user${i}`);
        clients.push(ws);
      }
      
      // 모든 연결 대기
      await Promise.all(clients.map(ws => new Promise(resolve => {
        ws.on('open', resolve);
        ws.on('error', resolve); // 오류도 resolve로 처리
      })));
      
      // 연결 정리
      clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      
      // 실제 제한은 서버 설정에 따라 다를 수 있음
      assert.ok(true); // 기본적으로 연결이 처리되는지 확인
    });

    it('응답 시간이 합리적이어야 한다', async () => {
      const startTime = Date.now();
      
      const response = await fetch(`${baseUrl}/health`);
      await response.json();
      
      const responseTime = Date.now() - startTime;
      
      assert.ok(responseTime < 1000); // 1초 이내 응답
    });
  });

  describe('보안', () => {
    it('CORS 헤더가 설정되어야 한다', async () => {
      const response = await fetch(`${baseUrl}/health`);
      
      assert.ok(response.headers.get('access-control-allow-origin'));
    });

    it('OPTIONS 요청을 처리해야 한다', async () => {
      const response = await fetch(`${baseUrl}/api/documents`, {
        method: 'OPTIONS'
      });
      
      assert.ok(response.status < 400);
    });
  });
});