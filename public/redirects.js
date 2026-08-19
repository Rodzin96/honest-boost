// URL Redirection Mapping for Honest BOOST rebrand
// Maps old filenames to new -honest.html versions

const redirectMap = {
    '/contact.html': '/contact-honest.html',
    '/faq.html': '/faq-honest.html',
    '/about.html': '/about-honest.html',
    '/download.html': '/download-honest.html',
    '/admin.html': '/admin-honest.html',
    '/terms.html': '/terms-honest.html',
    '/privacy.html': '/privacy-honest.html'
};

// Auto-redirect legacy URLs
function initRedirects() {
    const currentPath = window.location.pathname;
    
    if (redirectMap[currentPath]) {
        window.location.href = redirectMap[currentPath];
    }
}

// Call on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRedirects);
} else {
    initRedirects();
}
