// Honest BOOST - Global Configuration & Constants
// Centralized settings for the entire application

const CONFIG = {
    // Brand Information
    BRAND_NAME: 'Honest BOOST',
    BRAND_SHORT: 'HB',
    VERSION: '1.0.0',
    RELEASE_DATE: '2026-08-19',
    
    // API Configuration
    API_BASE_URL: 'http://localhost:3000/api',
    API_STATS_ENDPOINT: '/api/stats',
    API_OPTIMIZATIONS_ENDPOINT: '/api/optimizations',
    API_CONTACT_ENDPOINT: '/api/contact',
    
    // Support & Contact
    SUPPORT_EMAIL: 'support@honestboost.com',
    SALES_EMAIL: 'sales@honestboost.com',
    PRIVACY_EMAIL: 'privacy@honestboost.com',
    
    // Product Information
    PRODUCT_SIZE: '145MB',
    MIN_OS: 'Windows 10/11 (64-bit)',
    MIN_RAM: '4GB',
    MIN_DISK_SPACE: '200MB',
    
    // Performance Metrics (averages)
    AVG_FPS_GAIN: '+30-50',
    AVG_LATENCY_REDUCTION: '-15-25ms',
    AVG_TEMP_REDUCTION: '-10-20°C',
    SATISFACTION_RATE: '98.5%',
    
    // URLs
    PAGES: {
        HOME: '/',
        DOWNLOAD: '/download-honest.html',
        TERMS: '/terms-honest.html',
        PRIVACY: '/privacy-honest.html',
        CONTACT: '/contact-honest.html',
        FAQ: '/faq-honest.html',
        ABOUT: '/about-honest.html',
        ADMIN: '/admin-honest.html'
    },
    
    // Features List
    FEATURES: [
        {
            icon: '⚡',
            title: 'Game Mode Ultra',
            description: 'Dedica todos os recursos ao seu jogo'
        },
        {
            icon: '🖱️',
            title: 'Precision Mouse',
            description: 'Reduz input lag e jitter'
        },
        {
            icon: '🔄',
            title: 'Refresh Boost',
            description: 'Otimiza sincronismo de refresh rate'
        },
        {
            icon: '🎮',
            title: 'Game Tweaks',
            description: 'Otimizações por jogo'
        },
        {
            icon: '📊',
            title: 'Real-time Monitor',
            description: 'Monitore FPS, latência e CPU/GPU'
        },
        {
            icon: '↩️',
            title: 'One-Click Revert',
            description: 'Desfaça tudo facilmente'
        }
    ],
    
    // Popular Games
    POPULAR_GAMES: [
        { name: 'Valorant', fpsGain: '+45', latency: '-18ms' },
        { name: 'Counter-Strike 2', fpsGain: '+38', latency: '-16ms' },
        { name: 'Fortnite', fpsGain: '+32', latency: '-12ms' },
        { name: 'Apex Legends', fpsGain: '+28', latency: '-10ms' },
        { name: 'Warzone 2', fpsGain: '+25', latency: '-8ms' },
        { name: 'Elden Ring', fpsGain: '+35', latency: '-6ms' }
    ],
    
    // Testimonials
    TESTIMONIALS: [
        {
            author: 'João Silva',
            title: 'Streamer & Competitivo',
            text: 'Ganhei +50 FPS no Valorant e meu input lag caiu drasticamente. Obrigado!',
            verified: true
        },
        {
            author: 'Maria Santos',
            title: 'Jogadora Casual',
            text: 'Muito fácil de usar e realmente funcionou. Estou impressionada!',
            verified: true
        },
        {
            author: 'Pedro Oliveira',
            title: 'Técnico de PC',
            text: 'Finalmente uma ferramenta que faz o que promete e é transparente. Recomendo!',
            verified: true
        }
    ],
    
    // Color Palette (matches CSS variables)
    COLORS: {
        PRIMARY_BG: '#0A0E17',
        SECONDARY_BG: '#141928',
        ACCENT_PRIMARY: '#0EA5FF',
        ACCENT_SECONDARY: '#00D9FF',
        TEXT_PRIMARY: '#FFFFFF',
        TEXT_SECONDARY: '#A0AEC0',
        TEXT_MUTED: '#718096',
        SUCCESS: '#34D399',
        WARNING: '#FBBF24',
        ERROR: '#EF4444',
        BORDER: '#2D3748'
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
