/**
 * 문서 관리자
 * BPMN 문서의 생명주기와 저장소 관리
 */

// Y.js import 제거 (중복 import 문제 해결)

export class DocumentManager {
  constructor(options = {}) {
    this.options = {
      maxDocuments: 100,
      documentTimeout: 3600000, // 1시간
      enablePersistence: false,
      persistenceInterval: 30000, // 30초
      enableVersioning: true,
      maxVersions: 50,
      ...options
    };

    this.logger = options.logger;
    
    // Y.js 문서들
    this.documents = new Map();
    
    // 문서 메타데이터
    this.documentMetadata = new Map();
    
    // 문서 버전 히스토리
    this.versionHistory = new Map();
    
    // 지속성 타이머
    this.persistenceTimer = null;
    
    // 메트릭스
    this.metrics = {
      totalDocuments: 0,
      activeDocuments: 0,
      totalVersions: 0,
      lastPersistence: null,
      storageSize: 0
    };

    this.isInitialized = false;
  }

  /**
   * 문서 관리자 초기화
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing DocumentManager...');
      
      // 지속성 활성화
      if (this.options.enablePersistence) {
        this._startPersistenceTimer();
      }
      
      this.isInitialized = true;
      this.logger.info('DocumentManager initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize DocumentManager:', error);
      throw error;
    }
  }

  /**
   * 새 문서 생성
   * @param {string} name - 문서 이름
   * @param {Object} initialData - 초기 데이터
   * @returns {Object} 생성된 문서 정보
   */
  async createDocument(name, initialData = null) {
    if (this.documents.size >= this.options.maxDocuments) {
      throw new Error('Maximum number of documents reached');
    }

    const documentId = this._generateDocumentId();
    
    // Y.js 문서 생성
    const yjsDoc = new Y.Doc();
    
    // 초기 데이터 설정
    if (initialData) {
      this._setInitialData(yjsDoc, initialData);
    }
    
    // 문서 메타데이터
    const metadata = {
      id: documentId,
      name: name || `Document ${documentId}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAccessed: Date.now(),
      version: 1,
      size: 0,
      activeUsers: 0,
      totalEdits: 0,
      status: 'active',
      creator: null // 실제 구현에서는 인증된 사용자 정보
    };

    this.documents.set(documentId, yjsDoc);
    this.documentMetadata.set(documentId, metadata);
    
    // 버전 히스토리 초기화
    if (this.options.enableVersioning) {
      this.versionHistory.set(documentId, [{
        version: 1,
        timestamp: Date.now(),
        size: 0,
        description: 'Initial version'
      }]);
    }

    // Y.js 이벤트 리스너 설정
    this._setupDocumentListeners(documentId, yjsDoc);

    this.metrics.totalDocuments++;
    this.metrics.activeDocuments++;

    this.logger.info(`Document created: ${documentId} (${name})`);
    
    return {
      id: documentId,
      ...metadata,
      url: `/api/documents/${documentId}`
    };
  }

  /**
   * 문서 조회
   * @param {string} documentId - 문서 ID
   * @returns {Object|null} 문서 정보
   */
  async getDocument(documentId) {
    const yjsDoc = this.documents.get(documentId);
    const metadata = this.documentMetadata.get(documentId);
    
    if (!yjsDoc || !metadata) {
      return null;
    }

    // 접근 시간 업데이트
    metadata.lastAccessed = Date.now();
    
    return {
      id: documentId,
      ...metadata,
      content: this._extractDocumentContent(yjsDoc),
      versions: this.options.enableVersioning ? 
        this.versionHistory.get(documentId) : null
    };
  }

  /**
   * Y.js 문서 직접 조회 (WebSocket용)
   * @param {string} documentId - 문서 ID
   * @returns {Y.Doc|null} Y.js 문서
   */
  getYjsDocument(documentId) {
    return this.documents.get(documentId) || null;
  }

  /**
   * 문서 목록 조회
   * @param {Object} filters - 필터 옵션
   * @returns {Array} 문서 목록
   */
  async getDocuments(filters = {}) {
    const documents = [];
    
    for (const [documentId, metadata] of this.documentMetadata.entries()) {
      // 필터 적용
      if (filters.status && metadata.status !== filters.status) {
        continue;
      }
      
      if (filters.activeOnly && metadata.activeUsers === 0) {
        continue;
      }
      
      documents.push({
        id: documentId,
        ...metadata,
        url: `/api/documents/${documentId}`
      });
    }
    
    // 정렬
    documents.sort((a, b) => b.updatedAt - a.updatedAt);
    
    return documents;
  }

  /**
   * 문서 업데이트
   * @param {string} documentId - 문서 ID
   * @param {Object} updates - 업데이트할 데이터
   */
  async updateDocument(documentId, updates) {
    const metadata = this.documentMetadata.get(documentId);
    const yjsDoc = this.documents.get(documentId);
    
    if (!metadata || !yjsDoc) {
      throw new Error('Document not found');
    }

    // 메타데이터 업데이트
    if (updates.name) {
      metadata.name = updates.name;
    }
    
    metadata.updatedAt = Date.now();
    metadata.totalEdits++;

    // 버전 생성 (중요한 변경사항인 경우)
    if (this.options.enableVersioning && updates.createVersion) {
      this._createVersion(documentId, updates.versionDescription);
    }

    this.logger.debug(`Document updated: ${documentId}`);
  }

  /**
   * 문서 삭제
   * @param {string} documentId - 문서 ID
   */
  async deleteDocument(documentId) {
    const yjsDoc = this.documents.get(documentId);
    const metadata = this.documentMetadata.get(documentId);
    
    if (!yjsDoc || !metadata) {
      throw new Error('Document not found');
    }

    // Y.js 문서 정리
    yjsDoc.destroy();
    
    // 데이터 제거
    this.documents.delete(documentId);
    this.documentMetadata.delete(documentId);
    
    if (this.options.enableVersioning) {
      this.versionHistory.delete(documentId);
    }

    this.metrics.activeDocuments--;

    this.logger.info(`Document deleted: ${documentId}`);
  }

  /**
   * 문서 크기 계산
   * @param {string} documentId - 문서 ID
   * @returns {number} 문서 크기 (바이트)
   */
  getDocumentSize(documentId) {
    const yjsDoc = this.documents.get(documentId);
    
    if (!yjsDoc) {
      return 0;
    }

    return Y.encodeStateAsUpdate(yjsDoc).length;
  }

  /**
   * 활성 사용자 수 업데이트
   * @param {string} documentId - 문서 ID
   * @param {number} userCount - 사용자 수
   */
  updateActiveUsers(documentId, userCount) {
    const metadata = this.documentMetadata.get(documentId);
    
    if (metadata) {
      metadata.activeUsers = userCount;
      metadata.lastAccessed = Date.now();
    }
  }

  /**
   * 메트릭스 조회
   * @returns {Object} 문서 메트릭스
   */
  getMetrics() {
    // 저장소 크기 계산
    let totalSize = 0;
    let totalVersions = 0;
    
    for (const documentId of this.documents.keys()) {
      totalSize += this.getDocumentSize(documentId);
    }
    
    for (const versions of this.versionHistory.values()) {
      totalVersions += versions.length;
    }

    return {
      ...this.metrics,
      activeDocuments: this.documents.size,
      totalVersions,
      storageSize: totalSize,
      averageDocumentSize: this.documents.size > 0 ? totalSize / this.documents.size : 0
    };
  }

  /**
   * 초기 데이터 설정
   * @private
   * @param {Y.Doc} yjsDoc - Y.js 문서
   * @param {Object} initialData - 초기 데이터
   */
  _setInitialData(yjsDoc, initialData) {
    if (initialData.bpmn) {
      // BPMN XML 데이터
      const yText = yjsDoc.getText('bpmn');
      yText.insert(0, initialData.bpmn);
    }
    
    if (initialData.elements) {
      // 요소 데이터
      const yMap = yjsDoc.getMap('elements');
      for (const [key, value] of Object.entries(initialData.elements)) {
        yMap.set(key, value);
      }
    }
    
    if (initialData.metadata) {
      // 메타데이터
      const yMap = yjsDoc.getMap('metadata');
      for (const [key, value] of Object.entries(initialData.metadata)) {
        yMap.set(key, value);
      }
    }
  }

  /**
   * 문서 이벤트 리스너 설정
   * @private
   * @param {string} documentId - 문서 ID
   * @param {Y.Doc} yjsDoc - Y.js 문서
   */
  _setupDocumentListeners(documentId, yjsDoc) {
    // 문서 업데이트 이벤트
    yjsDoc.on('update', (update, origin) => {
      const metadata = this.documentMetadata.get(documentId);
      
      if (metadata) {
        metadata.updatedAt = Date.now();
        metadata.size = this.getDocumentSize(documentId);
        
        if (origin && origin !== 'persistence') {
          metadata.totalEdits++;
        }
      }

      this.logger.debug(`Document ${documentId} updated, size: ${metadata?.size || 0} bytes`);
    });

    // 문서 삭제 이벤트
    yjsDoc.on('destroy', () => {
      this.logger.debug(`Y.js document destroyed: ${documentId}`);
    });
  }

  /**
   * 문서 내용 추출
   * @private
   * @param {Y.Doc} yjsDoc - Y.js 문서
   * @returns {Object} 문서 내용
   */
  _extractDocumentContent(yjsDoc) {
    const content = {};
    
    // BPMN 텍스트
    const bpmnText = yjsDoc.getText('bpmn');
    if (bpmnText.length > 0) {
      content.bpmn = bpmnText.toString();
    }
    
    // 요소 데이터
    const elementsMap = yjsDoc.getMap('elements');
    if (elementsMap.size > 0) {
      content.elements = elementsMap.toJSON();
    }
    
    // 메타데이터
    const metadataMap = yjsDoc.getMap('metadata');
    if (metadataMap.size > 0) {
      content.metadata = metadataMap.toJSON();
    }
    
    return content;
  }

  /**
   * 버전 생성
   * @private
   * @param {string} documentId - 문서 ID
   * @param {string} description - 버전 설명
   */
  _createVersion(documentId, description = '') {
    const metadata = this.documentMetadata.get(documentId);
    const versions = this.versionHistory.get(documentId) || [];
    
    if (!metadata) {
      return;
    }

    const newVersion = {
      version: metadata.version + 1,
      timestamp: Date.now(),
      size: this.getDocumentSize(documentId),
      description: description || `Version ${metadata.version + 1}`
    };

    versions.push(newVersion);
    metadata.version = newVersion.version;

    // 최대 버전 수 제한
    if (versions.length > this.options.maxVersions) {
      versions.shift();
    }

    this.versionHistory.set(documentId, versions);
    
    this.logger.debug(`Version created for document ${documentId}: v${newVersion.version}`);
  }

  /**
   * 지속성 타이머 시작
   * @private
   */
  _startPersistenceTimer() {
    this.persistenceTimer = setInterval(() => {
      this._persistDocuments();
    }, this.options.persistenceInterval);

    this.logger.info('Document persistence timer started');
  }

  /**
   * 문서 지속성 처리
   * @private
   */
  async _persistDocuments() {
    try {
      let persistedCount = 0;
      
      for (const [documentId, yjsDoc] of this.documents.entries()) {
        const metadata = this.documentMetadata.get(documentId);
        
        // 최근에 수정된 문서만 저장
        if (metadata && Date.now() - metadata.updatedAt < this.options.persistenceInterval * 2) {
          await this._persistDocument(documentId, yjsDoc);
          persistedCount++;
        }
      }

      if (persistedCount > 0) {
        this.metrics.lastPersistence = Date.now();
        this.logger.debug(`Persisted ${persistedCount} documents`);
      }
      
    } catch (error) {
      this.logger.error('Document persistence failed:', error);
    }
  }

  /**
   * 개별 문서 저장
   * @private
   * @param {string} documentId - 문서 ID
   * @param {Y.Doc} yjsDoc - Y.js 문서
   */
  async _persistDocument(documentId, yjsDoc) {
    // 실제 구현에서는 데이터베이스나 파일 시스템에 저장
    // 여기서는 로깅만 수행
    const size = this.getDocumentSize(documentId);
    this.logger.debug(`Persisting document ${documentId} (${size} bytes)`);
  }

  /**
   * 문서 ID 생성
   * @private
   * @returns {string} 문서 ID
   */
  _generateDocumentId() {
    return 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
  }

  /**
   * 문서 관리자 정리
   */
  async destroy() {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Destroying DocumentManager...');

    // 지속성 타이머 중지
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = null;
    }

    // 최종 저장
    if (this.options.enablePersistence) {
      await this._persistDocuments();
    }

    // 모든 Y.js 문서 정리
    for (const yjsDoc of this.documents.values()) {
      yjsDoc.destroy();
    }

    // 데이터 정리
    this.documents.clear();
    this.documentMetadata.clear();
    this.versionHistory.clear();

    this.isInitialized = false;
    this.logger.info('DocumentManager destroyed');
  }
}