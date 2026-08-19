// Honest BOOST - Global Initialization Script
// Run this on every page to ensure consistent branding and functionality

(function() {
    'use strict';

    // Inject global navbar if not present
    function injectNavbar() {
        const navbar = document.querySelector('header');
        if (navbar) return; // Already has header

        const nav = document.createElement('header');
        nav.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            padding: 12px 5%;
            height: 70px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            backdrop-filter: blur(10px);
            background: linear-gradient(to bottom, rgba(10, 14, 23, 0.9), rgba(10, 14, 23, 0.7), transparent);
            border-bottom: 1px solid var(--border-color);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        nav.innerHTML = `
            <a href="/" style="
                font-weight: 900;
                font-size: 1.3rem;
                background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                text-decoration: none;
            ">◆ Honest BOOST</a>
            <nav style="display: flex; gap: 20px; align-items: center;">
                <a href="/download-honest.html" style="color: var(--text-secondary); text-decoration: none; transition: color 0.3s;">Download</a>
                <a href="/about-honest.html" style="color: var(--text-secondary); text-decoration: none; transition: color 0.3s;">Sobre</a>
                <a href="/faq-honest.html" style="color: var(--text-secondary); text-decoration: none; transition: color 0.3s;">FAQ</a>
                <a href="/contact-honest.html" class="btn btn-secondary" style="padding: 8px 16px;">Contato</a>
            </nav>
        `;

        document.body.insertBefore(nav, document.body.firstChild);
    }

    // Inject global footer if not present
    function injectFooter() {
        const footer = document.querySelector('footer');
        if (footer) return; // Already has footer

        const ft = document.createElement('footer');
        ft.style.cssText = `
            padding: 40px 5%;
            text-align: center;
            border-top: 1px solid var(--border-color);
            color: var(--text-muted);
            margin-top: 60px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        ft.innerHTML = `
            <p>&copy; 2026 Honest BOOST. Todos os direitos reservados.</p>
            <p style="margin-top: 15px; font-size: 0.9rem;">
                <a href="/download-honest.html" style="color: var(--accent-primary); text-decoration: none; margin: 0 10px;">Download</a>
                <a href="/about-honest.html" style="color: var(--accent-primary); text-decoration: none; margin: 0 10px;">Sobre</a>
                <a href="/faq-honest.html" style="color: var(--accent-primary); text-decoration: none; margin: 0 10px;">FAQ</a>
                <a href="/contact-honest.html" style="color: var(--accent-primary); text-decoration: none; margin: 0 10px;">Contato</a>
                <a href="/terms-honest.html" style="color: var(--accent-primary); text-decoration: none; margin: 0 10px;">Termos</a>
                <a href="/privacy-honest.html" style="color: var(--accent-primary); text-decoration: none; margin: 0 10px;">Privacidade</a>
            </p>
        `;

        document.body.appendChild(ft);
    }

    // Set page title prefix
    function updatePageTitle() {
        const h1 = document.querySelector('h1');
        if (h1 && !document.title.includes('Honest BOOST')) {
            document.title = h1.textContent.trim() + ' — Honest BOOST';
        }
    }

    // Add smooth scroll behavior
    function initSmoothScroll() {
        document.documentElement.style.scrollBehavior = 'smooth';
    }

    // Set dark theme by default
    function setDarkTheme() {
        document.documentElement.style.colorScheme = 'dark';
        if (typeof setTheme === 'function') {
            setTheme('dark');
        }
    }

    // Initialize all global features
    function init() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                injectNavbar();
                injectFooter();
                updatePageTitle();
                initSmoothScroll();
                setDarkTheme();
            });
        } else {
            injectNavbar();
            injectFooter();
            updatePageTitle();
            initSmoothScroll();
            setDarkTheme();
        }
    }

    // Run on load
    init();

    // Expose CONFIG globally if available
    if (typeof CONFIG !== 'undefined') {
        window.CONFIG = CONFIG;
    }

})();
