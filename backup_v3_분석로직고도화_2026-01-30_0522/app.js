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
		const sheetNames = workbook.SheetNames.slice(1);

		sheetNames.forEach((sheetName) => {
			const key = `${fileName}_${sheetName}`;
			const wholesaler = AppState.sheetWholesalers[key];
			if (!wholesaler) return;

			const sheet = workbook.Sheets[sheetName];
			const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

			if (!data || data.length === 0) return;

			const tableType = this.detectTableType(data);
			if (tableType === 'left') {
				this.extractFromLeftTable(data, sheetName, fileName, wholesaler, results);
			} else if (tableType === 'right') {
				this.extractFromRightTable(data, sheetName, fileName, wholesaler, results);
			}
		});

		return results;
	},

	detectTableType(data) {
		// 상단 20개 행에서 '품명' 위치를 검색하여 표 형식 판단
		for (let i = 0; i < Math.min(data.length, 20); i++) {
			const row = data[i] || [];
			// 오른쪽 형식 (index 11)
			if (row[11] && String(row[11]).includes('품명')) return 'right';
			// 왼쪽 형식 (index 2 또는 3)
			if (
				(row[2] && String(row[2]).includes('품명')) ||
				(row[3] && String(row[3]).includes('품명'))
			)
				return 'left';
		}
		return 'unknown';
	},

	extractFromLeftTable(data, sheetName, fileName, wholesaler, results) {
		// 헤더 행을 찾아 컬럼 인덱스 자동 결정
		let PRODUCT_COL = 2;
		let COLOR_COL = 3;
		let SIZE_COL = 4;
		let QTY_COL = 7;
		let startIdx = 2;

		for (let i = 0; i < Math.min(data.length, 10); i++) {
			const row = data[i] || [];
			if (row.some((cell) => cell && String(cell).includes('품명'))) {
				PRODUCT_COL = row.findIndex((cell) => cell && String(cell).includes('품명'));
				COLOR_COL = row.findIndex((cell) => cell && String(cell).includes('칼라'));
				SIZE_COL = row.findIndex((cell) => cell && String(cell).includes('사이즈'));
				QTY_COL = row.findIndex((cell) => cell && String(cell).includes('총수량'));
				startIdx = i + 1;
				break;
			}
		}

		let lastProduct = null;
		let lastColor = null;

		for (let i = startIdx; i < data.length; i++) {
			const row = data[i];
			if (!row || row.length < Math.max(PRODUCT_COL, COLOR_COL, SIZE_COL, QTY_COL)) continue;

			let productName =
				PRODUCT_COL !== -1 && row[PRODUCT_COL] ? String(row[PRODUCT_COL]).trim() : null;
			let color = COLOR_COL !== -1 && row[COLOR_COL] ? String(row[COLOR_COL]).trim() : null;
			const rawSize = SIZE_COL !== -1 && row[SIZE_COL] ? String(row[SIZE_COL]).trim() : null;
			const size = rawSize ? rawSize.replace(/"/g, '') : null;
			const qty = QTY_COL !== -1 && row[QTY_COL] ? parseInt(row[QTY_COL]) : 0;

			if (!productName) productName = lastProduct;
			else lastProduct = productName;

			if (!color) color = lastColor;
			else lastColor = color;

			if (productName && size && qty > 0) {
				results.push({
					wholesaler: wholesaler,
					fileName: fileName,
					sheet: sheetName,
					productName: productName,
					color: color || '-',
					quantities: { [size]: qty },
				});
			}
		}
	},

	extractFromRightTable(data, sheetName, fileName, wholesaler, results) {
		const PRODUCT_COL = 11;
		const COLOR_COL = 12;

		// 모든 헤더 위치("품명")를 찾음
		const headerIndices = [];
		data.forEach((row, idx) => {
			if (row && row[PRODUCT_COL] && String(row[PRODUCT_COL]).includes('품명')) {
				headerIndices.push(idx);
			}
		});

		if (headerIndices.length === 0) return;

		headerIndices.forEach((hIdx, listIdx) => {
			const sizeRow = data[hIdx + 1];
			if (!sizeRow) return;

			// 사이즈 맵 구성
			const sizeMap = [];
			for (let col = 14; col < sizeRow.length; col++) {
				const val = sizeRow[col];
				if (val) {
					const label = String(val).trim().replace(/"/g, '');
					sizeMap.push({ col, label });
				}
			}

			const nextHeaderIdx = headerIndices[listIdx + 1] || data.length;
			let lastProduct = null;
			let lastColor = null;

			for (let i = hIdx + 2; i < nextHeaderIdx; i++) {
				const row = data[i];
				if (!row) continue;

				// 합계 행이나 빈 행 건너뜀
				if (row[0] && String(row[0]).includes('합계')) break;

				let productName = row[PRODUCT_COL] ? String(row[PRODUCT_COL]).trim() : null;
				let color = row[COLOR_COL] ? String(row[COLOR_COL]).trim() : null;

				// 제품명이 없고 합계(index 13)나 수량 데이터가 전혀 없으면 데이터 행이 아님
				if (!productName && !row[13] && !row[14]) continue;

				// 병합 셀 처리
				if (!productName) productName = lastProduct;
				else lastProduct = productName;

				if (!color) color = lastColor;
				else lastColor = color;

				if (!productName) continue;

				sizeMap.forEach((m) => {
					const q = row[m.col] ? parseInt(row[m.col]) : 0;
					if (q > 0) {
						results.push({
							wholesaler: wholesaler,
							fileName: fileName,
							sheet: sheetName,
							productName: productName,
							color: color || '-',
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
