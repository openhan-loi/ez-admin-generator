// ========== App State Management ==========
const AppState = {
	currentStep: 1,
	selectedWholesaler: null, // 전역 기본 도매인
	wholesalers: [],
	uploadedFiles: [], // 여러 파일 저장
	analyzedData: [],
	sheetWholesalers: {}, // { "fileName_sheetName": "wholesalerName" }

	init() {
		// 0. 사용자 식별 ID 생성 (세션 유지용)
		if (!localStorage.getItem('ez_user_id')) {
			localStorage.setItem('ez_user_id', 'User_' + Math.random().toString(36).substr(2, 5));
		}
		this.userId = localStorage.getItem('ez_user_id');

		// 1. 데이터 먼저 로드 (새로고침 시 사라짐 방지 최우선)
		this.loadWholesalers();

		// 2. UI 및 탭 즉시 초기화
		this.initTabs();
		FileHandler.init();
		WholesalerManager.init();
		EventListeners.init();

		// 3. DB 관련 초기화 (백그라운드 처리)
		DatabaseManager.init(() => {
			this.updateDBStats();
		});
	},

	initTabs() {
		document.querySelectorAll('.tab-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				const tabId = btn.getAttribute('data-tab');
				this.switchTab(tabId);
			});
		});
	},

	switchTab(tabId) {
		// 1. 모든 탭 버튼 및 컨텐츠 비활성화
		document.querySelectorAll('.tab-btn').forEach((b) => {
			b.classList.remove('active');
			if (b.getAttribute('data-tab') === tabId) b.classList.add('active');
		});
		document.querySelectorAll('.tab-content').forEach((c) => {
			c.classList.remove('active');
		});

		// 2. 타겟 탭 활성화
		const targetContent = document.getElementById(tabId);
		if (targetContent) {
			targetContent.classList.add('active');

			// [버그 수정] 모든 내부 섹션에 active를 강제로 주는 대신,
			// 만약 활성화된 섹션이 하나도 없다면 첫 번째 섹션만 활성화합니다.
			// 이를 통해 분석 탭 등 여러 섹션이 공존하는 곳에서 UI가 겹치는 문제를 방지합니다.
			const activeSections = targetContent.querySelectorAll('.section.active');
			if (activeSections.length === 0) {
				const firstSection = targetContent.querySelector('.section');
				if (firstSection) firstSection.classList.add('active');
			}
		}

		// 3. 플로팅 버튼 가시성 제어 (분석 및 매핑 탭에서 허용)
		const floatingContainer = document.querySelector('.action-buttons.middle');
		if (floatingContainer) {
			if (tabId === 'analysis-tab' || tabId === 'mapping-tab') {
				floatingContainer.style.display = 'flex';
			} else {
				floatingContainer.style.display = 'none';
			}
		}

		// 4. 진행 바 연동 (진행 상황에 따라 1~4단계 표시)
		if (tabId === 'complete-tab') UIController.updateProgress(4);
		else if (tabId === 'mapping-tab') UIController.updateProgress(3);
		else if (tabId === 'analysis-tab' && AppState.analyzedData.length > 0)
			UIController.updateProgress(2);
		else if (tabId === 'analysis-tab') UIController.updateProgress(1);

		// 5. 매핑 탭에 막 들어왔을 때, 자동 매핑을 한 번도 안 했다면 시작 버튼 노출
		if (tabId === 'mapping-tab') {
			// 매핑 탭에서는 분석/다음단계 버튼 무조건 숨김
			document.getElementById('analyze-btn')?.classList.add('hidden');
			document.getElementById('next-step-btn')?.classList.add('hidden');

			if (MappingManager.mappings.length === 0) {
				const startBtn = document.getElementById('start-auto-mapping-btn');
				if (startBtn) startBtn.classList.remove('hidden');
			}
		} else if (tabId !== 'analysis-tab') {
			// 그 외 탭(DB관리 등)에서는 모든 플로팅 버튼 숨김
			document.getElementById('analyze-btn')?.classList.add('hidden');
			document.getElementById('next-step-btn')?.classList.add('hidden');
			document.getElementById('start-auto-mapping-btn')?.classList.add('hidden');
		}

		// [신규] 6. DB 관리 탭 진입 시 실시간 잠금 감시 시작
		if (tabId === 'database-tab') {
			this.startLockMonitoring();
		} else {
			this.stopLockMonitoring();
		}
	},

	lockMonitorInterval: null,
	startLockMonitoring() {
		this.stopLockMonitoring(); // 중복 방지
		const monitor = async () => {
			try {
				const lock = await DatabaseManager.checkLock();
				const uploadArea = document.getElementById('db-file-upload-area');
				const selectBtn = document.getElementById('db-select-file-btn');
				const helperText = document.querySelector('#database-tab .section-description');

				if (lock && lock.isLocked) {
					uploadArea.classList.add('locked');
					if (selectBtn) {
						selectBtn.disabled = true;
						selectBtn.innerText = '다른 사용자가 업로드 중...';
					}
					if (helperText) {
						const startTime = new Date(lock.startTime).toLocaleTimeString();
						helperText.innerHTML = `<span style="color:var(--color-danger); font-weight:bold;">⚠️ 현황: ${lock.user}님이 ${startTime}부터 업로드 중입니다. 잠시만 기다려주세요.</span>`;
					}
				} else {
					uploadArea.classList.remove('locked');
					if (selectBtn) {
						selectBtn.disabled = false;
						selectBtn.innerText = 'DB 파일 선택';
					}
					if (helperText) {
						helperText.innerText =
							"이지어드민 '현재고조회' 파일을 업로드하여 기준 DB를 구축합니다.";
					}
				}
			} catch (e) {
				console.error('Lock monitor error:', e);
			}
		};
		monitor(); // 즉시 실행
		this.lockMonitorInterval = setInterval(monitor, 3000); // 3초마다 확인
	},

	stopLockMonitoring() {
		if (this.lockMonitorInterval) {
			clearInterval(this.lockMonitorInterval);
			this.lockMonitorInterval = null;
		}
	},

	loadWholesalers() {
		const saved = localStorage.getItem('wholesalers');
		if (saved) {
			this.wholesalers = JSON.parse(saved);
			this.renderWholesalerTags();
			this.updateWholesalerDropdowns(); // DB 매칭용 드롭다운 갱신
		}
	},

	updateWholesalerDropdowns() {
		const dbSelect = document.getElementById('db-wholesaler-select');
		if (dbSelect) {
			const currentValue = dbSelect.value;
			dbSelect.innerHTML = '<option value="">-- 도매인 선택 --</option>';
			this.wholesalers.forEach((w) => {
				const option = document.createElement('option');
				option.value = w;
				option.textContent = w;
				dbSelect.appendChild(option);
			});
			dbSelect.value = currentValue;
		}
	},

	saveWholesalers() {
		localStorage.setItem('wholesalers', JSON.stringify(this.wholesalers));
	},

	addWholesaler(name) {
		if (!name || this.wholesalers.includes(name)) {
			return false;
		}
		this.wholesalers.push(name);
		this.saveWholesalers();
		this.renderWholesalerTags();
		this.updateWholesalerDropdowns();
		return true;
	},

	removeWholesaler(name) {
		this.wholesalers = this.wholesalers.filter((w) => w !== name);
		this.saveWholesalers();
		this.renderWholesalerTags();
		this.updateWholesalerDropdowns();
		if (this.selectedWholesaler === name) {
			this.selectedWholesaler = null;
		}
	},

	setWholesaler(name) {
		this.selectedWholesaler = name;
		UIController.showToast(`${name} 도매인이 기본으로 선택되었습니다.`, 'info');
		this.updateAnalyzeButton();

		// 업로드된 파일들의 시트를 해당 도매인으로 자동 변경 (편의 기능)
		Object.keys(this.sheetWholesalers).forEach((key) => {
			this.sheetWholesalers[key] = name;
		});
		FileHandler.renderFileList();
	},

	addFiles(files) {
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			// 중복 파일 체크 (이름과 크기 기준)
			if (!this.uploadedFiles.find((f) => f.name === file.name && f.size === file.size)) {
				this.uploadedFiles.push(file);
			}
		}
		this.updateAnalyzeButton();
	},

	removeFile(fileName) {
		this.uploadedFiles = this.uploadedFiles.filter((f) => f.name !== fileName);

		// 해당 파일의 시트 설정도 삭제
		Object.keys(this.sheetWholesalers).forEach((key) => {
			if (key.startsWith(fileName + '_')) {
				delete this.sheetWholesalers[key];
			}
		});

		this.updateAnalyzeButton();
	},

	clearAllFiles() {
		this.uploadedFiles = [];
		this.sheetWholesalers = {};
		this.updateAnalyzeButton();
	},

	updateAnalyzeButton() {
		const analyzeBtn = document.getElementById('analyze-btn');
		if (!analyzeBtn) return;

		const hasFiles = this.uploadedFiles.length > 0;
		const selects = document.querySelectorAll('.sheet-config-item select');

		// 시트 설정 항목이 하나도 없으면 (파일 읽기 전이거나 파일이 없는 경우) 비활성화
		if (selects.length === 0) {
			analyzeBtn.disabled = true;
			return;
		}

		// 모든 선택창에 값이 하나라도 비어있으면(default value) 비활성화
		const allSelected = Array.from(selects).every((s) => s.value !== '');

		analyzeBtn.disabled = !(hasFiles && allSelected);
	},

	renderWholesalerTags(showAll = false) {
		const container = document.getElementById('wholesaler-tags');
		if (!container) return;
		container.innerHTML = '';

		// 5개 이상일 때만 줄임 처리 (사용자 요청: 5개부터 3개만 노출)
		const isLimitEnabled = this.wholesalers.length >= 5 && !showAll;
		const displayList = isLimitEnabled ? this.wholesalers.slice(0, 3) : this.wholesalers;

		displayList.forEach((wholesaler) => {
			const tag = document.createElement('div');
			tag.className = 'wholesaler-tag' + (this.selectedWholesaler === wholesaler ? ' active' : '');
			tag.style.cursor = 'pointer';
			tag.innerHTML = `
                <span class="tag-name">${wholesaler}</span>
                <button class="tag-remove-btn" data-wholesaler="${wholesaler}">×</button>
            `;
			container.appendChild(tag);

			// 태그 클릭 시 해당 도매인 선택
			tag.addEventListener('click', (e) => {
				if (e.target.classList.contains('tag-remove-btn')) return;
				this.setWholesaler(wholesaler);
				this.renderWholesalerTags(showAll); // 현재 노출 상태 유지하며 갱신
			});

			tag.querySelector('.tag-remove-btn').addEventListener('click', (e) => {
				e.stopPropagation();
				this.removeWholesaler(e.target.dataset.wholesaler);
			});
		});

		// 더보기 / 접기 버튼 추가
		if (this.wholesalers.length >= 5) {
			const toggleBtn = document.createElement('button');
			toggleBtn.className = 'btn btn-ghost btn-xs more-tags-btn';
			toggleBtn.style.padding = '2px 8px';
			toggleBtn.style.fontSize = '11px';
			toggleBtn.style.marginLeft = '4px';
			toggleBtn.style.minHeight = '24px';
			toggleBtn.style.background = 'var(--color-bg-tertiary)';

			if (!showAll) {
				toggleBtn.innerHTML = `... +${this.wholesalers.length - 3} 더보기`;
				toggleBtn.addEventListener('click', () => this.renderWholesalerTags(true));
			} else {
				toggleBtn.innerHTML = '접기 ⬆️';
				toggleBtn.addEventListener('click', () => this.renderWholesalerTags(false));
			}
			container.appendChild(toggleBtn);
		}
	},

	updateWholesalerSelect() {
		// 전역 드롭다운이 제거되었으므로 태그 렌더링만 수행
		this.renderWholesalerTags();
	},

	// 유틸리티: 숫자에 포함된 콤마를 제거하고 안전하게 파싱
	parseNumber(val) {
		if (typeof val === 'number') return val;
		if (!val) return 0;
		// 콤마 제거 후 정수 변환
		const sanitized = String(val).replace(/,/g, '');
		const parsed = parseInt(sanitized);
		return isNaN(parsed) ? 0 : parsed;
	},
};

