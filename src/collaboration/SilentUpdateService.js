/**
 * Silent Update Service
 * 
 * bpmn-js의 내부 API를 직접 조작하여 이벤트 발생 없이 모델을 업데이트하는 서비스.
 * 원격 협업 변경사항을 로컬에 반영할 때 commandStack이나 element 이벤트를 
 * 발생시키지 않도록 하여 무한 루프를 방지합니다.
 */
export class SilentUpdateService {
  constructor(modeler) {
    this.modeler = modeler;
    this.canvas = modeler.get('canvas');
    this.elementRegistry = modeler.get('elementRegistry');
    this.graphicsFactory = modeler.get('graphicsFactory');
    this.eventBus = modeler.get('eventBus');
    
    // 렌더링 상태 관리
    this.isRenderingSuspended = false;
    this.pendingUpdates = [];
  }

  /**
   * BusinessObject 속성을 직접 업데이트 (이벤트 없음)
   * @param {string} elementId - 업데이트할 요소 ID
   * @param {Object} properties - 업데이트할 속성들
   * @returns {Object|null} 업데이트된 요소 또는 null
   */
  updateBusinessObject(elementId, properties) {
    const element = this.elementRegistry.get(elementId);
    if (!element) {
      console.warn(`SilentUpdateService: Element ${elementId} not found`);
      return null;
    }

    try {
      // businessObject 직접 수정 (이벤트 발생 없음)
      Object.assign(element.businessObject, properties);
      
      // 그래픽스 업데이트
      this.updateGraphicsSilently(element);
      
      return element;
    } catch (error) {
      console.error('SilentUpdateService: Error updating business object:', error);
      return null;
    }
  }

  /**
   * 시각적 속성을 직접 업데이트 (위치, 크기 등)
   * @param {string} elementId - 업데이트할 요소 ID
   * @param {Object} visualProps - 시각적 속성들 (x, y, width, height 등)
   * @returns {Object|null} 업데이트된 요소 또는 null
   */
  updateVisualProperties(elementId, visualProps) {
    const element = this.elementRegistry.get(elementId);
    if (!element) {
      console.warn(`SilentUpdateService: Element ${elementId} not found`);
      return null;
    }

    try {
      // 시각적 속성 직접 업데이트
      Object.assign(element, visualProps);
      
      // 그래픽스 강제 업데이트
      this.updateGraphicsSilently(element);
      
      return element;
    } catch (error) {
      console.error('SilentUpdateService: Error updating visual properties:', error);
      return null;
    }
  }

  /**
   * 그래픽스를 직접 업데이트 (이벤트 없음)
   * @param {Object} element - 업데이트할 요소
   */
  updateGraphicsSilently(element) {
    try {
      const gfx = this.elementRegistry.getGraphics(element);
      if (gfx && this.graphicsFactory.update) {
        // 그래픽스 팩토리를 사용한 직접 업데이트
        this.graphicsFactory.update('shape', element, gfx);
      }
    } catch (error) {
      console.error('SilentUpdateService: Error updating graphics:', error);
    }
  }

  /**
   * 여러 업데이트를 배치로 처리
   * @param {Array} updates - 업데이트 배열
   */
  batchUpdate(updates) {
    if (!Array.isArray(updates) || updates.length === 0) {
      return;
    }

    // 렌더링 일시 중단
    this.suspendRendering();
    
    try {
      updates.forEach(update => {
        switch(update.type) {
          case 'business':
            this.updateBusinessObject(update.elementId, update.properties);
            break;
          case 'visual':
            this.updateVisualProperties(update.elementId, update.properties);
            break;
          case 'marker':
            this.addMarkerSilently(update.elementId, update.marker);
            break;
          default:
            console.warn('SilentUpdateService: Unknown update type:', update.type);
        }
      });
    } finally {
      this.resumeRendering();
    }
  }

  /**
   * 마커를 조용히 추가
   * @param {string} elementId - 요소 ID
   * @param {string} marker - 마커 클래스
   */
  addMarkerSilently(elementId, marker) {
    try {
      this.canvas.addMarker(elementId, marker);
    } catch (error) {
      console.error('SilentUpdateService: Error adding marker:', error);
    }
  }

  /**
   * 마커를 조용히 제거
   * @param {string} elementId - 요소 ID
   * @param {string} marker - 마커 클래스
   */
  removeMarkerSilently(elementId, marker) {
    try {
      this.canvas.removeMarker(elementId, marker);
    } catch (error) {
      console.error('SilentUpdateService: Error removing marker:', error);
    }
  }

  /**
   * 렌더링 일시 중단
   */
  suspendRendering() {
    if (this.canvas && !this.isRenderingSuspended) {
      this.isRenderingSuspended = true;
      // canvas의 내부 렌더링 플래그 설정
      if (this.canvas._suspendRendering !== undefined) {
        this.canvas._suspendRendering = true;
      }
    }
  }

  /**
   * 렌더링 재개 및 강제 리렌더링
   */
  resumeRendering() {
    if (this.canvas && this.isRenderingSuspended) {
      this.isRenderingSuspended = false;
      
      // canvas의 내부 렌더링 플래그 해제
      if (this.canvas._suspendRendering !== undefined) {
        this.canvas._suspendRendering = false;
      }
      
      // 강제 리렌더링
      this.forceRedraw();
    }
  }

  /**
   * 캔버스 강제 리렌더링
   */
  forceRedraw() {
    try {
      if (this.canvas && typeof this.canvas._redraw === 'function') {
        this.canvas._redraw();
      }
    } catch (error) {
      console.error('SilentUpdateService: Error forcing redraw:', error);
    }
  }

  /**
   * 특정 요소만 강제 업데이트
   * @param {string} elementId - 요소 ID
   */
  forceElementUpdate(elementId) {
    const element = this.elementRegistry.get(elementId);
    if (element) {
      this.updateGraphicsSilently(element);
    }
  }

  /**
   * 서비스 정리 및 리소스 해제
   */
  destroy() {
    this.pendingUpdates = [];
    this.modeler = null;
    this.canvas = null;
    this.elementRegistry = null;
    this.graphicsFactory = null;
    this.eventBus = null;
  }
}

export default SilentUpdateService;