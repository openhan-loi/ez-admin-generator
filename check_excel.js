const XLSX = require('xlsx');
const path = require('path');

const filePath = 'C:\\Users\\day\\Documents\\n8n\\Upload Generator\\list\\11\\20260103-OH.xls';
try {
	const workbook = XLSX.readFile(filePath);
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

	console.log('--- Top 10 rows ---');
	data.slice(0, 10).forEach((row, i) => {
		console.log(`Row ${i}:`, JSON.stringify(row));
	});
} catch (e) {
	console.error(e);
}
