/* Honest BOOST Theme & Utilities */

// Dark mode (default)
const THEME = {
  colors: {
    bgPrimary: '#030512',
    bgSecondary: '#071426',
    bgSurface: '#07101b',
    textPrimary: '#eef6ff',
    textSecondary: '#94a3b8',
    textMuted: '#5a6888',
    accentPrimary: '#0ea5ff',
    accentSecondary: '#00e5d4',
    accentHighlight: '#ffd166',
    success: '#57f2b3',
    danger: '#ff6b6b',
  },
  brand: 'Honest BOOST',
  version: '1.0.0',
};

// Store theme preference
function setTheme(mode) {
  localStorage.setItem('honest-boost-theme', mode);
  document.documentElement.setAttribute('data-theme', mode);
}

function getTheme() {
  return localStorage.getItem('honest-boost-theme') || 'dark';
}

function initTheme() {
  const theme = getTheme();
  setTheme(theme);
}

// Analytics placeholder (replace with real analytics)
window.trackEvent = function(eventName, eventData = {}) {
  console.log(`[Analytics] Event: ${eventName}`, eventData);
  // Send to backend: POST /api/analytics
};

// Notification system
function showNotification(message, type = 'info', duration = 3000) {
  const container = document.getElementById('notification-container') || createNotificationContainer();
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  container.appendChild(notification);
  
  setTimeout(() => notification.remove(), duration);
}

function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notification-container';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;
  document.body.appendChild(container);
  return container;
}

// Add style for notifications
const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
  .notification {
    padding: 16px;
    border-radius: 10px;
    border-left: 4px solid;
    color: white;
    font-weight: 600;
    animation: slideInRight 0.3s ease forwards;
  }
  
  .notification-info {
    background: rgba(14, 165, 255, 0.9);
    border-color: #0ea5ff;
  }
  
  .notification-success {
    background: rgba(87, 242, 179, 0.9);
    border-color: #57f2b3;
  }
  
  .notification-danger {
    background: rgba(255, 107, 107, 0.9);
    border-color: #ff6b6b;
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(400px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;
document.head.appendChild(notificationStyle);

// Form validation
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return password.length >= 8;
}

function validateForm(form) {
  let isValid = true;
  const fields = form.querySelectorAll('[required]');
  
  fields.forEach(field => {
    if (!field.value.trim()) {
      field.style.borderColor = '#ff6b6b';
      isValid = false;
    } else {
      field.style.borderColor = '';
    }
  });
  
  return isValid;
}

// API wrapper
async function apiCall(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(endpoint, options);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API call failed: ${endpoint}`, error);
    showNotification('Erro ao conectar com o servidor', 'danger');
    throw error;
  }
}

// Session management
function saveSession(key, value) {
  sessionStorage.setItem(`honest-boost-${key}`, JSON.stringify(value));
}

function getSession(key) {
  const value = sessionStorage.getItem(`honest-boost-${key}`);
  return value ? JSON.parse(value) : null;
}

function clearSession() {
  Object.keys(sessionStorage).forEach(key => {
    if (key.startsWith('honest-boost-')) {
      sessionStorage.removeItem(key);
    }
  });
}

// Initialize theme on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

console.log(`${THEME.brand} v${THEME.version} - Premium Windows Optimization`);