// ========== UI Controllers ==========
const UIController = {
	showSection(sectionId) {
		// 1. 모든 섹션 비활성화
		document.querySelectorAll('.section').forEach((section) => {
			section.classList.remove('active');
		});

		// 2. 대상 섹션 활성화
		const target = document.getElementById(sectionId);
		if (target) target.classList.add('active');

		// 3. 플로팅 버튼 상태 제어 (분석 시작 vs 다음 단계)
		const analyzeBtn = document.getElementById('analyze-btn');
		const nextStepBtn = document.getElementById('next-step-btn');

		if (sectionId === 'results-section') {
			if (analyzeBtn) analyzeBtn.classList.add('hidden');
			if (nextStepBtn) nextStepBtn.classList.remove('hidden');
		} else if (sectionId === 'upload-section') {
			if (analyzeBtn) analyzeBtn.classList.remove('hidden');
			if (nextStepBtn) nextStepBtn.classList.add('hidden');
			document.getElementById('start-auto-mapping-btn')?.classList.add('hidden');
		} else {
			// 분석 중일 때는 둘 다 숨김
			if (analyzeBtn) analyzeBtn.classList.add('hidden');
			if (nextStepBtn) nextStepBtn.classList.add('hidden');
			document.getElementById('start-auto-mapping-btn')?.classList.add('hidden');
		}

		// 4. 분석 결과 섹션인 경우, 분석 탭이 활성화되어 있어야 함
		if (
			sectionId === 'results-section' ||
			sectionId === 'analyzing-section' ||
			sectionId === 'upload-section'
		) {
			this.ensureTab('analysis-tab');
		}
	},

	ensureTab(tabId) {
		const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
		if (tabBtn && !tabBtn.classList.contains('active')) {
			AppState.switchTab(tabId);
		}
	},

	updateProgress(step) {
		document.querySelectorAll('.progress-step').forEach((el, index) => {
			if (index + 1 < step) {
				el.classList.add('completed');
				el.classList.remove('active');
			} else if (index + 1 === step) {
				el.classList.add('active');
				el.classList.remove('completed');
			} else {
				el.classList.remove('active', 'completed');
			}
		});
	},

	showToast(message, type = 'info') {
		const container = document.getElementById('toast-container');
		if (!container) return;
		const toast = document.createElement('div');
		toast.className = `toast ${type}`;

		const icons = {
			success: '✅',
			error: '❌',
			info: 'ℹ️',
			warning: '⚠️',
		};

		toast.innerHTML = `
            <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
            <div class="toast-message">${message}</div>
        `;

		container.appendChild(toast);

		setTimeout(() => {
			toast.style.animation = 'slideInRight 0.3s reverse';
			setTimeout(() => toast.remove(), 300);
		}, 3000);
	},

	formatFileSize(bytes) {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	},
};

