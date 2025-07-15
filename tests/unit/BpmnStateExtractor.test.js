/**
 * BpmnStateExtractor 단위 테스트
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { BpmnStateExtractor } from '../../src/extractors/BpmnStateExtractor.js';

describe('BpmnStateExtractor', () => {
  let extractor;
  let mockModeler;
  let mockElementRegistry;
  let mockElements;

  beforeEach(() => {
    // Mock 요소들 생성
    mockElements = [
      {
        id: 'StartEvent_1',
        type: 'bpmn:StartEvent',
        x: 100,
        y: 100,
        width: 36,
        height: 36,
        businessObject: {
          id: 'StartEvent_1',
          name: 'Start Event',
          $type: 'bpmn:StartEvent'
        },
        parent: { id: 'Process_1' }
      },
      {
        id: 'Task_1',
        type: 'bpmn:Task',
        x: 200,
        y: 150,
        width: 100,
        height: 80,
        businessObject: {
          id: 'Task_1',
          name: 'User Task',
          $type: 'bpmn:Task',
          documentation: 'Task documentation'
        },
        parent: { id: 'Process_1' },
        incoming: [],
        outgoing: [{ id: 'SequenceFlow_1' }]
      },
      {
        id: 'SequenceFlow_1',
        type: 'bpmn:SequenceFlow',
        businessObject: {
          id: 'SequenceFlow_1',
          $type: 'bpmn:SequenceFlow'
        },
        source: { id: 'StartEvent_1' },
        target: { id: 'Task_1' },
        waypoints: [
          { x: 136, y: 118 },
          { x: 200, y: 190 }
        ]
      }
    ];

    // Mock element registry
    mockElementRegistry = {
      getAll: () => mockElements,
      get: (id) => mockElements.find(el => el.id === id)
    };

    // Mock modeler
    mockModeler = {
      get: (service) => {
        if (service === 'elementRegistry') {
          return mockElementRegistry;
        }
        return null;
      }
    };

    extractor = new BpmnStateExtractor();
  });

  describe('초기화', () => {
    it('기본 설정으로 생성되어야 한다', () => {
      assert.ok(extractor);
      assert.ok(extractor.options);
      assert.strictEqual(extractor.options.includeVisualInfo, true);
    });

    it('커스텀 설정으로 생성되어야 한다', () => {
      const customExtractor = new BpmnStateExtractor({
        includeVisualInfo: false,
        includeBusinessObjects: false
      });

      assert.strictEqual(customExtractor.options.includeVisualInfo, false);
      assert.strictEqual(customExtractor.options.includeBusinessObjects, false);
    });
  });

  describe('상태 추출', () => {
    it('기본 상태를 추출해야 한다', async () => {
      const context = {
        modeler: mockModeler,
        clientId: 'test-client'
      };

      const state = await extractor.extract(context);

      assert.ok(state);
      assert.ok(state.timestamp);
      assert.strictEqual(state.version, '1.0.0');
      assert.strictEqual(state.clientId, 'test-client');
      assert.ok(state.elements);
    });

    it('모든 요소를 포함해야 한다', async () => {
      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      assert.strictEqual(Object.keys(state.elements).length, 3);
      assert.ok(state.elements['StartEvent_1']);
      assert.ok(state.elements['Task_1']);
      assert.ok(state.elements['SequenceFlow_1']);
    });

    it('시각적 정보를 포함해야 한다', async () => {
      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      const taskElement = state.elements['Task_1'];
      assert.strictEqual(taskElement.x, 200);
      assert.strictEqual(taskElement.y, 150);
      assert.strictEqual(taskElement.width, 100);
      assert.strictEqual(taskElement.height, 80);
    });

    it('비즈니스 객체를 포함해야 한다', async () => {
      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      const taskElement = state.elements['Task_1'];
      assert.ok(taskElement.businessObject);
      assert.strictEqual(taskElement.businessObject.name, 'User Task');
      assert.strictEqual(taskElement.businessObject.documentation, 'Task documentation');
    });

    it('연결 정보를 포함해야 한다', async () => {
      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      const flowElement = state.elements['SequenceFlow_1'];
      assert.strictEqual(flowElement.source, 'StartEvent_1');
      assert.strictEqual(flowElement.target, 'Task_1');
      assert.ok(Array.isArray(flowElement.waypoints));
      assert.strictEqual(flowElement.waypoints.length, 2);
    });

    it('부모 관계를 포함해야 한다', async () => {
      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      const taskElement = state.elements['Task_1'];
      assert.strictEqual(taskElement.parent, 'Process_1');
    });
  });

  describe('필터링', () => {
    it('특정 타입의 요소만 포함할 수 있어야 한다', async () => {
      const filteredExtractor = new BpmnStateExtractor({
        includeTypes: ['bpmn:Task']
      });

      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await filteredExtractor.extract(context);

      assert.strictEqual(Object.keys(state.elements).length, 1);
      assert.ok(state.elements['Task_1']);
      assert.ok(!state.elements['StartEvent_1']);
      assert.ok(!state.elements['SequenceFlow_1']);
    });

    it('특정 타입의 요소를 제외할 수 있어야 한다', async () => {
      const filteredExtractor = new BpmnStateExtractor({
        excludeTypes: ['bpmn:SequenceFlow']
      });

      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await filteredExtractor.extract(context);

      assert.strictEqual(Object.keys(state.elements).length, 2);
      assert.ok(state.elements['StartEvent_1']);
      assert.ok(state.elements['Task_1']);
      assert.ok(!state.elements['SequenceFlow_1']);
    });

    it('시각적 정보를 제외할 수 있어야 한다', async () => {
      const filteredExtractor = new BpmnStateExtractor({
        includeVisualInfo: false
      });

      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await filteredExtractor.extract(context);

      const taskElement = state.elements['Task_1'];
      assert.ok(!('x' in taskElement));
      assert.ok(!('y' in taskElement));
      assert.ok(!('width' in taskElement));
      assert.ok(!('height' in taskElement));
    });

    it('비즈니스 객체를 제외할 수 있어야 한다', async () => {
      const filteredExtractor = new BpmnStateExtractor({
        includeBusinessObjects: false
      });

      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await filteredExtractor.extract(context);

      const taskElement = state.elements['Task_1'];
      assert.ok(!('businessObject' in taskElement));
    });
  });

  describe('메타데이터', () => {
    it('추출 메타데이터를 포함해야 한다', async () => {
      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      assert.ok(state.metadata);
      assert.ok(state.metadata.extractedAt);
      assert.strictEqual(state.metadata.elementCount, 3);
      assert.ok(state.metadata.elementTypes);
    });

    it('요소 타입별 개수를 계산해야 한다', async () => {
      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      const elementTypes = state.metadata.elementTypes;
      assert.strictEqual(elementTypes['bpmn:StartEvent'], 1);
      assert.strictEqual(elementTypes['bpmn:Task'], 1);
      assert.strictEqual(elementTypes['bpmn:SequenceFlow'], 1);
    });
  });

  describe('오류 처리', () => {
    it('modeler 없이 호출 시 오류가 발생해야 한다', async () => {
      await assert.rejects(
        () => extractor.extract({}),
        { message: 'Modeler not provided in context' }
      );
    });

    it('elementRegistry 없이 호출 시 오류가 발생해야 한다', async () => {
      const invalidModeler = {
        get: () => null
      };

      await assert.rejects(
        () => extractor.extract({ modeler: invalidModeler }),
        { message: 'ElementRegistry not available' }
      );
    });

    it('요소 처리 중 오류가 발생해도 계속 진행해야 한다', async () => {
      // 잘못된 요소 추가
      const invalidElement = {
        id: 'invalid-element',
        type: null, // 잘못된 타입
        businessObject: null
      };

      mockElementRegistry.getAll = () => [...mockElements, invalidElement];

      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await extractor.extract(context);

      // 유효한 요소들은 여전히 추출되어야 함
      assert.ok(state.elements['Task_1']);
      assert.strictEqual(Object.keys(state.elements).length, 3); // 유효한 요소만
    });
  });

  describe('성능', () => {
    it('대량의 요소를 처리할 수 있어야 한다', async () => {
      // 100개의 요소 생성
      const manyElements = [];
      for (let i = 0; i < 100; i++) {
        manyElements.push({
          id: `Element_${i}`,
          type: 'bpmn:Task',
          x: i * 10,
          y: i * 10,
          width: 100,
          height: 80,
          businessObject: {
            id: `Element_${i}`,
            $type: 'bpmn:Task'
          }
        });
      }

      mockElementRegistry.getAll = () => manyElements;

      const context = { modeler: mockModeler, clientId: 'test-client' };
      const startTime = Date.now();
      
      const state = await extractor.extract(context);
      
      const duration = Date.now() - startTime;
      
      assert.strictEqual(Object.keys(state.elements).length, 100);
      assert.ok(duration < 1000); // 1초 이내에 완료되어야 함
    });
  });

  describe('커스텀 속성', () => {
    it('커스텀 속성을 추출할 수 있어야 한다', async () => {
      // 커스텀 속성이 있는 요소
      const elementWithCustomProps = {
        ...mockElements[1],
        customData: {
          priority: 'high',
          assignee: 'john.doe'
        }
      };

      mockElementRegistry.getAll = () => [elementWithCustomProps];

      const customExtractor = new BpmnStateExtractor({
        includeCustomProperties: true
      });

      const context = { modeler: mockModeler, clientId: 'test-client' };
      const state = await customExtractor.extract(context);

      const element = state.elements['Task_1'];
      assert.ok(element.customData);
      assert.strictEqual(element.customData.priority, 'high');
      assert.strictEqual(element.customData.assignee, 'john.doe');
    });
  });
});