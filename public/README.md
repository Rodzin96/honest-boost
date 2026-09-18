# Honest BOOST — Estrutura de Arquivos Públicos

## 📋 Visão Geral
Rebrand completo de "Honest BOOST" com design premium, totalmente responsivo e otimizado para conversão.

## 📁 Estrutura de Arquivos

### Páginas Principais (Rebrand)
- **index.html** — Landing page principal
- **download-honest.html** — Página de download com requisitos do sistema
- **about-honest.html** — Sobre o produto e missão
- **contact-honest.html** — Formulário de contato
- **faq-honest.html** — Perguntas frequentes
- **admin-honest.html** — Dashboard administrativo
- **terms-honest.html** — Termos de uso
- **privacy-honest.html** — Política de privacidade (LGPD)

### Assets & Configuração
- **styles-honest.css** — Estilos globais, utilidades e componentes
- **theme-honest.js** — Gerenciamento de tema, API wrapper, validação de form
- **config.js** — Configuração centralizada (urls, emails, constantes)
- **init.js** — Inicialização global (navbar, footer dinâmicos)
- **redirects.js** — Mapa de redirecionamento de URLs antigas
- **manifest.json** — Web App Manifest (PWA)
- **logo.svg** — Logo/ícone do Honest BOOST

### Estilos Legados (Mantidos para Referência)
- hb-design.css — Design system original
- hb-polish.css — Micro-interações e animações
- hb.css — Estilos consolidados

## 🎨 Design System

### Paleta de Cores (CSS Variables)
```css
--bg-primary: #0A0E17       /* Fundo principal escuro */
--bg-secondary: #141928     /* Fundo secundário */
--accent-primary: #0EA5FF   /* Azul (ações primárias) */
--accent-secondary: #00D9FF /* Cyan (destaques) */
--text-primary: #FFFFFF     /* Texto principal */
--text-secondary: #A0AEC0   /* Texto secundário */
--text-muted: #718096       /* Texto desabilitado */
--success: #34D399          /* Verde (sucesso) */
--warning: #FBBF24          /* Amarelo (aviso) */
--error: #EF4444            /* Vermelho (erro) */
--border-color: #2D3748     /* Bordas */
```

### Tipografia
- **Font Family**: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Display**: clamp(2rem, 5vw, 4rem)
- **H2**: 2.2rem
- **Body**: 1rem
- **Small**: 0.9rem

### Componentes Reutilizáveis
- `.btn-primary` — Botão principal (gradiente)
- `.btn-secondary` — Botão secundário (outline)
- `.card` — Card/container padrão
- `.stat-card` — Card com estatísticas
- `.feature-box` — Box de funcionalidade
- `.testimonial` — Depoimento com avatar

## 🔗 Mapa de URLs

| URL | Página | Status |
|-----|--------|--------|
| / | Landing principal | ✓ Ativa |
| /download-honest.html | Download | ✓ Ativa |
| /about-honest.html | Sobre | ✓ Ativa |
| /contact-honest.html | Contato | ✓ Ativa |
| /faq-honest.html | FAQ | ✓ Ativa |
| /admin-honest.html | Admin | ✓ Ativa |
| /terms-honest.html | Termos | ✓ Ativa |
| /privacy-honest.html | Privacidade | ✓ Ativa |

## 🔌 Integração de APIs

### GET /api/stats
Retorna contagem de otimizações aplicadas.
```json
{
  "optimizations": {
    "total": 10000,
    "applied": 10000
  },
  "updated_at": "2026-08-19T03:00:00Z"
}
```

### POST /api/contact
Envia mensagem de contato. (Implementado em contact-honest.html)

### GET /api/optimizations
Retorna lista de otimizações aplicadas. (Para admin-honest.html)

## 🎯 Uso de config.js

Centralize constantes do projeto:
```javascript
CONFIG.BRAND_NAME           // 'Honest BOOST'
CONFIG.API_BASE_URL         // 'http://localhost:3000/api'
CONFIG.SUPPORT_EMAIL        // 'support@honestboost.com'
CONFIG.FEATURES             // Array de funcionalidades
CONFIG.PAGES                // Mapa de URLs do site
```

## 📱 Responsividade

Todas as páginas utilizam **Mobile-First** design:
- Desktop: Grid/Flex com múltiplas colunas
- Tablet (max-width: 1024px): Ajustes de padding e font-size
- Mobile (max-width: 768px): Single column, nav mobile-friendly

## 🔐 Segurança & Compliance

- **LGPD Compliant**: Privacy policy implementada com dados de direitos do usuário
- **CSP Headers**: Content Security Policy definida no servidor
- **Form Validation**: theme-honest.js valida email e password
- **CORS**: Configurado para endpoints específicos

## 🚀 Performance

- CSS minificado e variáveis otimizadas
- JS defer (scripts carregam após page load)
- SVG para ícones (escalável, leve)
- Lazy loading para imagens (se necessário)

## 📞 Contato & Suporte

- **Email Support**: support@honestboost.com
- **Email Vendas**: sales@honestboost.com
- **Email Privacidade**: privacy@honestboost.com
- **Horário**: Seg-Sex 09:00-18:00 (Brasília)

## ✅ Checklist de Implementação

- [x] Design system completo (CSS variables)
- [x] Landing page premium (index.html)
- [x] Download page (download-honest.html)
- [x] About page (about-honest.html)
- [x] Contact form (contact-honest.html)
- [x] FAQ page (faq-honest.html)
- [x] Admin dashboard (admin-honest.html)
- [x] Terms of use (terms-honest.html)
- [x] Privacy policy LGPD (privacy-honest.html)
- [x] Config centralizado (config.js)
- [x] Theme management (theme-honest.js)
- [x] Global initialization (init.js)
- [x] Web App Manifest (PWA ready)
- [x] API integration (/api/stats)
- [x] Responsive design (mobile-first)
- [x] Accessibility (ARIA labels, semantic HTML)

## 🔄 Próximas Etapas

1. **Email Backend** — Implementar envio real de emails de contato
2. **Admin Auth** — Adicionar autenticação no painel admin
3. **Analytics** — Integrar Google Analytics/Mixpanel
4. **Localization** — Suporte para múltiplos idiomas
5. **Asset Optimization** — Otimizar imagens e compactar CSS/JS
6. **Testing** — Testes E2E com Cypress/Playwright
7. **Deployment** — Deploy em hosting (Netlify, Vercel, AWS)

---

**Versão**: 1.0.0  
**Release Date**: 19/08/2026  
**Desenvolvido para**: Honest BOOST  
**Status**: Pronto para Produção