// ========== File Handler ==========
const FileHandler = {
	init() {
		const fileInput = document.getElementById('file-input');
		const selectFileBtn = document.getElementById('select-file-btn');
		const fileUploadArea = document.getElementById('file-upload-area');
		const clearBtn = document.getElementById('clear-all-files');

		if (!fileInput || !selectFileBtn || !fileUploadArea) return;

		selectFileBtn.addEventListener('click', () => fileInput.click());
		fileUploadArea.addEventListener('click', (e) => {
			if (e.target === fileUploadArea || e.target.closest('.upload-text')) {
				fileInput.click();
			}
		});

		fileInput.addEventListener('change', (e) => {
			if (e.target.files.length > 0) {
				this.handleFiles(e.target.files);
			}
		});

		// DB 파일 업로드 관련
		const dbFileInput = document.getElementById('db-file-input');
		const dbSelectBtn = document.getElementById('db-select-file-btn');
		const dbUploadArea = document.getElementById('db-file-upload-area');

		if (dbFileInput && dbSelectBtn && dbUploadArea) {
			dbSelectBtn.addEventListener('click', () => dbFileInput.click());
			dbFileInput.addEventListener('change', (e) => this.handleDBUpload(e.target.files[0]));

			dbUploadArea.addEventListener('dragover', (e) => {
				e.preventDefault();
				dbUploadArea.classList.add('drag-over');
			});
			dbUploadArea.addEventListener('dragleave', () => dbUploadArea.classList.remove('drag-over'));
			dbUploadArea.addEventListener('drop', (e) => {
				e.preventDefault();
				dbUploadArea.classList.remove('drag-over');
				this.handleDBUpload(e.dataTransfer.files[0]);
			});
		}

		const clearDbBtn = document.getElementById('clear-db-btn');
		if (clearDbBtn) {
			clearDbBtn.addEventListener('click', () => {
				if (confirm('정말 등록된 모든 제품 DB를 삭제하시겠습니까?')) {
					DatabaseManager.clearAll(() => {
						AppState.updateDBStats();
						UIController.showToast('DB가 초기화되었습니다.', 'info');
					});
				}
			});
		}

		fileUploadArea.addEventListener('dragover', (e) => {
			e.preventDefault();
			fileUploadArea.classList.add('drag-over');
		});

		fileUploadArea.addEventListener('dragleave', () => {
			fileUploadArea.classList.remove('drag-over');
		});

		fileUploadArea.addEventListener('drop', (e) => {
			e.preventDefault();
			fileUploadArea.classList.remove('drag-over');
			if (e.dataTransfer.files.length > 0) {
				this.handleFiles(e.dataTransfer.files);
			}
		});

		if (clearBtn) {
			clearBtn.addEventListener('click', () => {
				AppState.clearAllFiles();
				this.renderFileList();
			});
		}
	},

	async handleFiles(files) {
		const validExtensions = ['xlsx', 'xls', 'csv'];
		const newFiles = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const extension = file.name.split('.').pop().toLowerCase();

			if (!validExtensions.includes(extension)) {
				UIController.showToast(`${file.name}: 지원하지 않는 파일 형식입니다.`, 'error');
				continue;
			}

			if (file.size > 50 * 1024 * 1024) {
				UIController.showToast(`${file.name}: 50MB를 초과합니다.`, 'error');
				continue;
			}

			newFiles.push(file);
		}

		if (newFiles.length > 0) {
			AppState.addFiles(newFiles);
			await this.renderFileList();
			UIController.showToast(`${newFiles.length}개의 파일이 추가되었습니다.`, 'success');
		}
	},

	async renderFileList() {
		const section = document.getElementById('file-list-section');
		const container = document.getElementById('file-list-container');
		if (!section || !container) return;

		if (AppState.uploadedFiles.length === 0) {
			section.classList.add('hidden');
			document.getElementById('file-upload-area').style.display = 'block';
			return;
		}

		section.classList.remove('hidden');
		document.getElementById('file-upload-area').style.display = 'block'; // 계속 추가 가능하게 유지
		container.innerHTML = '';

		for (const file of AppState.uploadedFiles) {
			const card = document.createElement('div');
			card.className = 'file-card';

			const header = document.createElement('div');
			header.className = 'file-card-header';
			header.innerHTML = `
				<div class="file-card-info">${file.name} (${UIController.formatFileSize(file.size)})</div>
				<button class="btn-remove-file" style="background:none; border:none; color:var(--color-danger); cursor:pointer;">제거</button>
			`;

			header.querySelector('.btn-remove-file').addEventListener('click', () => {
				AppState.removeFile(file.name);
				this.renderFileList();
			});

			const sheetsContainer = document.createElement('div');
			sheetsContainer.className = 'file-card-sheets';

			// 시트 목록 읽기 (캐싱 고려 가능하지만 여기선 매번 읽음)
			const workbook = await this.readWorkbook(file);
			const sheetNames = workbook.SheetNames.slice(1); // 첫 시트 무시

			sheetNames.forEach((sheetName) => {
				const item = document.createElement('div');
				item.className = 'sheet-config-item';

				const nameSpan = document.createElement('span');
				nameSpan.className = 'sheet-name';
				nameSpan.textContent = sheetName;

				const select = document.createElement('select');
				select.innerHTML = '<option value="">-- 도매인 선택 --</option>';
				AppState.wholesalers.forEach((w) => {
					const opt = document.createElement('option');
					opt.value = w;
					opt.textContent = w;
					select.appendChild(opt);
				});

				const key = `${file.name}_${sheetName}`;
				if (AppState.sheetWholesalers[key]) {
					select.value = AppState.sheetWholesalers[key];
				} else if (AppState.selectedWholesaler) {
					select.value = AppState.selectedWholesaler;
					AppState.sheetWholesalers[key] = AppState.selectedWholesaler;
				}

				select.addEventListener('change', (ev) => {
					const val = ev.target.value;
					if (val) {
						AppState.sheetWholesalers[key] = val;
					} else {
						delete AppState.sheetWholesalers[key];
					}
					AppState.updateAnalyzeButton();
				});

				item.appendChild(nameSpan);
				item.appendChild(select);
				sheetsContainer.appendChild(item);
			});

			card.appendChild(header);
			card.appendChild(sheetsContainer);
			container.appendChild(card);
		}

		AppState.updateAnalyzeButton();
	},

	readWorkbook(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const data = new Uint8Array(e.target.result);
				const workbook = XLSX.read(data, { type: 'array' });
				resolve(workbook);
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(file);
		});
	},

	async handleDBUpload(file) {
		if (!file) return;

		const wholesaler = document.getElementById('db-wholesaler-select').value;
		if (!wholesaler) {
			UIController.showToast('도매인을 먼저 선택해주세요!', 'error');
			return;
		}

		// 1. 서버 잠금 획득 시도
		try {
			const lockResult = await DatabaseManager.acquireLock(AppState.userId || '익명의 사용자');
			if (!lockResult.success) {
				const startTime = new Date(lockResult.detail.startTime).toLocaleTimeString();
				UIController.showToast(
					`현재 ${lockResult.detail.user}님이 ${startTime}부터 업로드 중입니다.`,
					'warning',
				);
				return;
			}
		} catch (e) {
			UIController.showToast('서버 상태 확인에 실패했습니다.', 'error');
			return;
		}

		UIController.showToast(`${file.name} 데이터를 읽는 중입니다...`, 'info');

		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const data = new Uint8Array(e.target.result);
				// 대용량 파일을 위해 가벼운 읽기 옵션 사용
				const workbook = XLSX.read(data, {
					type: 'array',
					cellDates: false,
					cellStyles: false,
					cellNF: false,
					cellText: false,
					sheets: [0], // 첫 번째 시트만 사용
				});

				const firstSheetName = workbook.SheetNames[0];
				const worksheet = workbook.Sheets[firstSheetName];
				const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

				if (jsonData.length < 2) throw new Error('데이터가 부족합니다.');

				const headers = jsonData[0];
				const colMap = {
					code: headers.indexOf('상품코드'),
					name: headers.indexOf('상품명'),
					option: headers.indexOf('옵션'),
					barcode: headers.indexOf('바코드'),
					stock: headers.indexOf('가용재고'),
				};

				if (colMap.code === -1 || colMap.name === -1) {
					throw new Error('필수 컬럼(상품코드, 상품명)을 찾을 수 없습니다.');
				}

				const products = [];
				for (let i = 1; i < jsonData.length; i++) {
					const row = jsonData[i];
					if (!row || !row[colMap.code]) continue;

					products.push({
						productCode: String(row[colMap.code]).trim(),
						productName: String(row[colMap.name]).trim(),
						optionName: row[colMap.option] ? String(row[colMap.option]).trim() : '-',
						barcode: row[colMap.barcode] ? String(row[colMap.barcode]).trim() : '',
						stock: parseInt(row[colMap.stock]) || 0,
						wholesaler: wholesaler,
					});
				}

				// [진행 메타 정보]
				const batchSize = 500; // 서버 부하 분산 및 진행률 표시를 위해 500개씩 끊어서 전송
				const totalProducts = products.length;
				let processedCount = 0;

				UIController.showToast('데이터베이스에 저장 중입니다...', 'info');

				// 업로드 중 UI로 전환 (선택 사항: 이미 로딩 바가 있다면 재사용)
				const statusArea = document.getElementById('db-status-area');
				if (statusArea) {
					statusArea.classList.remove('hidden');
					const countEl = document.getElementById('total-db-count');
					if (countEl)
						countEl.innerHTML = `<span class="upload-loader"></span> 저장 중... (0/${totalProducts.toLocaleString()})`;
				}

				// Chunk 단위 순차 업로드
				for (let i = 0; i < products.length; i += batchSize) {
					const chunk = products.slice(i, i + batchSize);
					await DatabaseManager.saveProducts(chunk);

					processedCount += chunk.length;
					const percent = Math.floor((processedCount / totalProducts) * 100);

					// 실시간 진행률 업데이트
					const countEl = document.getElementById('total-db-count');
					if (countEl) {
						countEl.innerHTML = `<span class="upload-loader"></span> ${percent}% 완료 (${processedCount.toLocaleString()} / ${totalProducts.toLocaleString()})`;
					}
				}

				UIController.showToast(
					`${totalProducts.toLocaleString()}건의 제품이 모두 등록되었습니다.`,
					'success',
				);
				AppState.updateDBStats();
			} catch (err) {
				console.error('DB upload error:', err);
				UIController.showToast(err.message || '저장 중 오류 발생', 'error');
			} finally {
				// 작업 완료 또는 오류 시 잠금 반드시 해제
				await DatabaseManager.releaseLock();
			}
		};
		reader.readAsArrayBuffer(file);
	},
};

// ========== Wholesaler Manager ==========
const WholesalerManager = {
	init() {
		const addBtn = document.getElementById('add-wholesaler-btn');
		const saveBtn = document.getElementById('save-wholesaler-btn');
		const cancelBtn = document.getElementById('cancel-wholesaler-btn');
		const input = document.getElementById('new-wholesaler-input');
		const form = document.getElementById('wholesaler-form');

		if (!addBtn || !saveBtn || !cancelBtn || !input || !form) return;

		addBtn.addEventListener('click', () => {
			form.classList.remove('hidden');
			input.focus();
		});

		cancelBtn.addEventListener('click', () => {
			form.classList.add('hidden');
			input.value = '';
		});

		saveBtn.addEventListener('click', () => {
			this.saveWholesaler();
		});

		input.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				this.saveWholesaler();
			}
		});
	},

	saveWholesaler() {
		const input = document.getElementById('new-wholesaler-input');
		const name = input.value.trim();

		if (!name) {
			UIController.showToast('도매인 이름을 입력하세요.', 'warning');
			return;
		}

		if (AppState.addWholesaler(name)) {
			UIController.showToast(`${name} 도매인이 등록되었습니다.`, 'success');
			document.getElementById('wholesaler-form').classList.add('hidden');
			input.value = '';

			// 모든 드롭다운 갱신을 위해 목록 다시 그리기
			FileHandler.renderFileList();
		} else {
			UIController.showToast('이미 등록된 도매인입니다.', 'error');
		}
	},
};

