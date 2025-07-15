/**
 * EventBus 단위 테스트
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EventBus } from '../../src/utils/EventBus.js';

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('기본 이벤트 처리', () => {
    it('이벤트 리스너를 등록할 수 있어야 한다', () => {
      let eventFired = false;
      
      eventBus.on('test:event', () => {
        eventFired = true;
      });

      eventBus.emit('test:event');
      assert.strictEqual(eventFired, true);
    });

    it('이벤트 데이터를 전달할 수 있어야 한다', () => {
      let receivedData = null;
      
      eventBus.on('data:event', (data) => {
        receivedData = data;
      });

      const testData = { message: 'hello', number: 42 };
      eventBus.emit('data:event', testData);
      
      assert.deepStrictEqual(receivedData, testData);
    });

    it('여러 인수를 전달할 수 있어야 한다', () => {
      let receivedArgs = [];
      
      eventBus.on('multi:args', (...args) => {
        receivedArgs = args;
      });

      eventBus.emit('multi:args', 'arg1', 'arg2', 'arg3');
      
      assert.deepStrictEqual(receivedArgs, ['arg1', 'arg2', 'arg3']);
    });

    it('여러 리스너를 등록할 수 있어야 한다', () => {
      let count = 0;
      
      eventBus.on('count:event', () => count++);
      eventBus.on('count:event', () => count++);
      eventBus.on('count:event', () => count++);

      eventBus.emit('count:event');
      assert.strictEqual(count, 3);
    });
  });

  describe('이벤트 리스너 제거', () => {
    it('특정 리스너를 제거할 수 있어야 한다', () => {
      let count = 0;
      
      const listener = () => count++;
      eventBus.on('remove:test', listener);
      eventBus.on('remove:test', () => count++);

      eventBus.emit('remove:test');
      assert.strictEqual(count, 2);

      eventBus.off('remove:test', listener);
      eventBus.emit('remove:test');
      assert.strictEqual(count, 3); // 하나만 증가
    });

    it('제거 함수를 사용할 수 있어야 한다', () => {
      let count = 0;
      
      const removeListener = eventBus.on('remove:function', () => count++);
      
      eventBus.emit('remove:function');
      assert.strictEqual(count, 1);

      removeListener();
      eventBus.emit('remove:function');
      assert.strictEqual(count, 1); // 증가하지 않음
    });

    it('모든 리스너를 제거할 수 있어야 한다', () => {
      let count = 0;
      
      eventBus.on('remove:all', () => count++);
      eventBus.on('remove:all', () => count++);
      eventBus.on('keep:event', () => count++);

      eventBus.removeAllListeners('remove:all');
      
      eventBus.emit('remove:all');
      eventBus.emit('keep:event');
      
      assert.strictEqual(count, 1); // keep:event만 실행됨
    });

    it('전체 이벤트 버스를 정리할 수 있어야 한다', () => {
      let count = 0;
      
      eventBus.on('event1', () => count++);
      eventBus.on('event2', () => count++);

      eventBus.removeAllListeners();
      
      eventBus.emit('event1');
      eventBus.emit('event2');
      
      assert.strictEqual(count, 0);
    });
  });

  describe('일회성 이벤트', () => {
    it('once로 등록한 리스너는 한 번만 실행되어야 한다', () => {
      let count = 0;
      
      eventBus.once('once:event', () => count++);
      
      eventBus.emit('once:event');
      eventBus.emit('once:event');
      eventBus.emit('once:event');
      
      assert.strictEqual(count, 1);
    });

    it('once 리스너도 제거 함수를 반환해야 한다', () => {
      let count = 0;
      
      const removeOnce = eventBus.once('once:remove', () => count++);
      removeOnce();
      
      eventBus.emit('once:remove');
      assert.strictEqual(count, 0);
    });
  });

  describe('비동기 이벤트', () => {
    it('비동기 이벤트를 처리할 수 있어야 한다', async () => {
      let completed = false;
      
      eventBus.on('async:event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        completed = true;
      });

      await eventBus.emitAsync('async:event');
      assert.strictEqual(completed, true);
    });

    it('비동기 리스너에서 오류가 발생해도 계속 진행해야 한다', async () => {
      let successCount = 0;
      
      eventBus.on('async:error', async () => {
        throw new Error('Async error');
      });
      
      eventBus.on('async:error', async () => {
        successCount++;
      });

      await eventBus.emitAsync('async:error');
      assert.strictEqual(successCount, 1);
    });
  });

  describe('오류 처리', () => {
    it('리스너에서 오류가 발생해도 다른 리스너는 실행되어야 한다', () => {
      let successCount = 0;
      
      eventBus.on('error:test', () => {
        throw new Error('Test error');
      });
      
      eventBus.on('error:test', () => successCount++);
      eventBus.on('error:test', () => successCount++);

      eventBus.emit('error:test');
      assert.strictEqual(successCount, 2);
    });

    it('오류 이벤트를 발생시켜야 한다', () => {
      let errorEvent = null;
      
      eventBus.on('error', (errorData) => {
        errorEvent = errorData;
      });

      eventBus.on('error:source', () => {
        throw new Error('Source error');
      });

      eventBus.emit('error:source');
      
      assert.ok(errorEvent);
      assert.strictEqual(errorEvent.event, 'error:source');
      assert.ok(Array.isArray(errorEvent.errors));
      assert.strictEqual(errorEvent.errors.length, 1);
    });
  });

  describe('이벤트 정보 조회', () => {
    it('리스너 수를 조회할 수 있어야 한다', () => {
      eventBus.on('count:test', () => {});
      eventBus.on('count:test', () => {});
      
      assert.strictEqual(eventBus.listenerCount('count:test'), 2);
      assert.strictEqual(eventBus.listenerCount('nonexistent'), 0);
    });

    it('등록된 이벤트 목록을 조회할 수 있어야 한다', () => {
      eventBus.on('event1', () => {});
      eventBus.on('event2', () => {});
      
      const eventNames = eventBus.eventNames();
      assert.ok(eventNames.includes('event1'));
      assert.ok(eventNames.includes('event2'));
    });

    it('특정 이벤트의 리스너 목록을 조회할 수 있어야 한다', () => {
      const listener1 = () => {};
      const listener2 = () => {};
      
      eventBus.on('listeners:test', listener1);
      eventBus.on('listeners:test', listener2);
      
      const listeners = eventBus.listeners('listeners:test');
      assert.strictEqual(listeners.length, 2);
      assert.ok(listeners.includes(listener1));
      assert.ok(listeners.includes(listener2));
    });

    it('이벤트 존재 여부를 확인할 수 있어야 한다', () => {
      eventBus.on('exists:test', () => {});
      
      assert.strictEqual(eventBus.hasEvent('exists:test'), true);
      assert.strictEqual(eventBus.hasEvent('nonexistent'), false);
    });
  });

  describe('설정 관리', () => {
    it('최대 리스너 수를 설정할 수 있어야 한다', () => {
      eventBus.setMaxListeners(2);
      
      // 최대치를 초과하면 경고 (실제로는 콘솔에 출력)
      eventBus.on('max:test', () => {});
      eventBus.on('max:test', () => {});
      eventBus.on('max:test', () => {}); // 이때 경고 발생
      
      assert.strictEqual(eventBus.listenerCount('max:test'), 3);
    });

    it('디버그 모드를 설정할 수 있어야 한다', () => {
      eventBus.setDebug(true);
      // 디버그 모드에서는 콘솔 출력이 있지만 테스트에서는 확인하지 않음
      
      eventBus.on('debug:test', () => {});
      eventBus.emit('debug:test');
      
      assert.strictEqual(eventBus.listenerCount('debug:test'), 1);
    });
  });

  describe('통계 및 유틸리티', () => {
    it('통계 정보를 조회할 수 있어야 한다', () => {
      eventBus.on('stats1', () => {});
      eventBus.on('stats1', () => {});
      eventBus.on('stats2', () => {});
      
      const stats = eventBus.getStatistics();
      
      assert.strictEqual(stats.totalEvents, 2);
      assert.strictEqual(stats.totalListeners, 3);
      assert.strictEqual(stats.events.stats1, 2);
      assert.strictEqual(stats.events.stats2, 1);
    });

    it('상태를 리셋할 수 있어야 한다', () => {
      eventBus.on('reset:test', () => {});
      eventBus.setMaxListeners(50);
      eventBus.setDebug(true);
      
      eventBus.reset();
      
      assert.strictEqual(eventBus.eventNames().length, 0);
      assert.strictEqual(eventBus.maxListeners, 100);
      assert.strictEqual(eventBus.debug, false);
    });
  });

  describe('고급 기능', () => {
    it('이벤트 대기 기능이 작동해야 한다', async () => {
      setTimeout(() => {
        eventBus.emit('wait:test', 'test data');
      }, 10);
      
      const result = await eventBus.waitFor('wait:test');
      assert.strictEqual(result, 'test data');
    });

    it('이벤트 대기 타임아웃이 작동해야 한다', async () => {
      await assert.rejects(
        () => eventBus.waitFor('timeout:test', 10),
        { message: "Event 'timeout:test' timeout after 10ms" }
      );
    });

    it('이벤트 파이프라인이 작동해야 한다', () => {
      let receivedEvents = [];
      
      const removePipeline = eventBus.pipeline(
        ['pipe1', 'pipe2', 'pipe3'],
        (event, index, ...args) => {
          receivedEvents.push({ event, index, args });
        }
      );
      
      eventBus.emit('pipe1', 'data1');
      eventBus.emit('pipe2', 'data2');
      eventBus.emit('pipe3', 'data3');
      
      assert.strictEqual(receivedEvents.length, 3);
      assert.strictEqual(receivedEvents[0].event, 'pipe1');
      assert.strictEqual(receivedEvents[1].index, 1);
      assert.deepStrictEqual(receivedEvents[2].args, ['data3']);
      
      removePipeline();
      
      // 파이프라인 제거 후 이벤트가 처리되지 않아야 함
      eventBus.emit('pipe1', 'data4');
      assert.strictEqual(receivedEvents.length, 3);
    });
  });

  describe('입력 검증', () => {
    it('잘못된 이벤트 이름으로 오류가 발생해야 한다', () => {
      assert.throws(
        () => eventBus.on('', () => {}),
        { message: 'Event name must be a non-empty string' }
      );
      
      assert.throws(
        () => eventBus.on(123, () => {}),
        { message: 'Event name must be a non-empty string' }
      );
    });

    it('잘못된 콜백으로 오류가 발생해야 한다', () => {
      assert.throws(
        () => eventBus.on('test', 'not a function'),
        { message: 'Callback must be a function' }
      );
      
      assert.throws(
        () => eventBus.on('test', null),
        { message: 'Callback must be a function' }
      );
    });

    it('잘못된 최대 리스너 수로 오류가 발생해야 한다', () => {
      assert.throws(
        () => eventBus.setMaxListeners(-1),
        { message: 'Max listeners must be a non-negative number' }
      );
      
      assert.throws(
        () => eventBus.setMaxListeners('invalid'),
        { message: 'Max listeners must be a non-negative number' }
      );
    });
  });
});