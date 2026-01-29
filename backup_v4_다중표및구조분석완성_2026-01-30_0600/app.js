// ========== App State Management ==========
const AppState = {
	currentStep: 1,
	selectedWholesaler: null, // 전역 기본 도매인
	wholesalers: [],
	uploadedFiles: [], // 여러 파일 저장
	analyzedData: [],
	sheetWholesalers: {}, // { "fileName_sheetName": "wholesalerName" }

	init() {
		this.loadWholesalers();
	},

	loadWholesalers() {
		const saved = localStorage.getItem('wholesalers');
		if (saved) {
			this.wholesalers = JSON.parse(saved);
			this.renderWholesalerTags();
			this.updateWholesalerSelect();
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
		this.updateWholesalerSelect();
		return true;
	},

	removeWholesaler(name) {
		this.wholesalers = this.wholesalers.filter((w) => w !== name);
		this.saveWholesalers();
		this.renderWholesalerTags();
		this.updateWholesalerSelect();
		if (this.selectedWholesaler === name) {
			this.selectedWholesaler = null;
		}
	},

	setWholesaler(name) {
		this.selectedWholesaler = name;
		this.updateAnalyzeButton();
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

	renderWholesalerTags() {
		const container = document.getElementById('wholesaler-tags');
		if (!container) return;
		container.innerHTML = '';

		this.wholesalers.forEach((wholesaler) => {
			const tag = document.createElement('div');
			tag.className = 'wholesaler-tag';
			tag.innerHTML = `
                <span>${wholesaler}</span>
                <button class="tag-remove-btn" data-wholesaler="${wholesaler}">×</button>
            `;
			container.appendChild(tag);

			tag.querySelector('.tag-remove-btn').addEventListener('click', (e) => {
				this.removeWholesaler(e.target.dataset.wholesaler);
			});
		});
	},

	updateWholesalerSelect() {
		// 전역 드롭다운이 제거되었으므로 태그 렌더링만 수행
		this.renderWholesalerTags();
	},
};

// ========== UI Controllers ==========
const UIController = {
	showSection(sectionId) {
		document.querySelectorAll('.section').forEach((section) => {
			section.classList.remove('active');
		});
		const target = document.getElementById(sectionId);
		if (target) target.classList.add('active');
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
			let q = QTY_COL !== -1 ? parseInt(row[QTY_COL]) : 0;

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

	showResults(data) {
		UIController.showSection('results-section');
		UIController.updateProgress(3);

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
			UIController.showToast('매핑 기능은 준비 중입니다.', 'info');
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

// ========== Initialization ==========
document.addEventListener('DOMContentLoaded', () => {
	AppState.init();
	FileHandler.init();
	WholesalerManager.init();
	EventListeners.init();
	console.log('EzAdmin Upload Generator (Multi-File Ready) 초기화 완료');
});