// ========== Excel Analyzer ==========
const ExcelAnalyzer = {
	async analyzeFile() {
		if (AppState.uploadedFiles.length === 0) return;

		UIController.showSection('analyzing-section');
		UIController.updateProgress(2);

		try {
			const allResults = [];
			const totalFiles = AppState.uploadedFiles.length;

			for (let i = 0; i < totalFiles; i++) {
				const file = AppState.uploadedFiles[i];
				this.updateProgress(Math.floor((i / totalFiles) * 100));

				const workbook = await this.readExcelFile(file);
				const fileResults = this.extractProductInfoFromWorkbook(workbook, file.name);
				allResults.push(...fileResults);
			}

			AppState.analyzedData = allResults;
			this.showResults(allResults);
		} catch (error) {
			console.error('분석 오류:', error);
			UIController.showToast('분석 중 오류가 발생했습니다.', 'error');
			UIController.showSection('upload-section');
			UIController.updateProgress(1);
		}
	},

	readExcelFile(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const data = new Uint8Array(e.target.result);
				const workbook = XLSX.read(data, { type: 'array' });
				resolve(workbook);
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(file);
		});
	},

	extractProductInfoFromWorkbook(workbook, fileName) {
		const results = [];
		// 모든 시트를 대상으로 함 (첫 번째 시트 제외 flag는 UI 레벨에서 제어하지만 분석은 전체 가능하게)
		const sheetNames = workbook.SheetNames;

		console.log(`Analyzing File: ${fileName}, Sheets found: ${workbook.SheetNames.length}`);
		sheetNames.forEach((sheetName) => {
			const key = `${fileName}_${sheetName}`;
			const wholesaler = AppState.sheetWholesalers[key];
			console.log(`- Sheet: ${sheetName}, Wholesaler: ${wholesaler || 'NOT SET'}`);
			if (!wholesaler) return;

			const sheet = workbook.Sheets[sheetName];
			const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

			if (!data || data.length === 0) return;

			const tableType = this.detectTableType(data);
			console.log(`  Sheet: ${sheetName}, Type: ${tableType}`);

			if (tableType === 'left') {
				this.extractFromLeftTable(data, sheetName, fileName, wholesaler, results);
			} else if (tableType === 'left-grid') {
				this.extractFromLeftGridTable(data, sheetName, fileName, wholesaler, results);
			} else if (tableType === 'right') {
				this.extractFromRightTable(data, sheetName, fileName, wholesaler, results);
			}
		});

		return results;
	},

	detectTableType(data) {
		let hasLeft = false;
		let hasRight = false;
		let isGrid = false;

		// 상단 50행 조사하여 구조 파악
		for (let i = 0; i < Math.min(data.length, 50); i++) {
			const row = data[i] || [];

			// 1. 오른쪽 표 감지 (8열 이후 '품명' 헤더 존재 여부)
			if (row.slice(8).some((cell) => cell && String(cell).includes('품명'))) {
				hasRight = true;
			}

			// 2. 왼쪽 표 헤더 감지
			if (row.slice(0, 5).some((cell) => cell && String(cell).includes('품명'))) {
				hasLeft = true;

				// 3. 그리드형(다중 사이즈) 판별
				// 헤더나 데이터 행에서 인치(") 표시 혹은 다수의 수량 열 패턴 확인
				const rightSide = row.slice(4, 16);
				const hasInches = rightSide.some((cell) => cell && String(cell).includes('"'));
				const hasManyNumbers = rightSide.filter((cell) => typeof cell === 'number').length > 1;
				if (hasInches || hasManyNumbers) isGrid = true;
			}
		}

		// OZ-오즈 등 복합 시트는 오른쪽(실데이터) 우선
		if (hasRight) return 'right';
		if (hasLeft) return isGrid ? 'left-grid' : 'left';

		return 'unknown';
	},

	extractFromLeftTable(data, sheetName, fileName, wholesaler, results) {
		let PRODUCT_COL = -1,
			COLOR_COL = -1,
			SIZE_COL = -1,
			QTY_COL = -1,
			hIdx = -1;

		// 헤더 감지 (구조적 탐색)
		for (let i = 0; i < Math.min(data.length, 20); i++) {
			const row = data[i] || [];
			const pIdx = row.slice(0, 5).findIndex((cell) => cell && String(cell).includes('품명'));
			if (pIdx !== -1) {
				PRODUCT_COL = pIdx;
				COLOR_COL = row.findIndex((c, idx) => idx > pIdx && c && String(c).includes('칼라'));
				SIZE_COL = row.findIndex((c, idx) => idx > pIdx && c && String(c).includes('사이즈'));
				// 수량 컬럼 찾기: '총수량'을 최우선으로 찾고, 없으면 '수량'을 찾음. '포장수량'과 섞여있을 때를 대비해 뒤에서부터 찾거나 명시적 체크
				let qIdx = row.findLastIndex((c) => c && String(c).includes('총수량'));
				if (qIdx === -1) {
					qIdx = row.findLastIndex(
						(c) => c && String(c).includes('수량') && !String(c).includes('포장'),
					);
				}
				if (qIdx !== -1) QTY_COL = qIdx;
				hIdx = i;
				break;
			}
		}

		if (hIdx === -1) return;

		let lastP = null,
			lastC = null;
		for (let i = hIdx + 1; i < data.length; i++) {
			const row = data[i];
			if (!row || row.every((c) => c === null)) continue;
			if (row.some((c) => c && typeof c === 'string' && (c.includes('합계') || c.includes('비고'))))
				break;

			let p = row[PRODUCT_COL] ? String(row[PRODUCT_COL]).trim() : null;
			let c = row[COLOR_COL] ? String(row[COLOR_COL]).trim() : null;
			let s =
				SIZE_COL !== -1 && row[SIZE_COL] ? String(row[SIZE_COL]).trim().replace(/"/g, '') : null;
			let q = QTY_COL !== -1 ? AppState.parseNumber(row[QTY_COL]) : 0;

			// 데이터 행 판별: 품명이 있거나, 품명이 없어도 사이즈/수량이 있는 유효 행
			if (!p && !c && !s && isNaN(q)) continue;

			// 상속 구조 처리
			if (p) lastP = p;
			else p = lastP;
			if (c) lastC = c;
			else c = lastC;

			if (p && s && q > 0) {
				results.push({
					wholesaler,
					fileName,
					sheet: sheetName,
					productName: p,
					color: c || '-',
					quantities: { [s]: q },
				});
			}
		}
	},

	extractFromLeftGridTable(data, sheetName, fileName, wholesaler, results) {
		let PRODUCT_COL = -1,
			COLOR_COL = -1,
			hIdx = -1;

		for (let i = 0; i < Math.min(data.length, 20); i++) {
			const row = data[i] || [];
			const pIdx = row.slice(0, 5).findIndex((cell) => cell && String(cell).includes('품명'));
			if (pIdx !== -1) {
				PRODUCT_COL = pIdx;
				COLOR_COL = row.findIndex((c, idx) => idx > pIdx && c && String(c).includes('칼라'));
				hIdx = i;
				break;
			}
		}

		if (hIdx === -1) return;

		// 사이즈 맵: 인치가 붙었거나 숫자로 된 헤더 탐색
		const headerRow = data[hIdx];
		const sizeMap = [];
		for (let col = Math.max(PRODUCT_COL, COLOR_COL) + 1; col < headerRow.length; col++) {
			const val = headerRow[col];
			if (val && (String(val).includes('"') || !isNaN(parseInt(val)))) {
				sizeMap.push({ col, label: String(val).trim().replace(/"/g, '') });
			}
		}

		let lastP = null,
			lastC = null;
		for (let i = hIdx + 1; i < data.length; i++) {
			const row = data[i];
			if (!row || row.every((c) => c === null)) continue;

			// 합계/비고 제외
			if (
				row.some((c) => c && typeof c === 'string' && (c.includes('합계') || c.includes('비고')))
			) {
				// 합계 줄 이후에도 데이터가 있을 수 있으므로 break 대신 continue (구조적 전술)
				if (row.some((c) => c && String(c).includes('비고'))) break;
				continue;
			}

			let p = row[PRODUCT_COL] ? String(row[PRODUCT_COL]).trim() : null;
			let c = row[COLOR_COL] ? String(row[COLOR_COL]).trim() : null;

			// 합계 행 감지 강화: 제품명/컬러가 둘 다 없는데 수량 숫자가 여러 개 발견되면 합계행임
			const isExplicitlyEmpty = !row[PRODUCT_COL] && !row[COLOR_COL];
			const hasManyQuantities =
				sizeMap.filter((m) => row[m.col] && typeof row[m.col] === 'number').length > 1;
			if (isExplicitlyEmpty && hasManyQuantities) {
				console.log(`- Skipping summary row at index ${i}`);
				continue;
			}

			if (p) lastP = p;
			else p = lastP;
			if (c) lastC = c;
			else c = lastC;

			if (!p) continue;

			sizeMap.forEach((m) => {
				const q = row[m.col] ? AppState.parseNumber(row[m.col]) : 0;
				if (q > 0) {
					results.push({
						wholesaler,
						fileName,
						sheet: sheetName,
						productName: p,
						color: c || '-',
						quantities: { [m.label]: q },
					});
				}
			});
		}
	},

	extractFromRightTable(data, sheetName, fileName, wholesaler, results) {
		const headerIndices = [];

		// 모든 헤더 위치 감지 (8열 이후에서 탐색)
		data.forEach((row, i) => {
			if (!row) return;
			const pIdx = row.findIndex((c, idx) => idx >= 8 && c && String(c).includes('품명'));
			if (pIdx !== -1) {
				// 이미 찾은 헤더 구조와 너무 가깝지 않은지 확인 (중복 감지 방지)
				if (headerIndices.length === 0 || i > headerIndices[headerIndices.length - 1].idx + 3) {
					headerIndices.push({ idx: i, pIdx: pIdx });
				}
			}
		});

		if (headerIndices.length === 0) return;

		headerIndices.forEach((header, listIdx) => {
			const hIdx = header.idx;
			const PRODUCT_COL = header.pIdx;
			const COLOR_COL = data[hIdx].findIndex(
				(c, idx) => idx > PRODUCT_COL && c && String(c).includes('칼라'),
			);

			if (COLOR_COL === -1) return;

			// 사이즈 맵 구성 (구조 기반: 헤더 줄과 그 다음 줄 스캔)
			const sizeMap = [];
			[data[hIdx], data[hIdx + 1]].forEach((hRow) => {
				if (!hRow) return;
				hRow.forEach((cell, colIdx) => {
					if (colIdx <= COLOR_COL) return;
					if (
						cell &&
						(String(cell).includes('"') ||
							['S', 'M', 'L', 'XL', 'FREE'].includes(String(cell).toUpperCase()) ||
							(!isNaN(cell) && parseInt(cell) > 50))
					) {
						if (!sizeMap.some((m) => m.col === colIdx)) {
							sizeMap.push({ col: colIdx, label: String(cell).trim().replace(/"/g, '') });
						}
					}
				});
			});

			const nextHeaderIdx = headerIndices[listIdx + 1]
				? headerIndices[listIdx + 1].idx
				: data.length;
			let lastP = null,
				lastC = null;

			// 데이터 시작 줄 계산: 헤더 다음 줄이 숫자로 시작하면 바로 데이터, 아니면 그 다음 줄부터
			const startI =
				hIdx + (data[hIdx + 1] && data[hIdx + 1].some((c) => typeof c === 'number') ? 1 : 2);

			for (let i = startI; i < nextHeaderIdx; i++) {
				const row = data[i];
				if (!row || row.every((c) => c === null)) continue;
				if (
					row.some((c) => c && typeof c === 'string' && (c.includes('합계') || c.includes('비고')))
				)
					break;

				let p = row[PRODUCT_COL] ? String(row[PRODUCT_COL]).trim() : null;
				let c = row[COLOR_COL] ? String(row[COLOR_COL]).trim() : null;

				// 상속 처리
				if (p) lastP = p;
				else p = lastP;
				if (c) lastC = c;
				else c = lastC;

				if (!p) continue;

				sizeMap.forEach((m) => {
					const q = row[m.col] ? AppState.parseNumber(row[m.col]) : 0;
					if (q > 0) {
						results.push({
							wholesaler,
							fileName,
							sheet: sheetName,
							productName: p,
							color: c || '-',
							quantities: { [m.label]: q },
						});
					}
				});
			}
		});
	},

	updateProgress(percent) {
		const fill = document.getElementById('progress-bar-fill');
		const text = document.getElementById('progress-text');
		if (fill) fill.style.width = percent + '%';
		if (text) text.textContent = percent + '%';
	},

	showResults(data) {
		UIController.showSection('results-section');
		UIController.updateProgress(2);

		const totalQuantity = data.reduce((sum, item) => {
			return sum + Object.values(item.quantities).reduce((a, b) => a + b, 0);
		}, 0);

		document.getElementById('total-products').textContent = data.length;
		document.getElementById('selected-wholesaler').textContent =
			AppState.uploadedFiles.length + '개 파일';
		document.getElementById('total-quantity').textContent = totalQuantity;

		const tbody = document.getElementById('results-table-body');
		tbody.innerHTML = '';

		data.forEach((item, index) => {
			const sizes = Object.entries(item.quantities);
			sizes.forEach(([size, qty], sIdx) => {
				const tr = document.createElement('tr');
				if (sIdx === 0) {
					tr.innerHTML = `
						<td rowspan="${sizes.length}">${index + 1}</td>
						<td rowspan="${sizes.length}">${item.wholesaler}</td>
						<td rowspan="${sizes.length}">${item.fileName}</td>
						<td rowspan="${sizes.length}">${item.sheet}</td>
						<td rowspan="${sizes.length}">${item.productName}</td>
						<td rowspan="${sizes.length}">${item.color}</td>
						<td>${size}</td>
						<td>${qty}</td>
					`;
				} else {
					tr.innerHTML = `
						<td>${size}</td>
						<td>${qty}</td>
					`;
				}
				tbody.appendChild(tr);
			});
		});

		UIController.showToast('전체 분석이 완료되었습니다!', 'success');
	},
};

// AppState 확장: DB 통계 갱신
AppState.updateDBStats = async function () {
	if (typeof DatabaseManager !== 'undefined' && DatabaseManager.getAll) {
		const products = await DatabaseManager.getAll();
		const countEl = document.getElementById('total-db-count');
		if (countEl) countEl.textContent = products.length.toLocaleString();

		const statusArea = document.getElementById('db-status-area');
		if (statusArea) {
			if (products.length > 0) statusArea.classList.remove('hidden');
			else statusArea.classList.add('hidden');
		}
	}
};

// ========== Event Listeners ==========
const EventListeners = {
	init() {
		document.getElementById('analyze-btn').addEventListener('click', () => {
			ExcelAnalyzer.analyzeFile();
		});

		document.getElementById('download-excel-btn').addEventListener('click', () => {
			this.downloadExcel();
		});

		document.getElementById('restart-btn').addEventListener('click', () => {
			if (confirm('모든 데이터를 초기화하고 처음부터 다시 시작하시겠습니까?')) {
				location.reload();
			}
		});

		document.getElementById('next-step-btn').addEventListener('click', () => {
			// 분석 완료 후 매핑 탭으로 전환 및 섹션 초기화
			AppState.switchTab('mapping-tab');
			UIController.showToast('매핑 단계로 이동했습니다. 자동 매핑을 시작해주세요.', 'info');
		});

		// 3단계: 매핑 시작 버튼
		const startMappingBtn = document.getElementById('start-auto-mapping-btn');
		if (startMappingBtn) {
			startMappingBtn.addEventListener('click', () => {
				MappingManager.startAutoMapping();
			});
		}

		// 모달 관련 이벤트
		document.getElementById('close-search-modal')?.addEventListener('click', () => {
			document.getElementById('search-modal').classList.add('hidden');
		});

		document.getElementById('execute-search-btn')?.addEventListener('click', () => {
			MappingManager.executeManualSearch();
		});

		document.getElementById('manual-search-input')?.addEventListener('input', (e) => {
			// 입력 시 자동 검색 (500ms 디바운스)
			if (this.searchTimeout) clearTimeout(this.searchTimeout);
			this.searchTimeout = setTimeout(() => {
				MappingManager.executeManualSearch();
			}, 500);
		});

		document.getElementById('clear-search-btn')?.addEventListener('click', () => {
			const input = document.getElementById('manual-search-input');
			if (input) {
				input.value = '';
				input.focus();
				MappingManager.executeManualSearch(true); // 빈 검색 수행
			}
		});

		document.getElementById('manual-search-input')?.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				if (this.searchTimeout) clearTimeout(this.searchTimeout);
				MappingManager.executeManualSearch();
			}
		});

		document.getElementById('modal-ignore-btn')?.addEventListener('click', () => {
			MappingManager.ignoreCurrentItem();
		});

		document.getElementById('reuse-query-btn')?.addEventListener('click', () => {
			MappingManager.applyLastQuery();
		});

		// 3단계: 디버그 다운로드 버튼
		const debugDownloadBtn = document.getElementById('download-mapping-debug-btn');
		if (debugDownloadBtn) {
			debugDownloadBtn.addEventListener('click', () => {
				MappingManager.downloadMappingDebug();
			});
		}

		// 매핑 데이터 초기화 버튼
		document.getElementById('clear-mapping-data-btn')?.addEventListener('click', () => {
			MappingManager.clearAllMappingData();
		});

		// 4단계: 이지어드민 업로드 파일 생성 버튼
		document.getElementById('generate-ezauto-btn')?.addEventListener('click', () => {
			MappingManager.generateEzAdminUploadFiles();
		});
	},

	downloadExcel() {
		const data = AppState.analyzedData;
		if (data.length === 0) return;

		const headers = ['도매인', '파일명', '시트', '제품명', '칼라', '사이즈', '수량'];
		let csv = '\uFEFF' + headers.join(',') + '\n';

		data.forEach((item) => {
			Object.entries(item.quantities).forEach(([size, qty]) => {
				csv +=
					[
						item.wholesaler,
						`"${item.fileName}"`,
						item.sheet,
						`"${item.productName}"`,
						`"${item.color}"`,
						size,
						qty,
					].join(',') + '\n';
			});
		});

		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `다중파일_분석결과_${new Date().getTime()}.csv`;
		a.click();
	},
};

// ========== Database Manager (Cloud/Server API) ==========
const DatabaseManager = {
	baseUrl: '/api',

	async init(callback) {
		// 서버 연결 상태 확인 용도
		try {
			await fetch(`${this.baseUrl}/products`);
			console.log('✅ 클라우드 데이터 서버 연동 성공');
			if (callback) callback();
		} catch (e) {
			console.error('Server connection error:', e);
			UIController.showToast('서버에 연결할 수 없습니다. 로컬 모드로 동작합니다.', 'warning');
			if (callback) callback();
		}
	},

	async saveProducts(products) {
		const response = await fetch(`${this.baseUrl}/products/sync`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(products),
		});
		if (!response.ok) throw new Error('서버 데이터 저장 실패');
		return await response.json();
	},

	// [신규] DB 작업 잠금 관련
	async checkLock() {
		const res = await fetch(`${this.baseUrl}/db/lock`);
		return await res.json();
	},

	async acquireLock(userName) {
		const res = await fetch(`${this.baseUrl}/db/lock`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ user: userName }),
		});
		return await res.json();
	},

	async releaseLock() {
		await fetch(`${this.baseUrl}/db/lock`, { method: 'DELETE' });
	},

	async getAll() {
		try {
			const response = await fetch(`${this.baseUrl}/products`);
			if (!response.ok) return [];
			return await response.json();
		} catch (e) {
			console.error('DatabaseManager.getAll Error:', e);
			return [];
		}
	},

	async clearAll(callback) {
		const response = await fetch(`${this.baseUrl}/products/all`, { method: 'DELETE' });
		if (response.ok && callback) callback();
	},

	// 매핑 기억 관련 API 연동
	async saveMappingMemory(mappingKey, productCode, fileName) {
		await fetch(`${this.baseUrl}/mapping-memory`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mappingKey, productCode, fileName }),
		});
	},

	async getMappingMemory() {
		const response = await fetch(`${this.baseUrl}/mapping-memory`);
		if (!response.ok) return [];
		return await response.json();
	},

	async removeMappingMemory(mappingKey) {
		await fetch(`${this.baseUrl}/mapping-memory`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mappingKey }),
		});
	},

	async clearMappingMemory() {
		await fetch(`${this.baseUrl}/mapping-memory/all`, { method: 'DELETE' });
	},

	// 매핑 제외 관련 API 연동
	async saveIgnoreItem(ignoreKey) {
		await fetch(`${this.baseUrl}/ignored-items`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ignoreKey }),
		});
	},

	async getIgnoredItems() {
		const response = await fetch(`${this.baseUrl}/ignored-items`);
		if (!response.ok) return [];
		return await response.json();
	},

	async clearIgnoredItems() {
		await fetch(`${this.baseUrl}/ignored-items/all`, { method: 'DELETE' });
	},
};

