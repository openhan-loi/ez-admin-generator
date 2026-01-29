// ========== App State Management ==========
const AppState = {
	currentStep: 1,
	selectedWholesaler: null,
	wholesalers: [],
	uploadedFile: null,
	analyzedData: [],

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

	setFile(file) {
		this.uploadedFile = file;
		this.updateAnalyzeButton();
	},

	updateAnalyzeButton() {
		const analyzeBtn = document.getElementById('analyze-btn');
		analyzeBtn.disabled = !(this.uploadedFile && this.selectedWholesaler);
	},

	renderWholesalerTags() {
		const container = document.getElementById('wholesaler-tags');
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
		const select = document.getElementById('wholesaler-select');
		const currentValue = select.value;

		select.innerHTML = '<option value="">-- 도매인 선택하기 --</option>';
		this.wholesalers.forEach((wholesaler) => {
			const option = document.createElement('option');
			option.value = wholesaler;
			option.textContent = wholesaler;
			select.appendChild(option);
		});

		if (currentValue && this.wholesalers.includes(currentValue)) {
			select.value = currentValue;
		}
	},
};

// ========== UI Controllers ==========
const UIController = {
	showSection(sectionId) {
		document.querySelectorAll('.section').forEach((section) => {
			section.classList.remove('active');
		});
		document.getElementById(sectionId).classList.add('active');
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
		const toast = document.createElement('div');
		toast.className = `toast ${type}`;

		const icons = {
			success: '✅',
			error: '❌',
			info: 'ℹ️',
			warning: '⚠️',
		};

		toast.innerHTML = `
            <div class="toast-icon">${icons[type]}</div>
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
		const removeFileBtn = document.getElementById('remove-file-btn');

		// 파일 선택 버튼
		selectFileBtn.addEventListener('click', () => fileInput.click());
		fileUploadArea.addEventListener('click', (e) => {
			if (e.target === fileUploadArea || e.target.closest('.upload-text')) {
				fileInput.click();
			}
		});

		// 파일 선택
		fileInput.addEventListener('change', (e) => {
			const file = e.target.files[0];
			if (file) {
				this.handleFile(file);
			}
		});

		// 드래그 앤 드롭
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
			const file = e.dataTransfer.files[0];
			if (file) {
				this.handleFile(file);
			}
		});

		// 파일 제거
		removeFileBtn.addEventListener('click', () => {
			this.removeFile();
		});
	},

	handleFile(file) {
		// 파일 형식 검증
		const validExtensions = ['xlsx', 'xls', 'csv'];
		const extension = file.name.split('.').pop().toLowerCase();

		if (!validExtensions.includes(extension)) {
			UIController.showToast(
				'지원하지 않는 파일 형식입니다. .xlsx, .xls, .csv 파일만 업로드 가능합니다.',
				'error',
			);
			return;
		}

		// 파일 크기 검증 (10MB 제한)
		if (file.size > 10 * 1024 * 1024) {
			UIController.showToast('파일 크기는 10MB를 초과할 수 없습니다.', 'error');
			return;
		}

		// 파일 저장
		AppState.setFile(file);

		// UI 업데이트
		document.getElementById('file-name').textContent = file.name;
		document.getElementById('file-size').textContent = UIController.formatFileSize(file.size);
		document.getElementById('file-info').classList.remove('hidden');
		document.getElementById('file-upload-area').style.display = 'none';

		UIController.showToast('파일이 업로드되었습니다.', 'success');
	},

	removeFile() {
		AppState.setFile(null);
		document.getElementById('file-input').value = '';
		document.getElementById('file-info').classList.add('hidden');
		document.getElementById('file-upload-area').style.display = 'block';
		UIController.showToast('파일이 제거되었습니다.', 'info');
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
		const select = document.getElementById('wholesaler-select');

		// 도매인 추가 버튼
		addBtn.addEventListener('click', () => {
			form.classList.remove('hidden');
			input.focus();
		});

		// 취소 버튼
		cancelBtn.addEventListener('click', () => {
			form.classList.add('hidden');
			input.value = '';
		});

		// 저장 버튼
		saveBtn.addEventListener('click', () => {
			this.saveWholesaler();
		});

		// 엔터키로 저장
		input.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				this.saveWholesaler();
			}
		});

		// 도매인 선택
		select.addEventListener('change', (e) => {
			AppState.setWholesaler(e.target.value);
			if (e.target.value) {
				UIController.showToast(`${e.target.value} 도매인이 선택되었습니다.`, 'success');
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

			// 자동으로 선택
			document.getElementById('wholesaler-select').value = name;
			AppState.setWholesaler(name);
		} else {
			UIController.showToast('이미 등록된 도매인입니다.', 'error');
		}
	},
};

// ========== Excel Analyzer ==========
const ExcelAnalyzer = {
	async analyzeFile() {
		if (!AppState.uploadedFile) {
			UIController.showToast('파일을 먼저 업로드하세요.', 'error');
			return;
		}

		if (!AppState.selectedWholesaler) {
			UIController.showToast('도매인을 먼저 선택하세요.', 'error');
			return;
		}

		// 분석 중 화면으로 전환
		UIController.showSection('analyzing-section');
		UIController.updateProgress(2);

		try {
			// 파일 읽기 (workbook 반환)
			const workbook = await this.readExcelFile(AppState.uploadedFile);

			// 진행률 업데이트
			this.updateProgress(30);

			// 데이터 분석
			const analyzedData = this.extractProductInfo(workbook);

			this.updateProgress(70);

			// 결과 저장
			AppState.analyzedData = analyzedData;

			this.updateProgress(100);

			// 잠시 대기 후 결과 화면으로
			setTimeout(() => {
				this.showResults(analyzedData);
			}, 500);
		} catch (error) {
			console.error('분석 오류:', error);
			UIController.showToast('파일 분석 중 오류가 발생했습니다: ' + error.message, 'error');
			UIController.showSection('upload-section');
			UIController.updateProgress(1);
		}
	},

	readExcelFile(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onload = (e) => {
				try {
					const data = new Uint8Array(e.target.result);
					const workbook = XLSX.read(data, { type: 'array' });
					resolve(workbook);
				} catch (error) {
					reject(error);
				}
			};

			reader.onerror = () => {
				reject(new Error('파일을 읽을 수 없습니다.'));
			};

			reader.readAsArrayBuffer(file);
		});
	},

	extractProductInfo(workbook) {
		const results = [];

		// 모든 시트 처리 (첫 번째 시트는 통관용이므로 제외)
		const sheetNames = workbook.SheetNames.slice(1);

		if (sheetNames.length === 0) {
			throw new Error('분석할 시트가 없습니다. 최소 2개 이상의 시트가 필요합니다.');
		}

		UIController.showToast(`${sheetNames.length}개 시트 분석 중...`, 'info');

		sheetNames.forEach((sheetName, sheetIdx) => {
			const sheet = workbook.Sheets[sheetName];
			const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

			console.log(`시트 ${sheetIdx + 2}: ${sheetName} (${data.length} 행)`);

			// 오른쪽 표의 구조:
			// 열 11: 품명
			// 열 12: 칼라
			// 열 14~26: 사이즈별 수량
			const PRODUCT_COL = 11;
			const COLOR_COL = 12;
			const SIZE_ROW = 1;
			const DATA_START_ROW = 2;

			// 사이즈 컬럼 찾기
			const sizeColumns = [];
			const sizes = [];

			if (data[SIZE_ROW]) {
				for (let col = 14; col < Math.min(28, data[SIZE_ROW].length); col++) {
					const cellValue = data[SIZE_ROW][col];
					if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
						const sizeStr = String(cellValue).trim();

						const sizeNum = parseInt(sizeStr);
						if (!isNaN(sizeNum) && sizeNum >= 100 && sizeNum <= 250) {
							sizes.push(String(sizeNum));
							sizeColumns.push(col);
						} else if (['L', 'FREE', 'XL', 'XXL', 'M', 'S', 'XS'].includes(sizeStr)) {
							sizes.push(sizeStr);
							sizeColumns.push(col);
						}
					}
				}
			}

			console.log(`  발견된 사이즈: ${sizes.join(', ')}`);

			if (sizes.length === 0) {
				console.warn(`  시트 "${sheetName}"에서 사이즈를 찾을 수 없습니다.`);
				return;
			}

			// 데이터 행 추출
			for (let rowIdx = DATA_START_ROW; rowIdx < data.length; rowIdx++) {
				const row = data[rowIdx];
				if (!row) continue;

				const productName = row[PRODUCT_COL];
				if (!productName || String(productName).trim() === '') {
					continue;
				}

				const productNameStr = String(productName).trim();
				const colorValue = row[COLOR_COL];
				const color = colorValue ? String(colorValue).trim() : '-';

				const quantities = {};
				let hasQuantity = false;

				for (let i = 0; i < sizes.length; i++) {
					const size = sizes[i];
					const col = sizeColumns[i];
					const qtyValue = row[col];

					if (qtyValue !== null && qtyValue !== undefined && qtyValue !== '' && qtyValue !== 0) {
						const qty = parseFloat(qtyValue);
						if (!isNaN(qty) && qty > 0) {
							quantities[size] = Math.floor(qty);
							hasQuantity = true;
						}
					}
				}

				if (hasQuantity) {
					results.push({
						wholesaler: AppState.selectedWholesaler,
						fileName: AppState.uploadedFile.name,
						sheet: sheetName,
						productName: productNameStr,
						color: color,
						quantities: quantities,
					});
				}
			}
		});

		return results;
	},

	updateProgress(percent) {
		const fill = document.getElementById('progress-bar-fill');
		const text = document.getElementById('progress-text');
		fill.style.width = percent + '%';
		text.textContent = percent + '%';
	},

	showResults(data) {
		// 결과 화면으로 전환
		UIController.showSection('results-section');
		UIController.updateProgress(3);

		// 각 제품의 총 수량 계산
		const totalQuantity = data.reduce((sum, item) => {
			const itemTotal = Object.values(item.quantities).reduce((a, b) => a + b, 0);
			return sum + itemTotal;
		}, 0);

		document.getElementById('total-products').textContent = data.length;
		document.getElementById('selected-wholesaler').textContent = AppState.selectedWholesaler;
		document.getElementById('total-quantity').textContent = totalQuantity;

		// 테이블 생성
		const tbody = document.getElementById('results-table-body');
		tbody.innerHTML = '';

		data.forEach((item, index) => {
			// 사이즈별로 행 추가
			Object.entries(item.quantities).forEach(([size, quantity], sizeIdx) => {
				const tr = document.createElement('tr');
				if (sizeIdx === 0) {
					// 첫 번째 사이즈: 번호, 도매인, 파일명, 제품명, 칼라 표시
					tr.innerHTML = `
						<td rowspan="${Object.keys(item.quantities).length}">${index + 1}</td>
						<td rowspan="${Object.keys(item.quantities).length}">${item.wholesaler || '-'}</td>
						<td rowspan="${Object.keys(item.quantities).length}">${item.fileName || '-'}</td>
						<td rowspan="${Object.keys(item.quantities).length}">${item.productName}</td>
						<td rowspan="${Object.keys(item.quantities).length}">${item.color}</td>
						<td>${size}</td>
						<td>${quantity}</td>
					`;
				} else {
					// 나머지 사이즈: 사이즈와 수량만 표시
					tr.innerHTML = `
						<td>${size}</td>
						<td>${quantity}</td>
					`;
				}
				tbody.appendChild(tr);
			});
		});

		UIController.showToast('분석이 완료되었습니다!', 'success');
	},
};

// ========== Event Listeners ==========
const EventListeners = {
	init() {
		// 분석 버튼
		document.getElementById('analyze-btn').addEventListener('click', () => {
			ExcelAnalyzer.analyzeFile();
		});

		// 엑셀 다운로드 버튼
		document.getElementById('download-excel-btn').addEventListener('click', () => {
			this.downloadExcel();
		});

		// 새로 시작 버튼
		document.getElementById('restart-btn').addEventListener('click', () => {
			if (confirm('처음부터 다시 시작하시겠습니까?')) {
				this.restart();
			}
		});

		// 다음 단계 버튼
		document.getElementById('next-step-btn').addEventListener('click', () => {
			UIController.showToast('매핑 기능은 다음 단계에서 구현될 예정입니다.', 'info');
		});
	},

	downloadExcel() {
		if (!AppState.analyzedData || AppState.analyzedData.length === 0) {
			UIController.showToast('다운로드할 데이터가 없습니다.', 'warning');
			return;
		}

		// CSV 헤더 (도매인, 파일명 추가)
		const headers = ['번호', '도매인', '파일명', '시트', '제품명', '칼라', '사이즈', '수량'];
		const rows = [headers];

		// 데이터 변환
		let rowNum = 1;
		AppState.analyzedData.forEach((item) => {
			Object.entries(item.quantities).forEach(([size, quantity]) => {
				rows.push([
					rowNum,
					item.wholesaler || '-',
					item.fileName || '-',
					item.sheet,
					item.productName,
					item.color,
					size,
					quantity,
				]);
				rowNum++;
			});
		});

		// CSV 문자열 생성
		const csvContent = rows.map((row) => row.join(',')).join('\n');

		// UTF-8 BOM 추가 (엑셀에서 한글 깨짐 방지)
		const BOM = '\uFEFF';
		const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

		// 다운로드 링크 생성
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;

		// 파일명 생성 (도매인_날짜시간.csv)
		const now = new Date();
		const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
		const wholesaler = AppState.selectedWholesaler || 'unknown';
		a.download = `${wholesaler}_${timestamp}.csv`;

		// 다운로드 실행
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		UIController.showToast('엑셀 파일(CSV)이 다운로드되었습니다.', 'success');
	},

	restart() {
		AppState.uploadedFile = null;
		AppState.analyzedData = [];
		AppState.selectedWholesaler = null;

		FileHandler.removeFile();
		document.getElementById('wholesaler-select').value = '';

		UIController.showSection('upload-section');
		UIController.updateProgress(1);

		UIController.showToast('초기화되었습니다.', 'info');
	},
};

// ========== App Initialization ==========
document.addEventListener('DOMContentLoaded', () => {
	AppState.init();
	FileHandler.init();
	WholesalerManager.init();
	EventListeners.init();

	console.log('✨ EzAdmin Upload Generator 초기화 완료');
});
