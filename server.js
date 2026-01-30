const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

// DB 초기화
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
	// 제품 마스터 정보
	db.run(`CREATE TABLE IF NOT EXISTS products (
		productCode TEXT PRIMARY KEY,
		wholesaler TEXT,
		productName TEXT,
		option TEXT,
		barcode TEXT,
		stock INTEGER
	)`);

	// 매핑 기억 저장소 (Levenshtein 결과 및 수동 매칭 학습)
	db.run(`CREATE TABLE IF NOT EXISTS mappingMemory (
		mappingKey TEXT PRIMARY KEY,
		productCode TEXT,
		fileName TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	)`);

	// 매핑 제외 목록
	db.run(`CREATE TABLE IF NOT EXISTS ignoredItems (
		ignoreKey TEXT PRIMARY KEY,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	)`);

	// 마지막 검색 쿼리 저장용 (사용자 편의성)
	db.run(`CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT
	)`);
});

// ---------- API 엔드포인트: 제품 마스터 ----------
app.get('/api/products', (req, res) => {
	db.all('SELECT * FROM products', [], (err, rows) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json(rows);
	});
});

app.post('/api/products/sync', (req, res) => {
	const products = req.body;
	if (!Array.isArray(products)) return res.status(400).json({ error: 'Invalid data format' });

	db.serialize(() => {
		const stmt = db.prepare('INSERT OR REPLACE INTO products VALUES (?, ?, ?, ?, ?, ?)');
		products.forEach((p) =>
			stmt.run(p.productCode, p.wholesaler, p.productName, p.option, p.barcode, p.stock),
		);
		stmt.finalize((err) => {
			if (err) return res.status(500).json({ error: err.message });
			res.json({ success: true, count: products.length });
		});
	});
});

app.delete('/api/products/all', (req, res) => {
	db.run('DELETE FROM products', [], (err) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json({ success: true });
	});
});

// ---------- API 엔드포인트: 매핑 기억 ----------
app.get('/api/mapping-memory', (req, res) => {
	db.all('SELECT * FROM mappingMemory', [], (err, rows) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json(rows);
	});
});

app.post('/api/mapping-memory', (req, res) => {
	const { mappingKey, productCode, fileName } = req.body;
	db.run(
		'INSERT OR REPLACE INTO mappingMemory (mappingKey, productCode, fileName) VALUES (?, ?, ?)',
		[mappingKey, productCode, fileName],
		(err) => {
			if (err) return res.status(500).json({ error: err.message });
			res.json({ success: true });
		},
	);
});

app.delete('/api/mapping-memory', (req, res) => {
	const { mappingKey } = req.body;
	db.run('DELETE FROM mappingMemory WHERE mappingKey = ?', [mappingKey], (err) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json({ success: true });
	});
});

app.delete('/api/mapping-memory/all', (req, res) => {
	db.run('DELETE FROM mappingMemory', [], (err) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json({ success: true });
	});
});

// ---------- API 엔드포인트: 제외 목록 ----------
app.get('/api/ignored-items', (req, res) => {
	db.all('SELECT * FROM ignoredItems', [], (err, rows) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json(rows);
	});
});

app.post('/api/ignored-items', (req, res) => {
	const { ignoreKey } = req.body;
	db.run('INSERT OR REPLACE INTO ignoredItems (ignoreKey) VALUES (?)', [ignoreKey], (err) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json({ success: true });
	});
});

app.delete('/api/ignored-items/all', (req, res) => {
	db.run('DELETE FROM ignoredItems', [], (err) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json({ success: true });
	});
});

const HOST = '0.0.0.0'; // Render 배포 시 필수 설정: 모든 IP로부터의 접속 허용

app.listen(PORT, HOST, () => {
	console.log(`=================================================`);
	console.log(`🚀 클라우드 매핑 서버 온라인!`);
	console.log(`포트: ${PORT} | 호스트: ${HOST}`);
	console.log(`📡 Render 대시보드에서 제공하는 URL로 접속하세요.`);
	console.log(`=================================================`);
});
