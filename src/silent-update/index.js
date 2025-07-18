/**
 * Silent Update Module
 * 
 * Silent Update 아키텍처의 핵심 서비스들을 내보내는 인덱스 파일
 */

export { SilentUpdateService } from './SilentUpdateService.js';
export { EventBusManager } from './EventBusManager.js';

/**
 * Silent Update 모듈 팩토리
 * bpmn-js modeler 인스턴스를 받아 모든 Silent Update 서비스를 초기화
 * @param {Object} modeler - bpmn-js modeler 인스턴스
 * @returns {Object} Silent Update 서비스들
 */
export function createSilentUpdateServices(modeler) {
  const silentUpdateService = new SilentUpdateService(modeler);
  const eventBusManager = new EventBusManager(modeler);

  return {
    silentUpdateService,
    eventBusManager,
    
    // 편의 메서드들
    updateSilently: (elementId, properties, type = 'business') => {
      return eventBusManager.withSilentMode(() => {
        if (type === 'business') {
          return silentUpdateService.updateBusinessObject(elementId, properties);
        } else if (type === 'visual') {
          return silentUpdateService.updateVisualProperties(elementId, properties);
        }
      });
    },
    
    batchUpdateSilently: (updates) => {
      return eventBusManager.withSilentMode(() => {
        return silentUpdateService.batchUpdate(updates);
      });
    },
    
    // 정리 메서드
    destroy: () => {
      silentUpdateService.destroy();
      eventBusManager.destroy();
    }
  };
}