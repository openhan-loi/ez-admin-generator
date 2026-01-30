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
	try {
		let allData = [];
		let from = 0;
		const step = 1000;

		while (true) {
			const { data, error } = await supabase
				.from('products')
				.select('*')
				.range(from, from + step - 1);

			if (error) throw error;
			if (!data || data.length === 0) break;

			allData = allData.concat(data);
			if (data.length < step) break;
			from += step;
		}

		// 앱 규격(optionName)에 맞게 변환하여 응답
		const mappedData = allData.map((p) => ({
			...p,
			optionName: p.option,
		}));
		res.json(mappedData);
	} catch (error) {
		console.error('Fetch products error:', error);
		res.status(500).json({ error: error.message });
	}
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

// ---------- API 엔드포인트: 도매인 관리 ----------
app.get('/api/wholesalers', async (req, res) => {
	const { data, error } = await supabase
		.from('wholesalers')
		.select('*')
		.order('timestamp', { ascending: true });
	if (error) return res.status(500).json({ error: error.message });
	res.json(data);
});

app.post('/api/wholesalers', async (req, res) => {
	const { name, isDefault } = req.body;
	const { error } = await supabase
		.from('wholesalers')
		.upsert({ name, isDefault: isDefault || false });
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

app.delete('/api/wholesalers/:name', async (req, res) => {
	const { name } = req.params;
	const { error } = await supabase.from('wholesalers').delete().eq('name', name);
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

app.post('/api/wholesalers/default', async (req, res) => {
	const { name } = req.body;
	// 모든 도매인의 기본 설정을 끄고 지정된 것만 켬
	await supabase.from('wholesalers').update({ isDefault: false }).neq('name', 'FORCE_UPDATE_ALL');
	const { error } = await supabase.from('wholesalers').update({ isDefault: true }).eq('name', name);
	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});
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

// ---------- API 엔드포인트: 분석 대기 데이터 (Scheduled Analysis) ----------
app.get('/api/scheduled-analysis', async (req, res) => {
	try {
		const { data, error } = await supabase
			.from('scheduled_analysis')
			.select('*')
			.order('timestamp', { ascending: true });

		if (error) {
			// 테이블이 아예 없는 경우(404) 빈 배열 반환하여 오류 방지
			if (
				error.code === 'PGRST116' ||
				error.message.includes('relation "scheduled_analysis" does not exist')
			) {
				return res.json([]);
			}
			return res.status(500).json({ error: error.message });
		}
		res.json(data || []);
	} catch (e) {
		res.json([]);
	}
});

app.post('/api/scheduled-analysis/batch', async (req, res) => {
	const items = req.body;
	if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid data format' });

	try {
		// 1. 기존 데이터 삭제
		await supabase
			.from('scheduled_analysis')
			.delete()
			.neq('id', '00000000-0000-0000-0000-000000000000');

		// 2. 대용량 데이터를 500개씩 쪼개서 저장 (Supabase 제한 극복)
		const CHUNK_SIZE = 500;
		for (let i = 0; i < items.length; i += CHUNK_SIZE) {
			const chunk = items.slice(i, i + CHUNK_SIZE);
			const { error } = await supabase.from('scheduled_analysis').insert(chunk);
			if (error) {
				console.error(`Chunk insert error at ${i}:`, error.message);
				// 테이블이 없는 경우를 위한 친절한 에러
				if (error.message.includes('relation "scheduled_analysis" does not exist')) {
					return res
						.status(404)
						.json({ error: '데이터 저장 테이블이 없습니다. DB 생성이 필요합니다.' });
				}
				throw error;
			}
		}

		res.json({ success: true, count: items.length });
	} catch (error) {
		console.error('Batch save error:', error);
		res.status(500).json({ error: error.message });
	}
});

app.delete('/api/scheduled-analysis/all', async (req, res) => {
	const { error } = await supabase
		.from('scheduled_analysis')
		.delete()
		.neq('id', '00000000-0000-0000-0000-000000000000');
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
