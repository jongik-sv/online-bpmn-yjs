/**
 * Model Manipulation Module
 * 
 * 직접 모델 조작 서비스들을 내보내는 인덱스 파일
 */

export { DirectModelManipulator } from './DirectModelManipulator.js';
export { ModelTreeManipulator } from './ModelTreeManipulator.js';

/**
 * Model Manipulation 서비스 팩토리
 * bpmn-js modeler 인스턴스를 받아 모델 조작 서비스들을 초기화
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @returns {Object} 모델 조작 서비스들
 */
export function createModelManipulationServices(modeler) {
  const directModelManipulator = new DirectModelManipulator(modeler);
  const modelTreeManipulator = new ModelTreeManipulator(modeler);

  return {
    directModelManipulator,
    modelTreeManipulator,
    
    // 편의 메서드들
    createElement: (type, properties, position, parent, dimensions) => {
      return directModelManipulator.createCompleteElement(type, properties, position, parent, dimensions);
    },
    
    deleteElement: (element) => {
      return directModelManipulator.deleteElementCompletely(element);
    },
    
    cloneElement: (sourceElement, position, parent) => {
      return directModelManipulator.cloneElement(sourceElement, position, parent);
    },
    
    createConnection: (sourceId, targetId, type, properties) => {
      return modelTreeManipulator.createConnection(sourceId, targetId, type, properties);
    },
    
    setParentChild: (parentId, childId) => {
      return modelTreeManipulator.setParentChild(parentId, childId);
    },
    
    moveElement: (elementId, newParentId) => {
      return modelTreeManipulator.moveElement(elementId, newParentId);
    },
    
    getTreeStructure: (rootElement) => {
      return modelTreeManipulator.getTreeStructure(rootElement);
    },
    
    getAllConnections: (elementId) => {
      return modelTreeManipulator.getAllConnections(elementId);
    },
    
    // 배치 작업 메서드들
    createMultipleElements: (elementSpecs) => {
      return directModelManipulator.createMultipleElements(elementSpecs);
    },
    
    createWorkflow: (workflowSpec) => {
      return createWorkflowFromSpec(directModelManipulator, modelTreeManipulator, workflowSpec);
    },
    
    // 정리 메서드
    destroy: () => {
      // 필요한 경우 정리 작업 수행
    }
  };
}

/**
 * 워크플로우 명세에서 완전한 BPMN 다이어그램 생성
 * @param {DirectModelManipulator} directManipulator - 직접 모델 조작기
 * @param {ModelTreeManipulator} treeManipulator - 트리 조작기
 * @param {Object} workflowSpec - 워크플로우 명세
 * @returns {Object} 생성된 워크플로우 정보
 */
function createWorkflowFromSpec(directManipulator, treeManipulator, workflowSpec) {
  try {
    const createdElements = {};
    const createdConnections = [];

    // 1. 모든 요소 생성
    if (workflowSpec.elements) {
      workflowSpec.elements.forEach(elementSpec => {
        const element = directManipulator.createCompleteElement(
          elementSpec.type,
          elementSpec.properties || {},
          elementSpec.position || {},
          elementSpec.parent,
          elementSpec.dimensions
        );
        
        if (element) {
          createdElements[elementSpec.id || element.id] = element;
        }
      });
    }

    // 2. 연결 생성
    if (workflowSpec.connections) {
      workflowSpec.connections.forEach(connectionSpec => {
        const sourceElement = createdElements[connectionSpec.sourceId];
        const targetElement = createdElements[connectionSpec.targetId];
        
        if (sourceElement && targetElement) {
          const connection = treeManipulator.createConnection(
            sourceElement.id,
            targetElement.id,
            connectionSpec.type || 'bpmn:SequenceFlow',
            connectionSpec.properties || {}
          );
          
          if (connection) {
            createdConnections.push(connection);
          }
        }
      });
    }

    // 3. 특별한 관계 설정 (부모-자식, 등)
    if (workflowSpec.relationships) {
      workflowSpec.relationships.forEach(relationship => {
        switch (relationship.type) {
          case 'parent-child':
            treeManipulator.setParentChild(relationship.parentId, relationship.childId);
            break;
          // 필요에 따라 다른 관계 타입 추가
        }
      });
    }

    return {
      elements: createdElements,
      connections: createdConnections,
      success: true
    };
  } catch (error) {
    console.error('Error creating workflow from spec:', error);
    return {
      elements: {},
      connections: [],
      success: false,
      error: error.message
    };
  }
}

/**
 * 표준 BPMN 워크플로우 템플릿들
 */
export const WorkflowTemplates = {
  /**
   * 간단한 선형 워크플로우
   * @param {Object} position - 시작 위치
   * @returns {Object} 워크플로우 명세
   */
  createLinearWorkflow: (position = { x: 100, y: 100 }) => ({
    elements: [
      {
        id: 'start',
        type: 'bpmn:StartEvent',
        properties: { name: 'Start' },
        position: { x: position.x, y: position.y }
      },
      {
        id: 'task1',
        type: 'bpmn:Task',
        properties: { name: 'Task 1' },
        position: { x: position.x + 150, y: position.y - 22 }
      },
      {
        id: 'task2',
        type: 'bpmn:Task',
        properties: { name: 'Task 2' },
        position: { x: position.x + 300, y: position.y - 22 }
      },
      {
        id: 'end',
        type: 'bpmn:EndEvent',
        properties: { name: 'End' },
        position: { x: position.x + 450, y: position.y }
      }
    ],
    connections: [
      { sourceId: 'start', targetId: 'task1' },
      { sourceId: 'task1', targetId: 'task2' },
      { sourceId: 'task2', targetId: 'end' }
    ]
  }),

  /**
   * 분기가 있는 워크플로우
   * @param {Object} position - 시작 위치
   * @returns {Object} 워크플로우 명세
   */
  createBranchingWorkflow: (position = { x: 100, y: 100 }) => ({
    elements: [
      {
        id: 'start',
        type: 'bpmn:StartEvent',
        properties: { name: 'Start' },
        position: { x: position.x, y: position.y }
      },
      {
        id: 'gateway',
        type: 'bpmn:ExclusiveGateway',
        properties: { name: 'Decision' },
        position: { x: position.x + 150, y: position.y - 7 }
      },
      {
        id: 'taskA',
        type: 'bpmn:Task',
        properties: { name: 'Task A' },
        position: { x: position.x + 250, y: position.y - 62 }
      },
      {
        id: 'taskB',
        type: 'bpmn:Task',
        properties: { name: 'Task B' },
        position: { x: position.x + 250, y: position.y + 18 }
      },
      {
        id: 'end',
        type: 'bpmn:EndEvent',
        properties: { name: 'End' },
        position: { x: position.x + 400, y: position.y }
      }
    ],
    connections: [
      { sourceId: 'start', targetId: 'gateway' },
      { sourceId: 'gateway', targetId: 'taskA' },
      { sourceId: 'gateway', targetId: 'taskB' },
      { sourceId: 'taskA', targetId: 'end' },
      { sourceId: 'taskB', targetId: 'end' }
    ]
  })
};