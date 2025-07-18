/**
 * CommandStack 우회 시스템 테스트
 * 
 * CommandStack 분리와 Silent 명령 실행을 테스트하는 파일입니다.
 */

// 테스트용 함수들
window.testCommandStack = {
  
  /**
   * CommandStackManager 초기화 테스트
   */
  initTest: function(modeler) {
    console.log('=== CommandStack Manager 초기화 테스트 ===');
    
    try {
      const commandStackManager = new window.CommandStackManager(modeler);
      console.log('✅ CommandStackManager 초기화 성공');
      return commandStackManager;
    } catch (error) {
      console.error('❌ CommandStackManager 초기화 실패:', error);
      return null;
    }
  },

  /**
   * 사용자/협업 모드 전환 테스트
   */
  testModeSwitch: function(commandStackManager) {
    console.log('=== 사용자/협업 모드 전환 테스트 ===');
    
    try {
      // 초기 상태 확인 (사용자 모드)
      console.log('초기 모드:', commandStackManager.isUserAction ? '사용자' : '협업');
      
      // 협업 모드로 전환
      commandStackManager.enableCollaborationMode();
      console.log('협업 모드 전환 후:', commandStackManager.isUserAction ? '사용자' : '협업');
      
      // 사용자 모드로 복귀
      commandStackManager.enableUserMode();
      console.log('사용자 모드 복귀 후:', commandStackManager.isUserAction ? '사용자' : '협업');
      
      console.log('✅ 모드 전환 테스트 성공');
      return true;
    } catch (error) {
      console.error('❌ 모드 전환 테스트 실패:', error);
      return false;
    }
  },

  /**
   * CommandStack 비활성화 테스트
   */
  testCommandStackDisable: function(modeler, commandStackManager) {
    console.log('=== CommandStack 비활성화 테스트 ===');
    
    const modeling = modeler.get('modeling');
    const elementRegistry = modeler.get('elementRegistry');
    
    // 테스트할 요소 찾기
    const elements = elementRegistry.getAll();
    const task = elements.find(el => el.businessObject.$type === 'bpmn:Task');
    
    if (!task) {
      console.warn('⚠️ 테스트할 Task가 없습니다.');
      return false;
    }

    const originalName = task.businessObject.name || '';
    const testName = 'CommandStack Disabled Test - ' + Date.now();
    
    // Undo/Redo 상태 확인
    const beforeState = commandStackManager.getUndoRedoStatus();
    console.log('명령 실행 전 상태:', beforeState);
    
    try {
      // CommandStack 비활성화 상태에서 작업 실행
      const result = commandStackManager.executeWithoutCommands(() => {
        modeling.updateProperties(task, { name: testName });
      });
      
      // Undo/Redo 상태 재확인
      const afterState = commandStackManager.getUndoRedoStatus();
      console.log('명령 실행 후 상태:', afterState);
      
      // 스택 크기가 변경되지 않았는지 확인
      if (beforeState.stackSize === afterState.stackSize) {
        console.log('✅ CommandStack 비활성화 중 히스토리에 기록되지 않음');
      } else {
        console.error('❌ CommandStack 비활성화 실패 - 히스토리에 기록됨');
      }
      
      // 실제 변경사항 확인
      const updatedElement = elementRegistry.get(task.id);
      if (updatedElement.businessObject.name === testName) {
        console.log('✅ 비활성화 상태에서도 변경사항 적용됨');
      } else {
        console.error('❌ 변경사항 적용 실패');
      }
      
      // 원복
      modeling.updateProperties(task, { name: originalName });
      
      return true;
    } catch (error) {
      console.error('❌ CommandStack 비활성화 테스트 실패:', error);
      return false;
    }
  },

  /**
   * Silent Modeling 테스트
   */
  testSilentModeling: function(modeler) {
    console.log('=== Silent Modeling 테스트 ===');
    
    try {
      const silentModeling = new window.SilentModeling(modeler, null);
      
      // 새 요소 생성 테스트
      const newElement = silentModeling.createElementSilently(
        'bpmn:Task',
        { name: 'Silent Test Task' },
        { x: 300, y: 300 }
      );
      
      if (newElement) {
        console.log('✅ Silent 요소 생성 성공:', newElement.id);
        
        // 생성된 요소 확인
        const elementRegistry = modeler.get('elementRegistry');
        const createdElement = elementRegistry.get(newElement.id);
        
        if (createdElement) {
          console.log('✅ 생성된 요소가 레지스트리에 등록됨');
          
          // 요소 속성 업데이트 테스트
          silentModeling.updateElementPropertiesSilently(
            newElement.id,
            { name: 'Updated Silent Task' }
          );
          
          if (createdElement.businessObject.name === 'Updated Silent Task') {
            console.log('✅ Silent 속성 업데이트 성공');
          } else {
            console.error('❌ Silent 속성 업데이트 실패');
          }
          
          // 요소 이동 테스트
          silentModeling.moveElementSilently(newElement.id, { x: 400, y: 400 });
          
          if (createdElement.x === 400 && createdElement.y === 400) {
            console.log('✅ Silent 요소 이동 성공');
          } else {
            console.error('❌ Silent 요소 이동 실패');
          }
          
          // 정리: 생성된 요소 제거
          setTimeout(() => {
            silentModeling.removeElementSilently(newElement.id);
            console.log('🧹 테스트 요소 정리 완료');
          }, 1000);
          
        } else {
          console.error('❌ 생성된 요소가 레지스트리에 등록되지 않음');
        }
      } else {
        console.error('❌ Silent 요소 생성 실패');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Silent Modeling 테스트 실패:', error);
      return false;
    }
  },

  /**
   * CommandStack 유틸리티 테스트
   */
  testCommandStackUtils: function(modeler) {
    console.log('=== CommandStack 유틸리티 테스트 ===');
    
    const commandStack = modeler.get('commandStack');
    
    try {
      // 상태 정보 테스트
      const state = window.CommandStackUtils.getCommandStackState(commandStack);
      console.log('CommandStack 상태:', state);
      
      // 메모리 사용량 테스트
      const memoryUsage = window.CommandStackUtils.getCommandStackMemoryUsage(commandStack);
      console.log('메모리 사용량:', memoryUsage);
      
      // executeWithoutCommands 테스트
      const beforeStackSize = state.stackSize;
      
      window.CommandStackUtils.executeWithoutCommands(modeler, () => {
        console.log('CommandStack 비활성화 상태에서 작업 실행 중...');
      });
      
      const afterState = window.CommandStackUtils.getCommandStackState(commandStack);
      
      if (beforeStackSize === afterState.stackSize) {
        console.log('✅ executeWithoutCommands 테스트 성공');
      } else {
        console.error('❌ executeWithoutCommands 테스트 실패');
      }
      
      console.log('✅ CommandStack 유틸리티 테스트 완료');
      return true;
    } catch (error) {
      console.error('❌ CommandStack 유틸리티 테스트 실패:', error);
      return false;
    }
  },

  /**
   * 협업 명령 실행 테스트
   */
  testCollaborationCommand: function(modeler, commandStackManager) {
    console.log('=== 협업 명령 실행 테스트 ===');
    
    const elementRegistry = modeler.get('elementRegistry');
    const elements = elementRegistry.getAll();
    const task = elements.find(el => el.businessObject.$type === 'bpmn:Task');
    
    if (!task) {
      console.warn('⚠️ 테스트할 Task가 없습니다.');
      return false;
    }

    const originalName = task.businessObject.name || '';
    const testName = 'Collaboration Command Test - ' + Date.now();
    
    // Undo/Redo 상태 확인
    const beforeState = commandStackManager.getUndoRedoStatus();
    console.log('협업 명령 실행 전 상태:', beforeState);
    
    try {
      // 협업 명령 정의
      const collaborationCommand = {
        execute: function() {
          task.businessObject.name = testName;
          return task;
        },
        revert: function() {
          task.businessObject.name = originalName;
          return task;
        }
      };
      
      // 협업 명령 실행
      const result = commandStackManager.executeCollaborationCommand(
        collaborationCommand, 
        { target: task }
      );
      
      // Undo/Redo 상태 재확인
      const afterState = commandStackManager.getUndoRedoStatus();
      console.log('협업 명령 실행 후 상태:', afterState);
      
      // 실제 변경사항 확인
      if (task.businessObject.name === testName) {
        console.log('✅ 협업 명령 실행 성공');
      } else {
        console.error('❌ 협업 명령 실행 실패');
      }
      
      // 일반 사용자 명령과의 스택 분리 확인
      if (beforeState.stackSize === afterState.stackSize) {
        console.log('✅ 협업 명령이 사용자 스택에 영향을 주지 않음');
      } else {
        console.error('❌ 협업 명령이 사용자 스택에 영향을 줌');
      }
      
      // 협업 통계 확인
      const collaborationStats = commandStackManager.getCollaborationStats();
      console.log('협업 통계:', collaborationStats);
      
      // 원복
      task.businessObject.name = originalName;
      
      return true;
    } catch (error) {
      console.error('❌ 협업 명령 실행 테스트 실패:', error);
      return false;
    }
  },

  /**
   * 전체 테스트 실행
   */
  runAllTests: function(modeler) {
    console.log('🚀 CommandStack 우회 시스템 전체 테스트 시작');
    
    const commandStackManager = this.initTest(modeler);
    if (!commandStackManager) return;
    
    // 각 테스트를 순차적으로 실행
    setTimeout(() => this.testModeSwitch(commandStackManager), 500);
    setTimeout(() => this.testCommandStackDisable(modeler, commandStackManager), 1000);
    setTimeout(() => this.testSilentModeling(modeler), 1500);
    setTimeout(() => this.testCommandStackUtils(modeler), 2000);
    setTimeout(() => this.testCollaborationCommand(modeler, commandStackManager), 2500);
    
    setTimeout(() => {
      console.log('🏁 모든 CommandStack 테스트 완료');
      commandStackManager.destroy();
    }, 4000);
  }
};

// 사용법 안내
console.log(`
CommandStack 우회 시스템 테스트 사용법:

1. BPMN 모델러가 초기화된 후 실행:
   testCommandStack.runAllTests(modeler);

2. 개별 테스트 실행:
   const commandStackManager = testCommandStack.initTest(modeler);
   testCommandStack.testModeSwitch(commandStackManager);
`);

export default window.testCommandStack;