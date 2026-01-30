const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// 앱 설정
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

// ---------- Supabase 설정 ----------
const SUPABASE_URL = 'https://qsqtoufuwplgmzyvzwvd.supabase.co';
const SUPABASE_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzcXRvdWZ1d3BsZ216eXZ6d3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODQ1MTYsImV4cCI6MjA4NTI2MDUxNn0.jd9xfZJy6qkvdZpULBHe_VtivPQz3almBa02X_TPIB4';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// [신규] 전역 작업 잠금 상태 (서버 메모리 유지)
let dbLock = {
	isLocked: false,
	user: null,
	startTime: null,
};

// ---------- API 엔드포인트: 제품 마스터 ----------
app.get('/api/products', async (req, res) => {
	const { data, error } = await supabase.from('products').select('*');
	if (error) return res.status(500).json({ error: error.message });

	// 앱 규격(optionName)에 맞게 변환하여 응답
	const mappedData = data.map((p) => ({
		...p,
		optionName: p.option, // DB의 option을 앱의 optionName으로 변환
	}));
	res.json(mappedData);
});

app.get('/api/products/count', async (req, res) => {
	const { count, error } = await supabase
		.from('products')
		.select('*', { count: 'exact', head: true });
	if (error) return res.status(500).json({ error: error.message });
	res.json({ count: count || 0 });
});

app.post('/api/products/sync', async (req, res) => {
	const products = req.body;
	if (!Array.isArray(products)) return res.status(400).json({ error: 'Invalid data format' });

	// Supabase 테이블 컬럼명(option)과 앱의 필드명(optionName) 일치화 작업
	const sanitizedProducts = products.map((p) => ({
		productCode: String(p.productCode),
		wholesaler: p.wholesaler,
		productName: p.productName,
		option: p.optionName || p.option || '', // 명칭 일치
		barcode: p.barcode || '',
		stock: parseInt(p.stock) || 0,
	}));

	const { error } = await supabase
		.from('products')
		.upsert(sanitizedProducts, { onConflict: 'productCode' });
	if (error) {
		console.error('Supabase Sync Error:', error);
		return res.status(500).json({ error: error.message });
	}
	res.json({ success: true, count: products.length });
});

app.delete('/api/products/all', async (req, res) => {
	const { error } = await supabase.from('products').delete().neq('productCode', 'FORCE_DELETE_ALL');
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

// ---------- API 엔드포인트: 매핑 기억 ----------
app.get('/api/mapping-memory', async (req, res) => {
	const { data, error } = await supabase.from('mappingMemory').select('*');
	if (error) return res.status(500).json({ error: error.message });
	res.json(data);
});

app.post('/api/mapping-memory', async (req, res) => {
	const { mappingKey, productCode, fileName } = req.body;
	const { error } = await supabase
		.from('mappingMemory')
		.upsert({ mappingKey, productCode, fileName });
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

app.delete('/api/mapping-memory', async (req, res) => {
	const { mappingKey } = req.body;
	const { error } = await supabase.from('mappingMemory').delete().eq('mappingKey', mappingKey);
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

app.delete('/api/mapping-memory/all', async (req, res) => {
	const { error } = await supabase
		.from('mappingMemory')
		.delete()
		.neq('mappingKey', 'FORCE_DELETE_ALL');
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

// ---------- API 엔드포인트: 제외 목록 ----------
app.get('/api/ignored-items', async (req, res) => {
	const { data, error } = await supabase.from('ignoredItems').select('*');
	if (error) return res.status(500).json({ error: error.message });
	res.json(data);
});

app.post('/api/ignored-items', async (req, res) => {
	const { ignoreKey } = req.body;
	const { error } = await supabase.from('ignoredItems').upsert({ ignoreKey });
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

app.delete('/api/ignored-items/all', async (req, res) => {
	const { error } = await supabase
		.from('ignoredItems')
		.delete()
		.neq('ignoreKey', 'FORCE_DELETE_ALL');
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

// ---------- API 엔드포인트: DB 작업 잠금 제어 (메모리) ----------
app.get('/api/db/lock', (req, res) => {
	res.json(dbLock);
});

app.post('/api/db/lock', (req, res) => {
	const { user } = req.body;
	if (dbLock.isLocked) {
		return res
			.status(423)
			.json({ success: false, message: '다른 사용자가 작업 중입니다.', detail: dbLock });
	}
	dbLock = { isLocked: true, user: user || '알 수 없는 사용자', startTime: new Date() };
	res.json({ success: true });
});

app.delete('/api/db/lock', (req, res) => {
	dbLock = { isLocked: false, user: null, startTime: null };
	res.json({ success: true });
});

const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
	console.log(`🚀 Supabase 영구 데이터베이스 연동 및 명칭 교정 완료!`);
});
