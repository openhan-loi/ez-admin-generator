const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qsqtoufuwplgmzyvzwvd.supabase.co';
const SUPABASE_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzcXRvdWZ1d3BsZ216eXZ6d3ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODQ1MTYsImV4cCI6MjA4NTI2MDUxNn0.jd9xfZJy6qkvdZpULBHe_VtivPQz3almBa02X_TPIB4';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const db = new sqlite3.Database('./database.sqlite');

async function migrate() {
	console.log('🚚 데이터 이사를 시작합니다...');

	// 1. 제품 DB 이사
	db.all('SELECT * FROM products', [], async (err, rows) => {
		if (err || !rows.length) return console.log('- 제품 DB가 비어있습니다.');
		const sanitized = rows.map((p) => ({
			productCode: String(p.productCode),
			wholesaler: p.wholesaler,
			productName: p.productName,
			option: p.option,
			barcode: p.barcode,
			stock: p.stock || 0,
		}));
		const { error } = await supabase.from('products').upsert(sanitized);
		console.log(
			error ? `❌ 제품 이사 실패: ${error.message}` : `✅ 제품 ${rows.length}개 이사 완료!`,
		);
	});

	// 2. 매핑 기억 이사
	db.all('SELECT * FROM mappingMemory', [], async (err, rows) => {
		if (err || !rows.length) return console.log('- 매핑 기억이 비어있습니다.');
		const { error } = await supabase.from('mappingMemory').upsert(rows);
		console.log(
			error ? `❌ 매핑 이사 실패: ${error.message}` : `✅ 매핑 기억 ${rows.length}건 이사 완료!`,
		);
	});

	// 3. 제외 목록 이사
	db.all('SELECT * FROM ignoredItems', [], async (err, rows) => {
		if (err || !rows.length) return console.log('- 제외 목록이 비어있습니다.');
		const { error } = await supabase.from('ignoredItems').upsert(rows);
		console.log(
			error
				? `❌ 제외목록 이사 실패: ${error.message}`
				: `✅ 제외 목록 ${rows.length}건 이사 완료!`,
		);
	});
}

migrate();
