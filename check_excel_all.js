const XLSX = require('xlsx');
const filePath = 'C:\\Users\\day\\Documents\\n8n\\Upload Generator\\list\\11\\20260103-OH.xls';
const workbook = XLSX.readFile(filePath);
workbook.SheetNames.forEach((name) => {
	console.log(`--- Sheet: ${name} ---`);
	const worksheet = workbook.Sheets[name];
	const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
	data.slice(0, 10).forEach((row, i) => {
		console.log(`Row ${i}:`, JSON.stringify(row));
	});
});
