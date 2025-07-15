/**
 * BPMN Diff 기반 협업 동기화 시스템
 * 메인 엔트리 포인트
 */

export { BpmnDiffSync } from './core/BpmnDiffSync.js';
export { DiffSyncEngine } from './core/DiffSyncEngine.js';
export { BpmnStateExtractor } from './extractors/BpmnStateExtractor.js';
export { StandardDiffCalculator } from './calculators/StandardDiffCalculator.js';
export { BpmnDiffApplicator } from './applicators/BpmnDiffApplicator.js';
export { YjsAdapter } from './adapters/YjsAdapter.js';
export { PerformanceMonitor } from './plugins/PerformanceMonitor.js';

// 유틸리티
export { Logger } from './utils/Logger.js';
export { EventBus } from './utils/EventBus.js';
export { ComponentFactory } from './utils/ComponentFactory.js';

// 타입 정의 (JSDoc용)
/**
 * @typedef {Object} DiffSyncConfig
 * @property {EngineConfig} [engine] - 엔진 설정
 * @property {ExtractorConfig} [extractor] - 추출기 설정
 * @property {CalculatorConfig} [calculator] - 계산기 설정
 * @property {ApplicatorConfig} [applicator] - 적용기 설정
 * @property {AdapterConfig} [adapter] - 어댑터 설정
 * @property {PluginConfig[]} [plugins] - 플러그인 설정
 * @property {LoggingConfig} [logging] - 로깅 설정
 */

/**
 * @typedef {Object} DocumentState
 * @property {number} timestamp - 상태 타임스탬프
 * @property {string} version - 상태 버전
 * @property {string} clientId - 클라이언트 ID
 * @property {Object<string, ElementData>} elements - 요소 데이터
 * @property {DocumentMetadata} [metadata] - 메타데이터
 */

/**
 * @typedef {Object} DocumentDiff
 * @property {string} id - Diff ID
 * @property {number} timestamp - 생성 타임스탬프
 * @property {string} clientId - 클라이언트 ID
 * @property {string} fromVersion - 이전 버전
 * @property {string} toVersion - 현재 버전
 * @property {ElementData[]} added - 추가된 요소
 * @property {ModifiedElement[]} modified - 수정된 요소
 * @property {string[]} removed - 삭제된 요소 ID
 * @property {boolean} hasChanges - 변경 여부
 * @property {DiffStatistics} statistics - 통계 정보
 */

/**
 * @typedef {Object} SyncResult
 * @property {boolean} success - 성공 여부
 * @property {string} syncId - 동기화 ID
 * @property {number} timestamp - 동기화 타임스탬프
 * @property {Object} appliedChanges - 적용된 변경사항
 * @property {SyncError[]} errors - 오류 목록
 * @property {SyncWarning[]} warnings - 경고 목록
 * @property {Object} timing - 성능 정보
 */