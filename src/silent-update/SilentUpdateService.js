/**
 * Silent Update Service
 * 
 * bpmn-js의 EventBus를 우회하여 원격 변경사항을 로컬 모델에 적용하는 서비스
 * 이벤트 발생 없이 BusinessObject와 시각적 속성을 직접 업데이트
 */
export class SilentUpdateService {
  constructor(modeler) {
    this.modeler = modeler;
    this.canvas = modeler.get('canvas');
    this.elementRegistry = modeler.get('elementRegistry');
    this.graphicsFactory = modeler.get('graphicsFactory');
    this.eventBus = modeler.get('eventBus');
    
    // 렌더링 제어 상태
    this.isRenderingSuspended = false;
  }

  /**
   * BusinessObject 속성을 직접 업데이트 (이벤트 없음)
   * @param {string} elementId - 업데이트할 요소 ID
   * @param {Object} properties - 업데이트할 속성들
   * @returns {Object|null} 업데이트된 요소 또는 null
   */
  updateBusinessObject(elementId, properties) {
    try {
      const element = this.elementRegistry.get(elementId);
      if (!element || !element.businessObject) {
        console.warn(`Element not found: ${elementId}`);
        return null;
      }

      // businessObject 직접 수정 (이벤트 발생 없음)
      Object.assign(element.businessObject, properties);

      // 그래픽스 업데이트
      this.updateGraphicsSilently(element);

      return element;
    } catch (error) {
      console.error('Error updating business object:', error);
      return null;
    }
  }

  /**
   * 시각적 속성을 직접 업데이트 (이벤트 없음)
   * @param {string} elementId - 업데이트할 요소 ID
   * @param {Object} visualProps - 시각적 속성 (x, y, width, height 등)
   * @returns {Object|null} 업데이트된 요소 또는 null
   */
  updateVisualProperties(elementId, visualProps) {
    try {
      const element = this.elementRegistry.get(elementId);
      if (!element) {
        console.warn(`Element not found: ${elementId}`);
        return null;
      }

      // 시각적 속성 직접 업데이트
      Object.assign(element, visualProps);

      // 그래픽스 강제 업데이트
      this.updateGraphicsSilently(element);

      return element;
    } catch (error) {
      console.error('Error updating visual properties:', error);
      return null;
    }
  }

  /**
   * 그래픽스를 Silent하게 업데이트
   * @param {Object} element - 업데이트할 요소
   */
  updateGraphicsSilently(element) {
    try {
      const gfx = this.elementRegistry.getGraphics(element);
      if (gfx) {
        // 그래픽스 팩토리를 사용한 직접 업데이트
        const elementType = element.waypoints ? 'connection' : 'shape';
        this.graphicsFactory.update(elementType, element, gfx);
      }
    } catch (error) {
      console.error('Error updating graphics silently:', error);
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
        switch (update.type) {
          case 'business':
            this.updateBusinessObject(update.elementId, update.properties);
            break;
          case 'visual':
            this.updateVisualProperties(update.elementId, update.properties);
            break;
          case 'marker':
            this.canvas.addMarker(update.elementId, update.marker);
            break;
          case 'removeMarker':
            this.canvas.removeMarker(update.elementId, update.marker);
            break;
          default:
            console.warn('Unknown update type:', update.type);
        }
      });
    } finally {
      // 렌더링 재개
      this.resumeRendering();
    }
  }

  /**
   * 렌더링 일시 중단
   */
  suspendRendering() {
    if (this.canvas._suspendRendering !== undefined) {
      this.canvas._suspendRendering = true;
      this.isRenderingSuspended = true;
    }
  }

  /**
   * 렌더링 재개 및 강제 리렌더링
   */
  resumeRendering() {
    if (this.isRenderingSuspended) {
      if (this.canvas._suspendRendering !== undefined) {
        this.canvas._suspendRendering = false;
      }
      this.isRenderingSuspended = false;
      
      // 강제 리렌더링
      this.forceRedraw();
    }
  }

  /**
   * 캔버스 강제 리렌더링
   */
  forceRedraw() {
    try {
      if (this.canvas._redraw) {
        this.canvas._redraw();
      } else if (this.canvas.redraw) {
        this.canvas.redraw();
      }
    } catch (error) {
      console.error('Error during force redraw:', error);
    }
  }

  /**
   * 요소 마커 추가 (Silent)
   * @param {string} elementId - 요소 ID
   * @param {string} marker - 마커 클래스
   */
  addMarkerSilently(elementId, marker) {
    try {
      this.canvas.addMarker(elementId, marker);
    } catch (error) {
      console.error('Error adding marker silently:', error);
    }
  }

  /**
   * 요소 마커 제거 (Silent)
   * @param {string} elementId - 요소 ID
   * @param {string} marker - 마커 클래스
   */
  removeMarkerSilently(elementId, marker) {
    try {
      this.canvas.removeMarker(elementId, marker);
    } catch (error) {
      console.error('Error removing marker silently:', error);
    }
  }

  /**
   * 모든 요소의 그래픽스 강제 업데이트
   */
  refreshAllGraphics() {
    this.suspendRendering();
    
    try {
      const elements = this.elementRegistry.getAll();
      elements.forEach(element => {
        this.updateGraphicsSilently(element);
      });
    } finally {
      this.resumeRendering();
    }
  }

  /**
   * 서비스 정리
   */
  destroy() {
    // 렌더링이 중단된 상태라면 재개
    if (this.isRenderingSuspended) {
      this.resumeRendering();
    }
  }
}