// ========== Step 3: Mapping Manager (Intelligent Matching) ==========
const MappingManager = {
	mappings: [], // { analysisIdx, dbProduct, status, similarity }

	async startAutoMapping() {
		const sourceData = AppState.analyzedData;
		if (sourceData.length === 0) {
			UIController.showToast('먼저 패킹리스트를 분석해주세요.', 'warning');
			return;
		}

		UIController.showToast('과거 매핑 기록 및 DB를 불러오는 중...', 'info');

		try {
			// 1. 필요한 데이터를 병렬로 로드 (Promise.all)
			const memoryList = await DatabaseManager.getMappingMemory();
			const ignoredList = await DatabaseManager.getIgnoredItems();
			const dbProducts = await DatabaseManager.getAll();

			if (dbProducts.length === 0) {
				UIController.showToast('등록된 제품 DB가 없습니다. DB를 먼저 구축해주세요.', 'error');
				return;
			}

			UIController.showToast('지능형 자동 매핑을 시작합니다...', 'info');
			document.getElementById('start-auto-mapping-btn')?.classList.add('hidden');

			this.mappings = [];

			// 2. 각 분석 행에 대해 매칭 시도
			sourceData.forEach((item) => {
				const mappingKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;

				// A. 먼저 매핑 제외 목록에 있는지 확인
				const isIgnored = ignoredList.some((ig) => ig.ignoreKey === mappingKey);
				if (isIgnored) {
					this.mappings.push({ source: item, target: null, status: 'ignored', similarity: 0 });
					return;
				}

				// B. 과거 기억에서 찾기
				const remembered = memoryList.find((m) => m.mappingKey === mappingKey);

				if (remembered) {
					const dbProduct = dbProducts.find((p) => p.productCode === remembered.productCode);
					if (dbProduct) {
						this.mappings.push({
							source: item,
							target: dbProduct,
							status: 'success',
							similarity: 100,
						});
						return;
					}
				}

				// C. 지능형 퍼지 매칭 시도
				const match = this.findBestMatch(item, dbProducts);
				this.mappings.push({
					source: item,
					target: match.product,
					status: match.status,
					similarity: match.similarity,
				});

				// D. 만약 자동 매칭 성공이면 기억에 저장 및 피드 노출
				if (match.status === 'success' && match.product) {
					DatabaseManager.saveMappingMemory(mappingKey, match.product.productCode, item.fileName);
					this.addFeedItem(item, match.product, false);
				}
			});

			this.renderMappingResults();
			this.updateSummary();
			UIController.showToast('자동 매핑이 완료되었습니다.', 'success');
		} catch (error) {
			console.error('Auto mapping error:', error);
			UIController.showToast('자동 매핑 중 오류가 발생했습니다.', 'error');
		}
	},

	findBestMatch(source, dbList) {
		const sName = source.productName.trim();
		const sColor = source.color.trim();
		const sWholesaler = source.wholesaler.trim();
		// 패킹리스트에서 추출된 사이즈 (예: "140")
		const sSize = Object.keys(source.quantities)[0] || '';

		let bestMatch = { product: null, status: 'danger', similarity: 0 };

		for (const db of dbList) {
			// 도매인이 다르면 아예 무시 (사용자 요청: 도매인 일치 필수)
			if (db.wholesaler !== sWholesaler) continue;

			// DB 상품명에서 카테고리 분리 (마지막 하이픈 기준)
			const dbFullName = db.productName;
			const dbPureName = dbFullName.split('-').pop().trim();
			const dbOption = db.optionName.trim();

			// 1단계: 완전 일치 (상품명 정규화 대조 + 옵션 대조(색상+사이즈 필수))
			// dbOption에 컬러와 사이즈가 모두 정확히 포함되어야 성공으로 간주
			const nameMatch = dbFullName === sName || dbPureName === sName;
			const optionMatch = dbOption.includes(sColor) && dbOption.includes(sSize);

			if (nameMatch && optionMatch) {
				return { product: db, status: 'success', similarity: 100 };
			}

			// 2단계: 상품명은 맞는데 색상/사이즈가 애매한 경우 (퍼지 매칭)
			if (nameMatch || sName.includes(dbPureName)) {
				const colorSim = this.calculateSimilarity(sColor, dbOption);
				const sizeSim = dbOption.includes(sSize) ? 100 : 0; // 사이즈는 가급적 정확해야 함

				// 색상 유사도가 높고 사이즈가 일치하면 후보로 등록
				const totalSim = colorSim * 0.7 + sizeSim * 0.3;
				if (totalSim > 60) {
					const status = colorSim > 85 && sizeSim === 100 ? 'success' : 'warning';
					if (totalSim > bestMatch.similarity) {
						bestMatch = { product: db, status: status, similarity: totalSim };
					}
				}
			}
		}

		return bestMatch;
	},

	// 레벤슈타인 거리 기반 유사도 계산 (0-100)
	calculateSimilarity(s1, s2) {
		const longer = s1.length > s2.length ? s1 : s2;
		const shorter = s1.length > s2.length ? s2 : s1;
		if (longer.length === 0) return 100;
		const editDistance = this.editDistance(longer, shorter);
		return ((longer.length - editDistance) / longer.length) * 100;
	},

	editDistance(s1, s2) {
		const costs = [];
		for (let i = 0; i <= s1.length; i++) {
			let lastValue = i;
			for (let j = 0; j <= s2.length; j++) {
				if (i === 0) costs[j] = j;
				else {
					if (j > 0) {
						let newValue = costs[j - 1];
						if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
							newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
						}
						costs[j - 1] = lastValue;
						lastValue = newValue;
					}
				}
			}
			if (i > 0) costs[s2.length] = lastValue;
		}
		return costs[s2.length];
	},

	renderMappingResults() {
		const tbody = document.getElementById('mapping-table-body');
		tbody.innerHTML = '';

		// 매칭 성공/제외 항목은 숨기고 주의/실패만 표시
		const listToShow = this.mappings.filter(
			(m) => m.status !== 'success' && m.status !== 'ignored',
		);

		if (listToShow.length === 0 && this.mappings.length > 0) {
			tbody.innerHTML =
				'<tr><td colspan="6" class="text-center success-msg">✨ 모든 항목이 완벽하게 매칭되었습니다!</td></tr>';
			this.updateSummary();
			return;
		}

		listToShow.forEach((m) => {
			// 실제 인덱스 찾기 (원본 mappings 배열 기준)
			const originalIdx = this.mappings.indexOf(m);

			const tr = document.createElement('tr');
			const statusBadge = `<span class="badge badge-${m.status}">${m.status === 'warning' ? '검토 필요' : '매칭 실패'}</span>`;

			const dbInfo = m.target
				? `
				<div class="mapping-db-item">
					<strong>[${m.target.productCode}]</strong> ${m.target.productName}<br>
					<small>옵션: ${m.target.optionName} | 바코드: ${m.target.barcode}</small>
				</div>
			`
				: '<span class="text-muted">매칭된 정보 없음</span>';

			// 키워드 클릭 가능하도록 쪼개기
			const nameKeywords = m.source.productName.split(/[\s-]+/).filter((k) => k.length > 1);
			const colorKeyword = m.source.color;
			const sizeKeyword = Object.keys(m.source.quantities)[0] || '';

			const keywordHtml = `
				<div class="mapping-row-info">
					<div class="keywords-list">
						${nameKeywords.map((k) => `<span class="clickable-keyword" onclick="MappingManager.addKeyword('${k.replace(/'/g, "\\'")}')">${k}</span>`).join('')}
						<span class="clickable-keyword" onclick="MappingManager.addKeyword('${colorKeyword.replace(/'/g, "\\'")}')">${colorKeyword}</span>
						<span class="clickable-keyword" onclick="MappingManager.addKeyword('${sizeKeyword.replace(/'/g, "\\'")}')">${sizeKeyword}</span>
					</div>
				</div>
			`;

			const sourceQty = Object.entries(m.source.quantities)
				.map(([s, q]) => `${s}:${q}`)
				.join(', ');

			tr.innerHTML = `
				<td>${statusBadge}</td>
				<td>${m.source.wholesaler}</td>
				<td>${keywordHtml}</td>
				<td>${dbInfo}</td>
				<td>${sourceQty}</td>
				<td>
					<div class="row-actions">
						<button class="btn btn-secondary btn-sm" onclick="MappingManager.openManualSearch(${originalIdx})">수동 매칭</button>
						<button class="btn btn-outline-danger btn-sm" onclick="MappingManager.ignoreItem(${originalIdx})" title="이 상품 매핑 제외">제외</button>
					</div>
				</td>
			`;
			tbody.appendChild(tr);
		});
	},

	updateSummary() {
		const card = document.getElementById('mapping-summary-card');
		if (!card) return;
		card.classList.remove('hidden');

		const stats = {
			success: this.mappings.filter((m) => m.status === 'success').length,
			warning: this.mappings.filter((m) => m.status === 'warning').length,
			danger: this.mappings.filter((m) => m.status === 'danger').length,
		};

		document.getElementById('auto-match-count').textContent = stats.success;
		document.getElementById('review-match-count').textContent = stats.warning;
		document.getElementById('fail-match-count').textContent = stats.danger;

		console.log('Mapping Summary Updated:', stats);
	},

	currentManualIdx: -1,
	lastQuery: '', // 최근 검색어 저장

	addKeyword(word) {
		const input = document.getElementById('manual-search-input');
		if (!input) return;

		const currentVal = input.value.trim();
		if (currentVal.includes(word)) return; // 이미 있으면 무시

		input.value = currentVal ? `${currentVal} ${word}` : word;
		this.executeManualSearch(); // 즉시 검색
	},

	openManualSearch(idx) {
		this.currentManualIdx = idx;
		const mapping = this.mappings[idx];
		const modal = document.getElementById('search-modal');
		const input = document.getElementById('manual-search-input');

		// 1. 모달 내부 키워드 추천 UI 생성
		this.renderKeywordHelpers(mapping);

		// 2. 초기 검색어 설정 및 모달 노출 (사용자 요청: 빈칸으로 시작)
		input.value = '';

		modal.classList.remove('hidden');
		this.executeManualSearch(true);
	},

	// 모달 내부에 클릭 가능한 키워드 배치
	renderKeywordHelpers(mapping) {
		const modalBody = document.querySelector('.modal-body');
		let helperArea = document.getElementById('keyword-helper-area');

		if (!helperArea) {
			helperArea = document.createElement('div');
			helperArea.id = 'keyword-helper-area';
			helperArea.className = 'keyword-helper-area';
			// 검색창 바로 아래에 삽입
			const inputGroup = document.querySelector('.search-input-group');
			inputGroup.after(helperArea);
		}

		const nameKeywords = mapping.source.productName.split(/[\s-]+/).filter((k) => k.length > 1);
		const colorKeyword = mapping.source.color;
		const sizeKeyword = Object.keys(mapping.source.quantities)[0] || '';

		helperArea.innerHTML = `
			<p class="helper-label">💡 키워드 추천 (클릭하여 추가):</p>
			<div class="keywords-list">
				${nameKeywords.map((k) => `<span class="clickable-keyword" onclick="MappingManager.addKeyword('${k.replace(/'/g, "\\'")}')">${k}</span>`).join('')}
				<span class="clickable-keyword" onclick="MappingManager.addKeyword('${colorKeyword.replace(/'/g, "\\'")}')">${colorKeyword}</span>
				<span class="clickable-keyword" onclick="MappingManager.addKeyword('${sizeKeyword.replace(/'/g, "\\'")}')">${sizeKeyword}</span>
			</div>
		`;
	},

	applyLastQuery() {
		const input = document.getElementById('manual-search-input');
		if (input && this.lastQuery) {
			input.value = this.lastQuery;
			this.executeManualSearch();
		}
	},

	async executeManualSearch(isAuto = false) {
		const query = document.getElementById('manual-search-input').value.trim();
		if (!query) {
			this.renderSearchResults([]);
			return;
		}

		// 사용자가 직접 검색하거나 키워드를 추가한 경우에만 '최근 검색어'로 저장
		if (!isAuto) {
			this.lastQuery = query;
		}

		const keywords = query.toLowerCase().split(/\s+/);
		const currentWholesaler = this.mappings[this.currentManualIdx].source.wholesaler;

		const dbProducts = await DatabaseManager.getAll();

		// 도매인 필터 + 키워드 AND 검색 (상품명이나 옵션에 모든 키워드가 포함되어야 함)
		const results = dbProducts.filter((p) => {
			if (p.wholesaler !== currentWholesaler) return false;

			const fullText = (p.productName + ' ' + p.optionName + ' ' + p.productCode).toLowerCase();
			return keywords.every((k) => fullText.includes(k));
		});

		this.renderSearchResults(results);
	},

	renderSearchResults(results) {
		const tbody = document.getElementById('search-results-body');
		tbody.innerHTML = '';

		if (results.length === 0) {
			tbody.innerHTML = '<tr><td colspan="4" class="text-center">검색 결과가 없습니다.</td></tr>';
			return;
		}

		results.slice(0, 20).forEach((p) => {
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td>${p.productCode}</td>
				<td>${p.productName}</td>
				<td>${p.optionName}</td>
				<td>
					<button class="btn btn-primary btn-sm" onclick="MappingManager.selectProduct('${p.productCode}')">선택</button>
				</td>
			`;
			tbody.appendChild(tr);
		});
	},

	async selectProduct(productCode) {
		const dbProducts = await DatabaseManager.getAll();
		const selected = dbProducts.find((p) => p.productCode === productCode);

		if (selected) {
			const idx = this.currentManualIdx;
			const item = this.mappings[idx].source;

			this.mappings[idx].target = selected;
			this.mappings[idx].status = 'success';

			// 1. 수동 매칭 결과 기억 저장
			const mappingKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;
			DatabaseManager.saveMappingMemory(mappingKey, selected.productCode, item.fileName);

			// 2. 실시간 피드 추가
			this.addFeedItem(item, selected, false, true);

			this.renderMappingResults();
			this.updateSummary();
			UIController.showToast('수동 매칭이 완료되었습니다 (자동 학습됨).', 'success');

			// 3. 자동으로 다음 미매칭 항목 열기
			this.autoOpenNext(idx);
		}
	},

	// 매핑 제외 기능 (모달 내부용)
	ignoreCurrentItem() {
		const idx = this.currentManualIdx;
		if (idx === -1 || !this.mappings[idx]) return;

		const item = this.mappings[idx].source;
		if (confirm(`'${item.productName}' 상품을 매핑에서 영구 제외할까요?`)) {
			// 1. UI 상태부터 즉시 업데이트 (사용자 경험 최우선)
			this.mappings[idx].status = 'ignored';
			this.mappings[idx].target = null;

			this.renderMappingResults();
			this.updateSummary();

			// 2. 백그라운드에서 DB 저장 시도 (오류 나도 OK)
			const ignoreKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;
			DatabaseManager.saveIgnoreItem(ignoreKey);

			UIController.showToast('상품이 매핑 제외 목록에 추가되었습니다.', 'info');

			// 3. 자동으로 다음 미매칭 항목으로 이동
			this.autoOpenNext(idx);
		}
	},

	// 다음 처리할 미매칭 항목 찾기
	findNextManualItem(currentId) {
		// 현재 인덱스 다음부터 찾기
		for (let i = currentId + 1; i < this.mappings.length; i++) {
			if (this.mappings[i].status === 'danger' || this.mappings[i].status === 'warning') {
				return i;
			}
		}
		// 없으면 처음부터 다시 찾기
		for (let i = 0; i < currentId; i++) {
			if (this.mappings[i].status === 'danger' || this.mappings[i].status === 'warning') {
				return i;
			}
		}
		return -1;
	},

	// 자동으로 다음 수동 매칭창 열기
	autoOpenNext(currentIdx) {
		const nextIdx = this.findNextManualItem(currentIdx);
		if (nextIdx !== -1) {
			this.openManualSearch(nextIdx);
		} else {
			// 더 이상 처리할 항목이 없으면 모달 닫기
			document.getElementById('search-modal').classList.add('hidden');
			UIController.showToast('모든 미매칭 항목의 처리가 완료되었습니다.', 'success');
		}
	},

	// 실시간 피드에서 매핑 취소
	cancelMapping(mappingKey, analysisIdx) {
		if (
			!confirm(
				'해당 매핑을 취소하고 다시 수동 매칭 단계로 되돌릴까요?\n(기존 학습된 매핑 정보도 삭제됩니다.)',
			)
		)
			return;

		// 1. DB에서 기억 삭제
		DatabaseManager.removeMappingMemory(mappingKey);

		// 2. 로컬 AppState 매핑 상태 초기화 (미매칭 상태로)
		// analysisIdx를 통해 해당 원본 데이터를 다시 찾아서 초기화함.
		// 실제로는 mappings 배열에서 해당 idx를 찾아 상태를 danger로 변경
		if (this.mappings[analysisIdx]) {
			this.mappings[analysisIdx].target = null;
			this.mappings[analysisIdx].status = 'danger';
			this.mappings[analysisIdx].similarity = 0;
		}

		// 3. UI 갱신
		this.renderMappingResults();
		this.updateSummary();
		UIController.showToast(
			'매핑이 취소되었습니다. 수동 매칭 목록에서 다시 확인 가능합니다.',
			'info',
		);

		// 4. 피드에서 해당 아이템 삭제 (시각적 피드백)
		const targetFeedItem = document.querySelector(
			`.feed-item[data-mapping-key="${mappingKey.replace(/\|/g, '\\|')}"]`,
		);
		if (targetFeedItem) {
			targetFeedItem.style.opacity = '0.5';
			targetFeedItem.style.pointerEvents = 'none';
			targetFeedItem.innerHTML = `<span class="time">⚠️ 취소됨</span> <span class="action">매핑이 해제되었습니다.</span>`;
			setTimeout(() => targetFeedItem.remove(), 2000);
		}
	},

	// 매핑 제외 기능 (테이블 행 클릭용)
	ignoreItem(idx) {
		if (!this.mappings[idx]) return;

		const item = this.mappings[idx].source;
		if (confirm(`'${item.productName}' 상품을 매핑에서 영구 제외할까요?`)) {
			// 1. UI 상태부터 즉각 업데이트
			this.mappings[idx].status = 'ignored';
			this.mappings[idx].target = null;

			this.renderMappingResults();
			this.updateSummary();

			// 2. 백그라운드에서 DB 저장 시도
			const ignoreKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;
			DatabaseManager.saveIgnoreItem(ignoreKey);

			UIController.showToast('상품이 매핑 제외 목록에 추가되었습니다.', 'info');
		}
	},

	// 매핑 피드 아이템 추가
	addFeedItem(source, target, fromMemory = false, isManual = false) {
		const feedList = document.getElementById('mapping-feed-list');
		if (!feedList) return;

		// '활동 없음' 메시지 제거
		const emptyMsg = feedList.querySelector('.feed-empty');
		if (emptyMsg) emptyMsg.remove();

		const time = new Date().toLocaleTimeString('ko-KR', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
		const typeTag = fromMemory ? '🧠 기억' : isManual ? '✍️ 수동' : '🤖 자동';

		// 매핑 키 생성 (취소 시 사용)
		const mappingKey = `${source.wholesaler}|${source.productName}|${source.color}|${Object.keys(source.quantities)[0] || ''}`;

		// AppState.analyzedData에서의 인덱스 찾기 (원복 시 사용)
		const analysisIdx = AppState.analyzedData.findIndex(
			(item) =>
				item.wholesaler === source.wholesaler &&
				item.productName === source.productName &&
				item.color === source.color &&
				JSON.stringify(item.quantities) === JSON.stringify(source.quantities),
		);

		const item = document.createElement('div');
		item.className = 'feed-item';
		item.setAttribute('data-mapping-key', mappingKey);
		const size = Object.keys(source.quantities)[0] || '';

		item.innerHTML = `
			<div class="feed-item-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
				<span class="time">${time} | ${typeTag}</span>
				<button class="btn-text-xs" onclick="MappingManager.cancelMapping('${mappingKey.replace(/'/g, "\\'")}', ${analysisIdx})"
					style="color:var(--color-danger); border:none; background:none; cursor:pointer; font-size:10px; padding:0;">취소 ↩️</button>
			</div>
			<span class="action">${source.wholesaler} > <strong>${source.productName}, ${source.color}, ${size}</strong></span>
			<span class="detail">✅ [${target.productCode}] 매칭 완료</span>
			<span class="db-info-line" style="display:block; font-size:11px; color:var(--color-text-secondary); margin-top:2px;">
				${target.productName} | ${target.optionName}
			</span>
		`;

		feedList.prepend(item);

		// 너무 많아지면 오래된 것 삭제 (최신 50개 유지)
		if (feedList.childNodes.length > 50) {
			feedList.removeChild(feedList.lastChild);
		}
	},

	// 모든 매팅 데이터(기억 + 제외 목록) 초기화
	async clearAllMappingData() {
		if (
			!confirm(
				'지금까지 학습된 모든 매핑 기억과 제외 목록을 영구적으로 삭제할까요?\n이 작업은 되돌릴 수 없습니다.',
			)
		)
			return;

		await DatabaseManager.clearMappingMemory();
		await DatabaseManager.clearIgnoredItems();

		this.mappings = [];
		this.renderMappingResults();
		this.updateSummary();

		// 피드 초기화
		const feedList = document.getElementById('mapping-feed-list');
		if (feedList) feedList.innerHTML = '<div class="feed-empty">활동 없음</div>';

		UIController.showToast('모든 매핑 정보가 초기화되었습니다.', 'success');
	},

	async downloadMappingDebug() {
		UIController.showToast('전체 매핑 데이터베이스를 추출 중입니다...', 'info');

		// 1. 모든 매핑 기억과 제품 DB 가져오기
		try {
			const memories = await DatabaseManager.getMappingMemory();
			const dbProducts = await DatabaseManager.getAll();

			const headers = [
				'도매인',
				'파일명(최초/최근)',
				'패킹_상품명',
				'패킹_컬러',
				'패킹_사이즈',
				'DB_상품코드',
				'DB_상품명',
				'DB_옵션',
				'학습일시',
			];
			let csv = '\uFEFF' + headers.join(',') + '\n';

			if (memories.length === 0) {
				UIController.showToast('학습된 매핑 데이터가 아직 없습니다.', 'warning');
				return;
			}

			memories.forEach((m) => {
				const [wholesaler, pName, color, size] = m.mappingKey.split('|');
				const product = dbProducts.find((p) => p.productCode === m.productCode);
				const date = new Date(m.timestamp).toLocaleString();

				const row = [
					wholesaler,
					`"${m.fileName || '-'}"`,
					`"${pName}"`,
					`"${color}"`,
					`"${size}"`,
					m.productCode,
					product ? `"${product.productName}"` : '(삭제된 제품)',
					product ? `"${product.optionName}"` : '-',
					`"${date}"`,
				];
				csv += row.join(',') + '\n';
			});

			// 2. 제외 목록(Ignored Items)도 추가
			const ignoredItems = await DatabaseManager.getIgnoredItems();
			if (ignoredItems.length > 0) {
				csv += '\n[매핑 제외 목록]\n';
				csv += '도매인,상품명,컬러,사이즈,처리일시\n';
				ignoredItems.forEach((ig) => {
					const [wholesaler, pName, color, size] = ig.ignoreKey.split('|');
					const date = new Date(ig.timestamp).toLocaleString();
					csv += `${wholesaler},"${pName}","${color}","${size}",${date}\n`;
				});
			}

			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `매핑_마스터_DB_전체_${new Date().getTime()}.csv`;
			a.click();

			let msg = `총 ${memories.length}건의 매핑 기억`;
			if (ignoredItems.length > 0) msg += ` 및 ${ignoredItems.length}건의 제외 목록`;
			UIController.showToast(`${msg}을 다운로드했습니다.`, 'success');
		} catch (error) {
			console.error('Debug Download Error:', error);
			UIController.showToast('데이터 추출 중 오류가 발생했습니다.', 'error');
		}
	},

	// ---------- 4단계: 이지어드민 업로드 파일 생성 로직 ----------
	async generateEzAdminUploadFiles() {
		// 1. 매칭 성공한 항목만 필터링
		const successMappings = this.mappings.filter((m) => m.status === 'success' && m.target);

		if (successMappings.length === 0) {
			UIController.showToast(
				'매칭 성공(초록색)한 항목이 없습니다. 먼저 매핑을 진행해주세요.',
				'warning',
			);
			return;
		}

		// 수량 불일치 안내 (초록색 항목만 내보내기 때문)
		const totalAnalyzedQty = AppState.analyzedData.reduce(
			(sum, item) =>
				sum + Object.values(item.quantities).reduce((a, b) => a + AppState.parseNumber(b), 0),
			0,
		);
		const totalExportQty = successMappings.reduce(
			(sum, m) =>
				sum + Object.values(m.source.quantities).reduce((a, b) => a + AppState.parseNumber(b), 0),
			0,
		);

		if (totalAnalyzedQty !== totalExportQty) {
			const diff = totalAnalyzedQty - totalExportQty;
			UIController.showToast(
				`미매칭 항목 등으로 인해 총 ${diff}개의 수량이 제외되었습니다. (총 ${totalExportQty}개 생성)`,
				'info',
			);
		}

		UIController.showToast('도매인별 이지어드민 업로드 파일을 생성 중입니다...', 'info');

		// 2. 도매인별 그룹화
		const groups = {};
		successMappings.forEach((m) => {
			const wholesaler = m.source.wholesaler || '미지정';
			if (!groups[wholesaler]) groups[wholesaler] = [];
			groups[wholesaler].push(m);
		});

		const today = new Date();
		const yymmdd =
			today.getFullYear().toString().slice(2) +
			String(today.getMonth() + 1).padStart(2, '0') +
			String(today.getDate()).padStart(2, '0');

		const timestamp =
			today.getFullYear() +
			String(today.getMonth() + 1).padStart(2, '0') +
			String(today.getDate()).padStart(2, '0') +
			'_' +
			String(today.getHours()).padStart(2, '0') +
			String(today.getMinutes()).padStart(2, '0') +
			String(today.getSeconds()).padStart(2, '0');

		const generatedFiles = [];

		// 3. 도매인별로 각각 엑셀 파일 생성 및 다운로드 (1:1 매핑 유지)
		for (const [wholesaler, items] of Object.entries(groups)) {
			// 이지어드민 양식: A컬럼(상품코드), B컬럼(수량), C컬럼(메모)
			const excelData = items.map((m) => {
				const qty = Object.values(m.source.quantities).reduce(
					(a, b) => a + AppState.parseNumber(b),
					0,
				);
				return {
					상품코드: m.target.productCode,
					수량: qty,
					메모: `${yymmdd}_${m.source.fileName}`,
				};
			});

			const worksheet = XLSX.utils.json_to_sheet(excelData);

			// 컬럼 너비 설정 (A: 15, B: 10, C: 40)
			worksheet['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 40 }];

			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, 'EzAdmin_Upload');

			const fileName = `[${wholesaler}]${timestamp}.xlsx`;
			XLSX.writeFile(workbook, fileName);

			generatedFiles.push({
				name: fileName,
				wholesaler: wholesaler,
				count: items.length,
				totalQty: excelData.reduce((sum, row) => sum + row.수량, 0),
			});
		}

		// 4. 완료 페이지 정보 업데이트 및 탭 전환
		this.renderCompletionPage(generatedFiles);
		AppState.switchTab('complete-tab');
		UIController.updateProgress(4);
		UIController.showToast('모든 업로드 파일이 생성되었습니다!', 'success');
	},

	renderCompletionPage(files) {
		const listContainer = document.getElementById('generated-files-list');
		const statsContainer = document.getElementById('complete-stats-summary');
		if (!listContainer || !statsContainer) return;

		// 1. 수량 통계 계산
		const totalAnalyzedQty = AppState.analyzedData.reduce(
			(sum, item) =>
				sum + Object.values(item.quantities).reduce((a, b) => a + AppState.parseNumber(b), 0),
			0,
		);

		const totalExportQty = files.reduce((sum, f) => sum + f.totalQty, 0);
		const diffQty = totalAnalyzedQty - totalExportQty;

		// 2. 미생성 사유별 통계
		const stats = {
			ignored: 0,
			failed: 0,
			pending: 0,
		};

		this.mappings.forEach((m) => {
			const qty = Object.values(m.source.quantities).reduce(
				(a, b) => a + AppState.parseNumber(b),
				0,
			);
			if (m.status === 'ignored') stats.ignored += qty;
			else if (m.status === 'failed') stats.failed += qty;
			else if (m.status === 'pending' || !m.target) stats.pending += qty;
		});

		// 3. 통계 UI 렌더링
		statsContainer.innerHTML = `
			<div class="stat-box primary">
				<span class="stat-box-label">📦 분석 총 수량</span>
				<span class="stat-box-value">${totalAnalyzedQty.toLocaleString()}</span>
				<span class="stat-box-sub">패킹리스트 전체</span>
			</div>
			<div class="stat-box success">
				<span class="stat-box-label">✅ 생성 완료</span>
				<span class="stat-box-value">${totalExportQty.toLocaleString()}</span>
				<span class="stat-box-sub">이지어드민 업로드용</span>
			</div>
			<div class="stat-box warning">
				<span class="stat-box-label">⚠️ 미생성 수량</span>
				<span class="stat-box-value">${diffQty.toLocaleString()}</span>
				<div class="detail-reason-list">
					${stats.ignored > 0 ? `<div class="reason-item"><span>매핑 제외</span><span class="reason-count">${stats.ignored.toLocaleString()}</span></div>` : ''}
					${stats.failed > 0 ? `<div class="reason-item"><span>매칭 실패</span><span class="reason-count">${stats.failed.toLocaleString()}</span></div>` : ''}
					${stats.pending > 0 ? `<div class="reason-item"><span>검토 필요</span><span class="reason-count">${stats.pending.toLocaleString()}</span></div>` : ''}
				</div>
			</div>
		`;

		// 4. 파일 목록 렌더링
		listContainer.innerHTML = files
			.map(
				(f) => `
			<div class="generated-file-item">
				<div class="file-info">
					<span class="file-name">${f.name}</span>
					<span class="file-meta">${f.wholesaler} | ${f.count}개 품목 | 총 ${f.totalQty.toLocaleString()}개</span>
				</div>
				<button class="btn-ghost-sm" onclick="UIController.showToast('이미 다운로드되었습니다.', 'info')">다운로드됨</button>
			</div>
		`,
			)
			.join('');

		const summaryText = document.getElementById('complete-summary-text');
		if (summaryText) {
			summaryText.innerHTML = `총 <strong>${files.length}개</strong>의 도매인별 이지어드민 업로드 파일이 생성되었습니다.`;
		}
	},
};

// ========== Initialization ==========
document.addEventListener('DOMContentLoaded', () => {
	AppState.init();
	console.log('EzAdmin Upload Generator (Multi-File Ready) 초기화 완료');
});
