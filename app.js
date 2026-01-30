// ========== App State Management ==========
const AppState = {
	currentStep: 1,
	selectedWholesaler: null, // 전역 기본 도매인
	wholesalers: [],
	uploadedFiles: [], // 여러 파일 저장
	analyzedData: [],
	sheetWholesalers: {}, // { "fileName_sheetName": "wholesalerName" }
	fileSheetCache: {}, // [캐시] { "fileName_size": ["Sheet1", "Sheet2"] }

	init() {
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

		// 2. 타켓 탭 활성화
		const targetContent = document.getElementById(tabId);
		if (targetContent) {
			targetContent.classList.add('active');

			// [수정] 모든 섹션을 다 켜는 게 아니라, 현재 상태에 맞는 섹션만 켬
			if (tabId === 'analysis-tab') {
				if (AppState.analyzedData.length > 0) {
					ExcelAnalyzer.showResults(AppState.analyzedData, true);
				} else {
					UIController.showSection('upload-section');
				}
			} else {
				// 다른 탭들은 첫 번째 섹션을 기본으로 활성화
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

		// 4. 진행 바 연동
		if (tabId === 'mapping-tab') UIController.updateProgress(3);
		else if (tabId === 'analysis-tab' && AppState.analyzedData.length > 0)
			UIController.updateProgress(2);
		else if (tabId === 'analysis-tab') UIController.updateProgress(1);

		// 5. 매핑 탭에 막 들어왔을 때 프로세스
		if (tabId === 'mapping-tab') {
			this.currentTab = tabId;
			this.updateDBStats();

			// 매핑 탭에서는 분석/다음단계 버튼 무조건 숨김
			document.getElementById('analyze-btn')?.classList.add('hidden');
			document.getElementById('next-step-btn')?.classList.add('hidden');

			// 자동 매핑을 한 번도 안 했다면 시작 버튼 노출
			if (AppState.analyzedData.length > 0 && MappingManager.mappings.length === 0) {
				const startBtn = document.getElementById('start-auto-mapping-btn');
				if (startBtn) startBtn.classList.remove('hidden');
			}
		} else {
			// 그 외 탭에서는 모든 플로팅 버튼 숨김 (분석 탭은 내부 showSection에서 제어)
			document.getElementById('start-auto-mapping-btn')?.classList.add('hidden');

			// [추가] 제품 DB 관리 탭 진입 시 실시간 통계 및 매핑 목록 갱신
			if (tabId === 'database-tab') {
				this.currentTab = tabId;
				this.updateDBStats();
			}
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
		this.fileSheetCache = {};
		this.analyzedData = []; // 분석 데이터도 함께 초기화
		this.updateAnalyzeButton();
		UIController.showSection('upload-section'); // 업로드 화면으로 전환
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

	renderMappingMemoryTable(memories) {
		const tbody = document.getElementById('mapping-memory-tbody');
		if (!tbody) return;

		if (!memories || memories.length === 0) {
			tbody.innerHTML =
				'<tr><td colspan="5" class="text-center text-muted">학습된 매핑 데이터가 없습니다.</td></tr>';
			return;
		}

		// 최신순 정렬
		const sorted = [...memories].sort((a, b) => b.timestamp - a.timestamp);

		tbody.innerHTML = '';
		sorted.slice(0, 100).forEach((m) => {
			const [wholesaler, pName, color, size] = m.mappingKey.split('|');
			const tr = document.createElement('tr');
			const dateStr = new Date(m.timestamp).toLocaleDateString();

			tr.innerHTML = `
				<td><div class="mapping-key-display"><strong>${wholesaler}</strong><br><small>${pName}</small></div></td>
				<td>${color} / ${size}</td>
				<td><div class="mapping-target-display"><code>${m.productCode}</code></div></td>
				<td>${dateStr}</td>
				<td>
					<button class="btn btn-ghost btn-xs text-danger" onclick="MappingManager.deleteMappingMemory('${m.mappingKey.replace(/'/g, "\\'")}')">
						삭제
					</button>
				</td>
			`;
			tbody.appendChild(tr);
		});

		if (sorted.length > 100) {
			const moreRow = document.createElement('tr');
			moreRow.innerHTML = `<td colspan="5" class="text-center text-muted py-2" style="font-size:12px;">... 외 ${sorted.length - 100}건은 '디버그 다운로드'로 확인 가능합니다.</td>`;
			tbody.appendChild(moreRow);
		}
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
			try {
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

				// 시트 목록 읽기 (캐싱 적용: 파일 내용이 크면 매우 느림)
				const cacheKey = `${file.name}_${file.size}`;
				let sheetNames = AppState.fileSheetCache[cacheKey];

				if (!sheetNames) {
					const workbook = await this.readWorkbook(file);
					sheetNames = workbook.SheetNames;
					AppState.fileSheetCache[cacheKey] = sheetNames;
				}

				// [수정] 다시 slice(1) 적용: 사용자의 요청으로 첫 번째 시트는 무시함
				sheetNames.slice(1).forEach((sheetName) => {
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
					} else {
						// [지능형 자동 매칭 프리셋]
						const fName = file.name.toLowerCase();
						const sName = sheetName.toLowerCase();

						if (fName.includes('롤라루') || sName.includes('롤라루')) {
							select.value = 'growingup';
							AppState.sheetWholesalers[key] = 'growingup';
						} else if (fName.includes('오즈') || sName.includes('오즈')) {
							select.value = 'dammom';
							AppState.sheetWholesalers[key] = 'dammom';
						} else if (AppState.selectedWholesaler) {
							select.value = AppState.selectedWholesaler;
							AppState.sheetWholesalers[key] = AppState.selectedWholesaler;
						}
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
			} catch (e) {
				console.error(`Error rendering file ${file.name}:`, e);
				UIController.showToast(`${file.name} 시트 정보를 읽지 못했습니다.`, 'error');
			}
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

		UIController.showToast(`${file.name} 데이터를 읽는 중입니다...`, 'info');

		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const data = new Uint8Array(e.target.result);
				// 대용량 파일을 위해 가벼운 읽기 옵션 사용
				const workbook = XLSX.read(data, {
					type: 'array',
					cellDates: true,
					cellStyles: false,
					cellNF: false,
					cellText: false,
				});

				// [수정] 첫 번째 시트 고정이 아니라, 상품 정보가 들어있는 시트를 자동으로 탐색
				let targetSheetName = null;
				let colMap = null;
				let jsonData = [];

				for (const sheetName of workbook.SheetNames) {
					const ws = workbook.Sheets[sheetName];
					const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
					if (!rows || rows.length < 2) continue;

					// 헤더 탐색
					const headers = rows[0] || [];
					const tempMap = {
						code: headers.indexOf('상품코드'),
						name: headers.indexOf('상품명'),
						option: headers.indexOf('옵션'),
						barcode: headers.indexOf('바코드'),
						stock: headers.indexOf('가용재고'),
					};

					if (tempMap.code !== -1 && tempMap.name !== -1) {
						targetSheetName = sheetName;
						colMap = tempMap;
						jsonData = rows;
						break;
					}
				}

				if (!targetSheetName) {
					throw new Error('모든 시트에서 필수 컬럼(상품코드, 상품명)을 찾을 수 없습니다.');
				}

				UIController.showToast('데이터베이스에 저장 중입니다 (잠시만 기다려주세요)...', 'info');

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

				// IndexedDB에 순차적으로 저장 (대량 처리에 안정적)
				await DatabaseManager.saveProducts(products);
				UIController.showToast(
					`${products.length.toLocaleString()}건의 제품이 등록되었습니다.`,
					'success',
				);
				AppState.updateDBStats();
			} catch (error) {
				console.error(error);
				UIController.showToast('파일 처리 중 오류 발생: ' + error.message, 'error');
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
			} else {
				// [추가] 분석 실패 시 알림
				console.warn(`Unknown table structure in ${fileName} - ${sheetName}`);
				UIController.showToast(
					`${fileName} (${sheetName})의 표 구조를 인식할 수 없습니다. '품명' 헤더가 있는지 확인해주세요.`,
					'warning',
				);
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

			// 모든 열을 검사하여 왼쪽/오른쪽 여부 판단 (findIndex의 한계 극복)
			row.forEach((cell, idx) => {
				if (cell && (String(cell).includes('품명') || String(cell).includes('상품명'))) {
					if (idx >= 7) {
						hasRight = true;
					} else {
						hasLeft = true;

						// 왼쪽 표일 경우에만 해당 행에서 그리드 여부 판별
						const rightSide = row.slice(idx + 1, idx + 15);
						const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'FREE'];
						const hasInches = rightSide.some((cell) => cell && String(cell).includes('"'));
						const hasStandardSizes = rightSide.some(
							(cell) =>
								cell && typeof cell === 'string' && commonSizes.includes(cell.toUpperCase().trim()),
						);
						const hasManyNumbers =
							rightSide.filter((cell) => cell !== null && !isNaN(parseFloat(cell))).length > 1;

						if (hasInches || hasManyNumbers || hasStandardSizes) isGrid = true;
					}
				}
			});
		}

		// OZ-오즈 등 복합 시트는 오른쪽(실데이터) 우선 (사용자 요청 반영)
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
				COLOR_COL = row.findIndex(
					(c, idx) =>
						idx > pIdx &&
						c &&
						(String(c).includes('칼라') ||
							String(c).includes('색상') ||
							String(c).includes('컬러')),
				);
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
			if (
				row.some(
					(c) =>
						c &&
						typeof c === 'string' &&
						(c.includes('합계') || c.includes('소계') || c.includes('총계') || c.includes('비고')),
				)
			)
				break;

			let p = row[PRODUCT_COL] ? String(row[PRODUCT_COL]).trim() : null;
			let c = row[COLOR_COL] ? String(row[COLOR_COL]).trim() : null;
			let s =
				SIZE_COL !== -1 && row[SIZE_COL] ? String(row[SIZE_COL]).trim().replace(/"/g, '') : null;
			let q = QTY_COL !== -1 ? parseInt(row[QTY_COL]) : 0;

			const isSummaryRow = row.some(
				(c) =>
					c &&
					typeof c === 'string' &&
					(c.includes('합계') || c.includes('소계') || c.includes('총계') || c.includes('비고')),
			);
			if (isSummaryRow) continue;

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
			const pIdx = row.findIndex(
				(cell) => cell && (String(cell).includes('품명') || String(cell).includes('상품명')),
			);
			if (pIdx !== -1 && pIdx < 6) {
				PRODUCT_COL = pIdx;
				COLOR_COL = row.findIndex(
					(c, idx) =>
						idx > pIdx &&
						c &&
						(String(c).includes('칼라') ||
							String(c).includes('색상') ||
							String(c).includes('컬러')),
				);
				hIdx = i;
				break;
			}
		}

		if (hIdx === -1) return;

		// 사이즈 맵: 인치가 붙었거나 숫자로 된 헤더 탐색
		const headerRow = data[hIdx];
		const sizeMap = [];
		const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'FREE'];
		for (let col = Math.max(PRODUCT_COL, COLOR_COL) + 1; col < headerRow.length; col++) {
			const val = headerRow[col];
			if (
				val &&
				(String(val).includes('"') ||
					commonSizes.includes(String(val).toUpperCase().trim()) ||
					(!isNaN(parseInt(val)) && parseInt(val) > 0))
			) {
				sizeMap.push({ col, label: String(val).trim().replace(/"/g, '') });
			}
		}

		let lastP = null,
			lastC = null;
		for (let i = hIdx + 1; i < data.length; i++) {
			const row = data[i];
			if (!row || row.every((c) => c === null)) continue;

			// 합계/비고 제외
			const isSummaryRow = row.some(
				(c) =>
					c &&
					typeof c === 'string' &&
					(c.includes('합계') || c.includes('소계') || c.includes('총계') || c.includes('비고')),
			);
			if (isSummaryRow) {
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
				const q = row[m.col] ? parseInt(row[m.col]) : 0;
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
			const pIdx = row.findIndex(
				(c, idx) => idx >= 7 && c && (String(c).includes('품명') || String(c).includes('상품명')),
			);
			if (pIdx !== -1) {
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
				(c, idx) =>
					idx > PRODUCT_COL &&
					c &&
					(String(c).includes('칼라') || String(c).includes('색상') || String(c).includes('컬러')),
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
							['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'FREE'].includes(
								String(cell).toUpperCase().trim(),
							) ||
							(!isNaN(cell) && parseInt(cell) > 0))
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
				const isSummaryRow = row.some(
					(c) =>
						c &&
						typeof c === 'string' &&
						(c.includes('합계') || c.includes('소계') || c.includes('총계') || c.includes('비고')),
				);
				if (isSummaryRow) break;

				let p = row[PRODUCT_COL] ? String(row[PRODUCT_COL]).trim() : null;
				let c = row[COLOR_COL] ? String(row[COLOR_COL]).trim() : null;

				// 상속 처리
				if (p) lastP = p;
				else p = lastP;
				if (c) lastC = c;
				else c = lastC;

				if (!p) continue;

				sizeMap.forEach((m) => {
					const q = row[m.col] ? parseInt(row[m.col]) : 0;
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

	showResults(data, isSilent = false) {
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

		if (!isSilent) {
			UIController.showToast('전체 분석이 완료되었습니다!', 'success');
		}
	},

	renderCompleteStats(groups, timestampFull) {
		const statsGrid = document.getElementById('complete-stats-summary');
		const filesList = document.getElementById('generated-files-list');
		if (!statsGrid || !filesList) return;

		statsGrid.innerHTML = '';
		filesList.innerHTML = '';

		let totalQty = 0;
		let totalFiles = 0;

		for (const [wholesaler, items] of Object.entries(groups)) {
			const qty = items.reduce((sum, m) => {
				return sum + Object.values(m.source.quantities).reduce((a, b) => a + (parseInt(b) || 0), 0);
			}, 0);
			totalQty += qty;
			totalFiles++;

			// 1. 통계 그리드 아이템 추가
			const statsItem = document.createElement('div');
			statsItem.className = 'stats-item';
			statsItem.innerHTML = `
				<div class="stats-label">${wholesaler}</div>
				<div class="stats-value">${qty.toLocaleString()} <small>pcs</small></div>
			`;
			statsGrid.appendChild(statsItem);

			// 2. 파일 목록 아이템 추가
			const fileName = `[${wholesaler}]_${timestampFull}.xlsx`;
			const fileItem = document.createElement('div');
			fileItem.className = 'download-item';
			fileItem.innerHTML = `
				<div class="file-info">
					<span class="file-icon">📊</span>
					<span class="file-name">${fileName}</span>
				</div>
				<button class="btn btn-ghost btn-sm" onclick="MappingManager.reDownloadFile('${wholesaler.replace(/'/g, "\\'")}', '${timestampFull}')">
					재다운로드
				</button>
			`;
			filesList.appendChild(fileItem);
		}

		// 요약 텍스트 업데이트
		const summaryText = document.getElementById('complete-summary-text');
		if (summaryText) {
			summaryText.innerHTML = `총 <strong>${totalFiles}</strong>개의 도매인 파일(합계 <strong>${totalQty.toLocaleString()}</strong>개 수량)이 성공적으로 생성되었습니다.`;
		}
	},
};

// AppState 확장: DB 및 매핑 통계 갱신
AppState.updateDBStats = async function () {
	const countEl = document.getElementById('total-db-count');
	const memoryCountEl = document.getElementById('total-memory-count');
	const dbStatusArea = document.getElementById('db-status-area');
	const memorySection = document.getElementById('mapping-memory-section');

	if (countEl) countEl.textContent = '조회 중...';
	if (memoryCountEl) memoryCountEl.textContent = '-';

	// 탭에 맞는 영역만 노출
	if (this.currentTab === 'database-tab') {
		dbStatusArea?.classList.remove('hidden');
	} else if (this.currentTab === 'mapping-tab') {
		memorySection?.classList.remove('hidden');
	}

	if (typeof DatabaseManager !== 'undefined') {
		try {
			const [products, memories] = await Promise.all([
				DatabaseManager.getAll(),
				DatabaseManager.getMappingMemory(),
			]);

			if (countEl) {
				countEl.innerHTML = `<strong style="color:var(--color-primary)">${products.length.toLocaleString()}</strong> 개`;
			}
			if (memoryCountEl) {
				memoryCountEl.innerHTML = `<strong style="color:var(--color-success)">${memories.length.toLocaleString()}</strong> 건`;
			}

			// 매핑 관리 목록 재생성 (현재 탭이 매핑 탭일 때만)
			if (this.currentTab === 'mapping-tab') {
				UIController.renderMappingMemoryTable(memories);
			}
		} catch (e) {
			console.error('Update stats error:', e);
			if (countEl) countEl.textContent = '조회 실패';
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

		// [신규] 헤더 새로고침 버튼
		document.getElementById('header-refresh-btn')?.addEventListener('click', () => {
			if (confirm('모든 데이터를 초기화하고 처음부터 다시 시작하시겠습니까?')) {
				location.reload();
			}
		});

		// [신규] 이지어드민 업로드 파일 생성 버튼
		document.getElementById('generate-ezauto-btn')?.addEventListener('click', () => {
			MappingManager.generateEzAdminFile();
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

// ========== Database Manager (Cloud API Based) ==========
const DatabaseManager = {
	baseUrl:
		window.location.origin === 'http://localhost:3000' ? 'http://localhost:3000/api' : '/api',
	_productCache: null, // [캐시] 서버 데이터 임시 저장

	init(callback) {
		// 클라우드 기반이므로 특별한 초기화 불필요, 즉시 콜백 호출
		console.log('DatabaseManager: Cloud API mode initialized.');
		if (callback) callback();
	},

	// 제품 마스터 DB 가져오기 (캐시 적용)
	async getAll(callback) {
		if (this._productCache) {
			if (callback) callback(this._productCache);
			return this._productCache;
		}

		try {
			const response = await fetch(`${this.baseUrl}/products`);
			const data = await response.json();
			this._productCache = data; // 캐시에 저장
			if (callback) callback(data);
			return data;
		} catch (e) {
			console.error('DatabaseManager.getAll Error:', e);
			if (callback) callback([]);
			return [];
		}
	},

	// 캐시 강제 초기화 (DB 동기화 후 호출)
	clearCache() {
		this._productCache = null;
		console.log('DatabaseManager: Cache cleared.');
	},

	// 매핑 기억 저장 및 조회
	async saveMappingMemory(mappingKey, productCode, fileName) {
		try {
			await fetch(`${this.baseUrl}/mapping-memory`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mappingKey, productCode, fileName }),
			});
		} catch (e) {
			console.error('Save Mapping Memory error:', e);
		}
	},

	async getMappingMemory() {
		try {
			const response = await fetch(`${this.baseUrl}/mapping-memory`);
			return await response.json();
		} catch (e) {
			console.error('Get Mapping Memory error:', e);
			return [];
		}
	},

	async removeMappingMemory(mappingKey) {
		try {
			const res = await fetch(`${this.baseUrl}/mapping-memory`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mappingKey }),
			});
			return res.ok;
		} catch (e) {
			console.error('Remove Mapping Memory error:', e);
			return false;
		}
	},

	// 매핑 제외 저장 및 조회
	async saveIgnoreItem(ignoreKey) {
		try {
			await fetch(`${this.baseUrl}/ignored-items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ignoreKey }),
			});
		} catch (e) {
			console.error('Save Ignore Item error:', e);
		}
	},

	async getIgnoredItems() {
		try {
			const response = await fetch(`${this.baseUrl}/ignored-items`);
			return await response.json();
		} catch (e) {
			console.error('Get Ignored Items error:', e);
			return [];
		}
	},

	// [중요] 분석된 데이터를 서버로 동기화 + 로컬 보관 (2중 보관)
	async saveScheduledAnalysis(items) {
		try {
			// 1. 로컬 백업 (즉시성)
			try {
				localStorage.setItem('scheduled_analysis_backup', JSON.stringify(items));
			} catch (e) {
				console.warn('Local storage backup failed (over capacity?)');
			}

			UIController.showToast(`${items.length}건의 분석 데이터를 동기화 중...`, 'info');

			// 2. 서버 백업
			const response = await fetch(`${this.baseUrl}/scheduled-analysis/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(items),
			});

			if (response.status === 404) {
				console.error('Table not found on server');
				UIController.showToast('서버 테이블이 없어 로컬에만 임시 저장되었습니다.', 'warning');
				return { success: true, localOnly: true };
			}

			return await response.json();
		} catch (e) {
			console.error('Save Scheduled Analysis error:', e);
			UIController.showToast('서버 동기화 실패. 로컬 데이터로 대체합니다.', 'warning');
			return { success: true, localOnly: true };
		}
	},

	async getScheduledAnalysis() {
		try {
			// 1. 서버 데이터 시도
			const response = await fetch(`${this.baseUrl}/scheduled-analysis`);
			const data = await response.json();

			if (data && data.length > 0) return data;

			// 2. 서버에 없다면 로컬 백업 확인
			const localBackup = localStorage.getItem('scheduled_analysis_backup');
			if (localBackup) {
				console.log('Restoring from local backup');
				return JSON.parse(localBackup);
			}

			return [];
		} catch (e) {
			console.error('Get Scheduled Analysis error:', e);
			const localBackup = localStorage.getItem('scheduled_analysis_backup');
			return localBackup ? JSON.parse(localBackup) : [];
		}
	},

	async clearAllMappingMemory() {
		try {
			await fetch(`${this.baseUrl}/mapping-memory/all`, { method: 'DELETE' });
		} catch (e) {
			console.error('Clear Mapping Memory error:', e);
		}
	},

	async clearIgnoredItems() {
		try {
			await fetch(`${this.baseUrl}/ignored-items/all`, { method: 'DELETE' });
		} catch (e) {
			console.error('Clear Ignored Items error:', e);
		}
	},

	async removeIgnoredItem(ignoreKey) {
		try {
			const res = await fetch(`${this.baseUrl}/ignored-items`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ignoreKey }),
			});
			return res.ok;
		} catch (e) {
			console.error('Remove Ignored Item error:', e);
			return false;
		}
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

		// UI 초기화: 진행률 표시기 노출
		const progressArea = document.getElementById('mapping-progress-area');
		const progressBar = document.getElementById('mapping-progress-bar');
		const percentText = document.getElementById('mapping-percent');
		const statsText = document.getElementById('mapping-stats-text');
		const startBtn = document.getElementById('start-auto-mapping-btn');

		progressArea?.classList.remove('hidden');
		startBtn?.classList.add('hidden');

		UIController.showToast('클라우드 매핑 정보를 불러오는 중...', 'info');

		// 0. 클라우드에서 매핑 기억(Memory) 및 제외 목록(Ignored) 병렬 로드
		const [memoryList, ignoredList, dbProducts] = await Promise.all([
			DatabaseManager.getMappingMemory(),
			DatabaseManager.getIgnoredItems(),
			DatabaseManager.getAll(),
		]);

		if (dbProducts.length === 0) {
			UIController.showToast('제품 DB가 비어있습니다. DB를 먼저 구축해주세요.', 'error');
			progressArea?.classList.add('hidden');
			startBtn?.classList.remove('hidden');
			return;
		}

		this.mappings = [];
		const total = sourceData.length;

		UIController.showToast(`지능형 자동 매핑 시작 (${total}건)...`, 'success');

		// 1. 순차적 매핑 진행 (UI 업데이트를 위해 루프 사용)
		for (let i = 0; i < total; i++) {
			const item = sourceData[i];
			const mappingKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;

			let matchResult = null;

			// A. 제외 목록 확인
			const isIgnored = ignoredList.some((ig) => ig.ignoreKey === mappingKey);
			if (isIgnored) {
				matchResult = { source: item, target: null, status: 'ignored', similarity: 0 };
			}
			// B. 기억에서 찾기
			else {
				const remembered = memoryList.find((m) => m.mappingKey === mappingKey);
				if (remembered) {
					const dbProduct = dbProducts.find((p) => p.productCode === remembered.productCode);
					if (dbProduct) {
						matchResult = { source: item, target: dbProduct, status: 'success', similarity: 100 };
					}
				}
			}

			// C. 지능형 매칭 엔진 가동 (기억에 없을 때만)
			if (!matchResult) {
				const best = this.findBestMatch(item, dbProducts);
				matchResult = {
					source: item,
					target: best.product,
					status: best.status,
					similarity: best.similarity,
				};

				// 자동 매칭 성공 시 서버에 기억 저장 (백그라운드)
				if (matchResult.status === 'success' && matchResult.target) {
					DatabaseManager.saveMappingMemory(
						mappingKey,
						matchResult.target.productCode,
						item.fileName,
					);
					this.addFeedItem(item, matchResult.target, false);
				}
			} else {
				// 기억에서 찾은 경우 피드에 표시
				if (matchResult.status === 'success') {
					this.addFeedItem(item, matchResult.target, true);
				}
			}

			this.mappings.push(matchResult);

			// UI 업데이트 (성능을 위해 10개마다 업데이트)
			if (i % 10 === 0 || i === total - 1) {
				const percent = Math.round(((i + 1) / total) * 100);
				if (progressBar) progressBar.style.width = `${percent}%`;
				if (percentText) percentText.textContent = `${percent}%`;
				if (statsText) statsText.textContent = `${i + 1} / ${total} 항목 처리됨`;

				// 브라우저 렌더링을 위해 잠깐 쉼 (대용량 처리 시 필수)
				if (i % 100 === 0) await new Promise((r) => setTimeout(r, 0));
			}
		}

		// 완료 처리
		UIController.showToast('자동 매핑이 완료되었습니다!', 'success');
		document.getElementById('mapping-summary-card')?.classList.remove('hidden');
		this.renderMappingResults();
		this.updateSummary();
	},

	findBestMatch(source, dbList) {
		const normalize = (str) =>
			String(str || '')
				.replace(/\s/g, '')
				.toLowerCase();

		const sName = source.productName.trim();
		const sNameNorm = normalize(sName);
		const sColor = source.color.trim();
		const sColorNorm = normalize(sColor);

		// [원칙] 도매인은 정확히 일치해야 함
		const sWholesaler = source.wholesaler.trim();

		const sSize = normalize(Object.keys(source.quantities)[0] || '');

		let bestMatch = { product: null, status: 'danger', similarity: 0 };

		for (const db of dbList) {
			// 1. 도매인 매칭 (100% 철자 일치 필수)
			if (db.wholesaler !== sWholesaler) continue;

			// DB 제품 데이터 정규화
			const dbFullName = db.productName;
			// '젤리-' 등 수식어 떼기 (하이픈 기준 마지막 요소)
			const dbPureName = dbFullName.includes('-') ? dbFullName.split('-').pop().trim() : dbFullName;
			const dbOption = db.option || db.optionName || '';
			const dbOptionNorm = normalize(dbOption);

			// 2. [완적 일치] 상품명(전체 혹은 순수명)이 같고, 옵션에 컬러와 사이즈가 포함된 경우
			const isNameExactlyMatch =
				normalize(dbFullName) === sNameNorm || normalize(dbPureName) === sNameNorm;

			// [수정] 사이즈 매칭 강화: 'M'이 'mm'에 포함되어 오매칭되는 것 방지
			// 경계선(\b)이나 특수문자 전후를 체크하여 독립적인 사이즈명으로 존재할 때만 인정
			let isSizeMatch = false;
			if (sSize) {
				// S, M, L 같은 단일 문자는 앞뒤가 구분자(괄호, 콜론, 쉼표, 공백)여야 함
				const regex = new RegExp(`(^|[:\\(\\s,\\/])${sSize}([:\\)\\s,\\/]|$)`, 'i');
				isSizeMatch = regex.test(dbOptionNorm);
			}

			// 핑크 vs 진핑크 엄격 구분 로직 포함
			const isColorMatch = sColorNorm && dbOptionNorm.includes(sColorNorm);
			let isPreciseColor = isColorMatch;
			if (isColorMatch && sColorNorm !== dbOptionNorm) {
				const prefixes = ['진', '연', '딥', '라이트', '다크', '핫', '배색', '형광'];
				const isSourceBasic = !prefixes.some((p) => sColorNorm.startsWith(p));
				const isTargetExtended = prefixes.some((p) => dbOptionNorm.includes(p + sColorNorm));

				// 1. 소스는 단순(핑크)인데 타겟이 상세(진핑크)인 경우 방지
				if (isSourceBasic && isTargetExtended && sColorNorm.length < dbOptionNorm.length) {
					isPreciseColor = false;
				}
				// 2. 소스는 상세(진핑크)인데 타겟이 단순(핑크)인 경우도 방지 (포함관계는 OK이나 정확하진 않음)
				if (
					!isSourceBasic &&
					!dbOptionNorm.startsWith(sColorNorm) &&
					sColorNorm.length > dbOptionNorm.length
				) {
					isPreciseColor = false;
				}
			}

			if (isNameExactlyMatch && isPreciseColor && isSizeMatch) {
				return { product: db, status: 'success', similarity: 100 };
			}

			// 3. [부분 일치]
			if (
				isNameExactlyMatch ||
				sNameNorm.includes(normalize(dbPureName)) ||
				normalize(dbPureName).includes(sNameNorm)
			) {
				const colorSim = this.calculateSimilarity(sColorNorm, dbOptionNorm);
				const totalSim = colorSim * 0.7 + (isSizeMatch ? 30 : 0);
				if (totalSim > 60) {
					const status = colorSim > 80 && isSizeMatch ? 'success' : 'warning';
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
		if (!tbody) return;
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

		// [최적화] 전체를 다 그리지 않고 상위 100개만 우선 렌더링 (성능 핵심)
		const slice = listToShow.slice(0, 100);
		const fragment = document.createDocumentFragment();

		slice.forEach((m) => {
			const originalIdx = this.mappings.indexOf(m);
			const tr = document.createElement('tr');
			tr.id = `mapping-row-${originalIdx}`; // 행 추적용 ID

			const statusBadge = `<span class="badge badge-${m.status}">${m.status === 'warning' ? '검토 필요' : '매칭 실패'}</span>`;
			const dbInfo = m.target
				? `
				<div class="mapping-db-item">
					<strong>[${m.target.productCode}]</strong> ${m.target.productName}<br>
					<small>옵션: ${m.target.optionName || m.target.option || '-'}</small>
				</div>
			`
				: '<span class="text-muted">매칭된 정보 없음</span>';

			const sourceQty = Object.values(m.source.quantities)[0] || 0;

			tr.innerHTML = `
				<td>${statusBadge}</td>
				<td>${m.source.wholesaler}</td>
				<td>
					<div class="mapping-source-item" style="font-size:14px; line-height:1.4;">
						<strong style="color:var(--color-text-primary);">${m.source.productName}</strong><br>
						<span style="color:var(--color-primary); font-weight:700; border-bottom:1px solid var(--color-primary);">${m.source.color}</span>
						<span style="color:var(--color-text-tertiary);">|</span>
						<strong style="font-size:16px; color:#2c3e50; background:#f1f2f6; padding:2px 6px; border-radius:4px;">${Object.keys(m.source.quantities)[0] || ''}</strong>
					</div>
				</td>
				<td>${dbInfo}</td>
				<td>${sourceQty}</td>
				<td>
					<div class="flex-gap-sm">
						<button class="btn btn-secondary btn-sm" onclick="MappingManager.openManualSearch(${originalIdx})">매칭</button>
						<button class="btn btn-ghost btn-xs" onclick="MappingManager.ignoreItem(${originalIdx})" title="제외">🚫</button>
					</div>
				</td>
			`;
			fragment.appendChild(tr);
		});

		tbody.appendChild(fragment);
		if (listToShow.length > 100) {
			const moreTr = document.createElement('tr');
			moreTr.className = 'more-info-row';
			moreTr.innerHTML = `<td colspan="6" class="text-center text-muted py-2" style="background:var(--color-bg-secondary); font-size:12px;">
				...외 ${listToShow.length - 100}건이 더 있습니다. 성능을 위해 상위 100건을 먼저 처리해 주세요.
			</td>`;
			tbody.appendChild(moreTr);
		}

		this.updateSummary();
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
		const colorKeyword = mapping.source.color || '';
		const sizeKeyword = Object.keys(mapping.source.quantities)[0] || '';

		// 한국어 색상명 -> CSS 컬러 맵핑
		const colorMap = {
			검정: '#2c3e50',
			블랙: '#2c3e50',
			네이비: '#1a2a6c',
			청: '#3498db',
			빨강: '#e74c3c',
			레드: '#e74c3c',
			핑크: '#ff7675',
			분홍: '#ff7675',
			하양: '#ffffff',
			화이트: '#ffffff',
			아이: '#f9f9f9',
			베이지: '#f5f5dc',
			노랑: '#f1c40f',
			옐로우: '#f1c40f',
			초록: '#27ae60',
			그린: '#27ae60',
			회색: '#95a5a6',
			그레이: '#95a5a6',
			먹색: '#34495e',
			브라운: '#a1887f',
			갈색: '#a1887f',
			카멜: '#c19a6b',
			소라: '#a2d2ff',
			민트: '#55efc4',
		};
		const bgColor = colorMap[colorKeyword] || '#bdc3c7';
		const textColor = ['하양', '화이트', '아이', '베이지', '옐로우', '노랑'].includes(colorKeyword)
			? '#333'
			: '#fff';

		helperArea.innerHTML = `
			<p class="helper-label">💡 키워드 추천 (클릭하여 추가):</p>
			<div class="keywords-list">
				${nameKeywords.map((k) => `<span class="clickable-keyword" onclick="MappingManager.addKeyword('${k.replace(/'/g, "\\'")}')">${k}</span>`).join('')}
				<span class="clickable-keyword keyword-color"
					style="background-color:${bgColor}; color:${textColor};"
					onclick="MappingManager.addKeyword('${colorKeyword.replace(/'/g, "\\'")}')">🎨 ${colorKeyword}</span>
				<span class="clickable-keyword keyword-size"
					onclick="MappingManager.addKeyword('${sizeKeyword.replace(/'/g, "\\'")}')">📏 ${sizeKeyword}</span>
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
		if (!query) return;

		if (!isAuto) {
			this.lastQuery = query;
		}

		const keywords = query.toLowerCase().split(/\s+/);
		const currentWholesaler = this.mappings[this.currentManualIdx].source.wholesaler;

		// 캐시된 데이터를 사용하여 즉시 검색 (초고속)
		const dbProducts = await DatabaseManager.getAll();
		let results = dbProducts.filter((p) => {
			if (p.wholesaler !== currentWholesaler) return false;

			const fullText = (
				p.productName +
				' ' +
				(p.option || p.optionName || '') +
				' ' +
				(p.productCode || '')
			).toLowerCase();
			return keywords.every((k) => fullText.includes(k));
		});

		// [중요] 상품명끼리 묶고 옵션 오름차순 정렬
		results.sort((a, b) => {
			// 1. 상품명 비교
			if (a.productName < b.productName) return -1;
			if (a.productName > b.productName) return 1;

			// 2. 상품명이 같으면 옵션 비교 (오름차순)
			const optA = a.option || a.optionName || '';
			const optB = b.option || b.optionName || '';
			return optA.localeCompare(optB, 'ko');
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

		results.slice(0, 50).forEach((p) => {
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

			// 상태 즉시 업데이트
			this.mappings[idx].target = selected;
			this.mappings[idx].status = 'success';

			// [혁신] 전체 렌더링을 피하고 해당 행만 삭제하거나 UI 갱신 후 다음으로 이동
			const row = document.getElementById(`mapping-row-${idx}`);
			if (row) row.remove(); // 성공했으니 리스트에서 즉시 제거

			// 1. 수동 매칭 결과 기억 저장 (비동기로 백그라운드 처리 - 기다리지 않음)
			const mappingKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;
			DatabaseManager.saveMappingMemory(mappingKey, selected.productCode, item.fileName);

			// 2. 실시간 피드 추가
			this.addFeedItem(item, selected, false, true);

			this.updateSummary();
			UIController.showToast('매칭 완료!', 'success');

			// 3. 바로 다음 항목으로 점프
			this.autoOpenNext(idx);
		}
	},

	// 매핑 제외 기능 (모달 내부용)
	ignoreCurrentItem() {
		const idx = this.currentManualIdx;
		const item = this.mappings[idx].source;
		if (confirm(`'${item.productName}' 상품을 매핑에서 영구 제외할까요?`)) {
			const ignoreKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;
			DatabaseManager.saveIgnoreItem(ignoreKey);

			this.mappings[idx].status = 'ignored';
			this.renderMappingResults();
			this.updateSummary();
			UIController.showToast('상품이 매핑 제외 목록에 추가되었습니다.', 'info');

			// 자동으로 다음 미매칭 항목 열기
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

	// 매핑 제외 기능
	ignoreItem(idx) {
		const item = this.mappings[idx].source;
		if (confirm(`'${item.productName}' 상품을 매핑에서 영구 제외할까요?`)) {
			const ignoreKey = `${item.wholesaler}|${item.productName}|${item.color}|${Object.keys(item.quantities)[0] || ''}`;
			DatabaseManager.saveIgnoreItem(ignoreKey);

			this.mappings[idx].status = 'ignored';
			this.renderMappingResults();
			this.updateSummary();
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
				'지금까지 학습된 모든 매핑 기억과 제외 목록, 그리고 현재 분석된 데이터를 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.',
			)
		)
			return;

		await Promise.all([
			DatabaseManager.clearAllMappingMemory(),
			DatabaseManager.clearIgnoredItems(),
			DatabaseManager.saveScheduledAnalysis([]), // 서버 분석 데이터 비우기
		]);

		this.mappings = [];
		AppState.analyzedData = [];
		this.renderMappingResults();
		this.updateSummary();

		// 피드 초기화
		const feedList = document.getElementById('mapping-feed-list');
		if (feedList) feedList.innerHTML = '<div class="feed-empty">활동 없음</div>';

		UIController.showToast('모든 매핑 정보가 초기화되었습니다.', 'success');
	},

	// 개별 매핑 기억 삭제
	async deleteMappingMemory(mappingKey) {
		if (
			!confirm(
				'해당 매핑 학습 데이터를 삭제하시겠습니까?\n이후 자동 매칭 시 이 항목은 다시 수동으로 매칭해야 합니다.',
			)
		)
			return;

		const success = await DatabaseManager.removeMappingMemory(mappingKey);
		if (success) {
			UIController.showToast('매핑 기억이 성공적으로 삭제되었습니다.', 'success');
			AppState.updateDBStats(); // 통계 및 목록 갱신
		} else {
			UIController.showToast('삭제 중 오류가 발생했습니다.', 'error');
		}
	},

	// [중요] 이지어드민 업로드 파일 생성 (엑셀 .xlsx 형식 + 도매인 분리 규칙)
	async generateEzAdminFile() {
		const successMappings = this.mappings.filter((m) => m.status === 'success' && m.target);
		if (successMappings.length === 0) {
			UIController.showToast('매칭 성공한 항목이 없습니다.', 'warning');
			return;
		}

		// 1. 도매인별로 데이터 그룹화
		const groups = {};
		successMappings.forEach((m) => {
			const wholesaler = m.source.wholesaler || '미지정';
			if (!groups[wholesaler]) groups[wholesaler] = [];
			groups[wholesaler].push(m);
		});

		const now = new Date();
		const yymmddShort =
			now.getFullYear().toString().slice(2) +
			String(now.getMonth() + 1).padStart(2, '0') +
			String(now.getDate()).padStart(2, '0');
		const timestampFull =
			yymmddShort +
			String(now.getHours()).padStart(2, '0') +
			String(now.getMinutes()).padStart(2, '0') +
			String(now.getSeconds()).padStart(2, '0');

		UIController.showToast(
			`총 ${Object.keys(groups).length}개의 엑셀 파일을 생성합니다...`,
			'info',
		);

		// 2. 각 도매인별로 엑셀(.xlsx) 생성 및 다운로드
		for (const [wholesaler, items] of Object.entries(groups)) {
			try {
				// [이지어드민 규칙] 상품코드, 수량, 메모
				const excelData = items.map((m) => {
					const qty = Object.values(m.source.quantities).reduce(
						(a, b) => a + (parseInt(b) || 0),
						0,
					);
					return {
						상품코드: m.target.productCode,
						수량: qty,
						메모: `${yymmddShort}_${m.source.fileName}`,
					};
				});

				// 시트 생성 및 컬럼 너비 조정
				const worksheet = XLSX.utils.json_to_sheet(excelData);
				worksheet['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 40 }];

				const workbook = XLSX.utils.book_new();
				XLSX.utils.book_append_sheet(workbook, worksheet, 'EzAdmin_Upload');

				// 파일명: [도매인]_yymmddhhmmss.xlsx
				const fileName = `[${wholesaler}]_${timestampFull}.xlsx`;

				// 라이브러리를 이용한 브라우저 직접 다운로드
				XLSX.writeFile(workbook, fileName);
			} catch (error) {
				console.error(`${wholesaler} 엑셀 생성 오류:`, error);
				UIController.showToast(`${wholesaler} 파일 생성 중 오류가 발생했습니다.`, 'error');
			}
		}

		UIController.showToast('모든 도매인별 엑셀 파일 다운로드가 완료되었습니다.', 'success');

		// 3. 작업 완료 탭으로 이동 및 결과 표시
		AppState.switchTab('complete-tab');
		UIController.renderCompleteStats(groups, timestampFull);
	},

	// 완료 화면에서 특정 도매인 파일 다시 다운로드
	reDownloadFile(wholesaler, timestamp) {
		const successMappings = this.mappings.filter(
			(m) =>
				m.status === 'success' &&
				m.target &&
				(m.source.wholesaler === wholesaler || (!m.source.wholesaler && wholesaler === '미지정')),
		);

		if (successMappings.length === 0) return;

		try {
			const yymmddShort = timestamp.substring(0, 6);
			const excelData = successMappings.map((m) => {
				const qty = Object.values(m.source.quantities).reduce((a, b) => a + (parseInt(b) || 0), 0);
				return {
					상품코드: m.target.productCode,
					수량: qty,
					메모: `${yymmddShort}_${m.source.fileName}`,
				};
			});

			const worksheet = XLSX.utils.json_to_sheet(excelData);
			worksheet['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 40 }];
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, 'EzAdmin_Upload');
			XLSX.writeFile(workbook, `[${wholesaler}]_${timestamp}.xlsx`);
		} catch (e) {
			console.error('Redownload error:', e);
		}
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
				// 키 분해 (도매인|상품명|컬러|사이즈)
				const [wholesaler, pName, color, size] = m.mappingKey.split('|');
				// 제품 정보 찾기
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

			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `매핑_마스터_DB_전체_${new Date().getTime()}.csv`;
			a.click();
			UIController.showToast(
				`총 ${memories.length}건의 전체 학습 데이터를 다운로드했습니다.`,
				'success',
			);
		} catch (error) {
			console.error('Debug Download Error:', error);
			UIController.showToast('데이터 추출 중 오류가 발생했습니다.', 'error');
		}
	},
};

// ========== Initialization ==========
document.addEventListener('DOMContentLoaded', () => {
	AppState.init();
	console.log('EzAdmin Upload Generator (Multi-File Ready) 초기화 완료');
});
