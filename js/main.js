/* ============================================================
   NST PRINT — main.js
   Vanilla JS, sem dependências.
   ============================================================ */
'use strict';

/* Sinaliza que o JS carregou (as animações .reveal só ficam
   ocultas quando esta classe existe — sem JS, tudo é visível). */
document.documentElement.classList.add('js');

/* ------------------------------------------------------------
   EVENTO DE CLIQUE NO WHATSAPP (Google Ads / GA4)
   ------------------------------------------------------------
   Função global reutilizável. Quando a tag do Google (gtag.js)
   for inserida no <head> do index.html, todo clique em qualquer
   botão de WhatsApp passará a disparar automaticamente:
     gtag('event', 'click', { event_category: 'whatsapp',
                              event_label: '<origem_do_clique>' })
   Enquanto o gtag não existir, o clique NUNCA quebra: a chamada
   está protegida por verificação de tipo + try/catch.
------------------------------------------------------------ */
window.onWhatsAppClick = function (label) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', 'click', {
        event_category: 'whatsapp',
        event_label: label || 'whatsapp'
      });
    }
  } catch (e) {
    /* nunca interromper a navegação por causa de analytics */
  }
};

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- Rastreio dos botões de WhatsApp ---------- */
  var waLinks = document.querySelectorAll('[data-wa]');
  waLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      window.onWhatsAppClick(link.getAttribute('data-wa'));
    });
  });

  /* ---------- Header: estado ao rolar ---------- */
  var header = document.querySelector('.header');
  var onScrollHeader = function () {
    if (window.scrollY > 24) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };
  onScrollHeader();
  window.addEventListener('scroll', onScrollHeader, { passive: true });

  /* ---------- Menu mobile ---------- */
  var toggle = document.getElementById('menu-toggle');
  var nav = document.getElementById('menu');

  var closeMenu = function () {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
  };

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      if (open) header.classList.add('is-scrolled');
    });

    /* Fecha o menu ao clicar em qualquer link dele */
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });
  }

  /* ---------- Preferência por menos movimento ---------- */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Animações de entrada (reveal) ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Parallax sutil da imagem do hero ---------- */
  var heroImg = document.getElementById('hero-img');
  if (heroImg && !reduceMotion && window.matchMedia('(min-width: 1000px)').matches) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          var y = Math.min(window.scrollY * 0.06, 48);
          heroImg.style.transform = 'translateY(' + y + 'px)';
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ---------- Ano automático no rodapé ---------- */
  var ano = document.getElementById('ano');
  if (ano) ano.textContent = String(new Date().getFullYear());
});
