#!/usr/bin/env node
/**
 * Honest BOOST — Validation & Health Check Script
 * Valida que todas as páginas e APIs estão funcionando corretamente
 */

const http = require('http');

const PAGES = [
    '/',
    '/index.html',
    '/download-honest.html',
    '/about-honest.html',
    '/contact-honest.html',
    '/faq-honest.html',
    '/admin-honest.html',
    '/terms-honest.html',
    '/privacy-honest.html'
];

const ENDPOINTS = [
    '/api/stats'
];

const SERVER = 'http://localhost:3000';

function checkPage(url) {
    return new Promise((resolve) => {
        const fullUrl = SERVER + url;
        http.get(fullUrl, { timeout: 5000 }, (res) => {
            const success = res.statusCode >= 200 && res.statusCode < 400;
            resolve({
                page: url,
                status: res.statusCode,
                success
            });
        }).on('error', (err) => {
            resolve({
                page: url,
                status: 'ERROR',
                error: err.message,
                success: false
            });
        });
    });
}

async function validateAll() {
    console.log('\n🔍 Honest BOOST — Validation Report\n');
    console.log(`Server: ${SERVER}\n`);

    console.log('📄 Pages:');
    const pageResults = await Promise.all(PAGES.map(checkPage));
    pageResults.forEach(r => {
        const icon = r.success ? '✓' : '✗';
        console.log(`  ${icon} ${r.page} (${r.status || r.error})`);
    });

    console.log('\n🔌 Endpoints:');
    const endpointResults = await Promise.all(ENDPOINTS.map(checkPage));
    endpointResults.forEach(r => {
        const icon = r.success ? '✓' : '✗';
        console.log(`  ${icon} ${r.page} (${r.status || r.error})`);
    });

    const allSuccess = [...pageResults, ...endpointResults].every(r => r.success);
    
    console.log('\n' + (allSuccess ? '✓ All checks passed!' : '✗ Some checks failed!'));
    console.log('\n');

    process.exit(allSuccess ? 0 : 1);
}

validateAll();
