/* ==========================================================================
   MA BULLE BEAUTÉ — motion design + réservation (100 % statique, sans back-end)
   GSAP + ScrollTrigger + Lenis, hébergés dans /js/vendor (aucun CDN, aucun abonnement)
   Réservation = SMS pré-rempli (sms:) / appel (tel:) / fichier .ics. Rien d'autre.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var HAS_GSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var fx = HAS_GSAP && !reduce;           // animations complètes
  var isMobile = function () { return window.innerWidth <= 900; };
  if (reduce) root.classList.add('reduce');

  var PHONE_SMS = '+33781995206';
  var PHONE_LABEL = '07 81 99 52 06';
  var ADDRESS = '30 rue Roosevelt, 02400 Essômes-sur-Marne';
  /* Horaires (source : page « Nous contacter » du site de Sandrine). 0 = dimanche */
  var HOURS = {
    2: [['09:30', '12:00'], ['14:00', '18:30']],
    4: [['09:30', '18:00']],
    5: [['09:30', '12:00'], ['14:00', '19:30']],
    6: [['09:30', '16:30']]
  };
  var DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  var toMin = function (hhmm) { var p = hhmm.split(':'); return +p[0] * 60 + +p[1]; };
  var fmtHM = function (m) { var h = Math.floor(m / 60), mm = m % 60; return h + 'h' + (mm ? String(mm).padStart(2, '0') : ''); };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };

  var toastEl = $('#toast'), toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 4800);
  }

  /* ==========================================================================
     1. FONCTIONS SANS ANIMATION (marchent même sans GSAP)
     ========================================================================== */

  /* ---------- Ouvert / fermé (heure de Paris) ---------- */
  function parisNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  }
  function statusText() {
    var n = parisNow(), d = n.getDay(), m = n.getHours() * 60 + n.getMinutes();
    var wins = HOURS[d] || [];
    for (var i = 0; i < wins.length; i++) {
      if (m >= toMin(wins[i][0]) && m < toMin(wins[i][1])) return { open: true, text: 'Ouvert · jusqu’à ' + fmtHM(toMin(wins[i][1])) };
    }
    for (var k = 0; k < 8; k++) {
      var dd = (d + k) % 7, w = HOURS[dd] || [];
      for (var j = 0; j < w.length; j++) {
        var start = toMin(w[j][0]);
        if (k === 0 && start <= m) continue;
        var when = k === 0 ? 'aujourd’hui' : k === 1 ? 'demain' : DAY_NAMES[dd];
        return { open: false, text: 'Fermé · rouvre ' + when + ' à ' + fmtHM(start) };
      }
    }
    return { open: false, text: 'Institut sur rendez-vous' };
  }
  (function openBadge() {
    var badge = $('#openBadge');
    if (!badge) return;
    var s = statusText();
    $('span', badge).textContent = s.text;
    $('.dot-live', badge).classList.toggle('is-closed', !s.open);
    var today = parisNow().getDay();
    $$('#hours tr').forEach(function (tr) { tr.classList.toggle('is-today', +tr.dataset.d === today); });
  })();

  /* ---------- Onglets de la carte ---------- */
  var tabs = $$('.tab'), panels = $$('.tabpanel');
  function showTab(name, opts) {
    opts = opts || {};
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    var shown = null;
    panels.forEach(function (p) {
      var on = p.id === 'p-' + name;
      p.hidden = !on;
      if (on) shown = p;
    });
    if (shown && fx && !opts.silent) {
      gsap.fromTo($$('.prow', shown), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .03, clearProps: 'transform,opacity' });
    }
    if (window.ScrollTrigger) setTimeout(function () { ScrollTrigger.refresh(); }, 60);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { showTab(t.dataset.tab); });
    t.addEventListener('keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (k === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') n = 0;
      else if (k === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); tabs[n].focus(); showTab(tabs[n].dataset.tab); }
    });
  });
  $$('[data-tab-go]').forEach(function (a) {
    a.addEventListener('click', function () { showTab(a.dataset.tabGo, { silent: true }); });
  });

  /* ---------- Sélection de soins (liste → demande de RDV) ---------- */
  var catalog = {};
  var order = [];
  $$('.prow').forEach(function (row) {
    var durEl = $('.prow__dur', row);
    var item = {
      id: row.dataset.id,
      name: row.dataset.name,
      price: +row.dataset.price,
      dur: +row.dataset.dur || 0,
      durLabel: durEl ? durEl.textContent.trim() : '',
      row: row,
      group: ($('h3', row.closest('.pgroup')) || {}).textContent || ''
    };
    catalog[item.id] = item;
    order.push(item.id);
  });
  var sel = {};                 // id -> true
  var basket = $('#basket'), picksEl = $('#picks'), addSel = $('#bAdd');

  /* menu déroulant du formulaire, groupé */
  (function buildSelect() {
    var groups = {};
    order.forEach(function (id) {
      var it = catalog[id];
      if (!groups[it.group]) {
        var og = document.createElement('optgroup');
        og.label = it.group;
        groups[it.group] = og;
        addSel.appendChild(og);
      }
      var o = document.createElement('option');
      o.value = id;
      o.textContent = it.name + ' · ' + it.price + ' €';
      groups[it.group].appendChild(o);
    });
  })();

  var rdvVisible = false;
  function selectedItems() { return order.filter(function (id) { return sel[id]; }).map(function (id) { return catalog[id]; }); }
  function totalPrice() { return selectedItems().reduce(function (s, i) { return s + i.price; }, 0); }
  function neededMinutes() { return Math.max(30, selectedItems().reduce(function (s, i) { return s + i.dur; }, 0)); }

  function syncSelection() {
    var items = selectedItems();
    order.forEach(function (id) {
      var r = catalog[id].row, on = !!sel[id];
      r.classList.toggle('is-picked', on);
      $('.prow__add', r).setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    /* panier flottant */
    $('#basketCount').textContent = items.length + (items.length > 1 ? ' soins' : ' soin');
    $('#basketTotal').textContent = totalPrice() + ' €';
    basket.classList.toggle('is-on', items.length > 0 && !rdvVisible);
    /* pastilles du formulaire */
    picksEl.textContent = '';
    if (!items.length) {
      var em = document.createElement('span');
      em.className = 'picks__empty';
      em.textContent = 'Ajoutez des soins depuis la carte, ou choisissez ici :';
      picksEl.appendChild(em);
    } else {
      items.forEach(function (it) {
        var p = document.createElement('span');
        p.className = 'pick';
        p.appendChild(document.createTextNode(it.name + ' · ' + it.price + ' €'));
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Retirer ' + it.name);
        b.textContent = '×';
        b.addEventListener('click', function () { toggleItem(it.id, false); });
        p.appendChild(b);
        picksEl.appendChild(p);
      });
    }
    $('#stepSoins').classList.toggle('is-done', items.length > 0);
    renderSlots();
    renderSummary();
  }
  function toggleItem(id, force) {
    var on = typeof force === 'boolean' ? force : !sel[id];
    if (on) sel[id] = true; else delete sel[id];
    syncSelection();
  }
  order.forEach(function (id) {
    $('.prow__add', catalog[id].row).addEventListener('click', function () {
      toggleItem(id);
      if (sel[id]) toast('Ajouté : ' + catalog[id].name);
    });
  });
  addSel.addEventListener('change', function () {
    if (addSel.value) { toggleItem(addSel.value, true); addSel.value = ''; }
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      rdvVisible = es[0].isIntersecting;
      basket.classList.toggle('is-on', selectedItems().length > 0 && !rdvVisible);
    }, { threshold: .15 }).observe($('#rdv'));
  }

  /* ---------- Réservation : jours, créneaux, message ---------- */
  var book = { date: null, time: null };      // time en minutes
  var datesEl = $('#dates'), slotsEl = $('#slots');

  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dateLabel(d) {
    var base = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return d.getFullYear() !== new Date().getFullYear() ? base + ' ' + d.getFullYear() : base;
  }
  (function buildDates() {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var count = 0;
    for (var i = 1; i <= 42 && count < 18; i++) {
      var d = new Date(start);
      d.setDate(start.getDate() + i);
      if (!HOURS[d.getDay()]) continue;
      count++;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'date';
      b.dataset.iso = isoOf(d);
      b.setAttribute('aria-pressed', 'false');
      var wd = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d).replace('.', '');
      var mo = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d).replace('.', '');
      b.setAttribute('aria-label', dateLabel(d));
      b.innerHTML = '<small></small><b></b><small></small>';
      var parts = b.children;
      parts[0].textContent = wd;
      parts[1].textContent = d.getDate();
      parts[2].textContent = mo;
      b._date = d;
      b.addEventListener('click', function () {
        $$('.date', datesEl).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        this.setAttribute('aria-pressed', 'true');
        book.date = this._date;
        book.time = null;
        $('#stepDate').classList.add('is-done');
        renderSlots();
        renderSummary();
      });
      datesEl.appendChild(b);
    }
  })();

  function renderSlots() {
    slotsEl.textContent = '';
    if (!book.date) {
      var e0 = document.createElement('span'); e0.className = 'slots__empty'; e0.textContent = 'Choisissez d’abord un jour.'; slotsEl.appendChild(e0);
      $('#stepHeure').classList.remove('is-done');
      return;
    }
    var need = neededMinutes(), wins = HOURS[book.date.getDay()] || [], list = [];
    wins.forEach(function (w) {
      for (var m = toMin(w[0]); m + need <= toMin(w[1]); m += 30) list.push(m);
    });
    if (book.time !== null && list.indexOf(book.time) === -1) book.time = null;
    if (!list.length) {
      var e1 = document.createElement('span'); e1.className = 'slots__empty';
      e1.textContent = 'Cette durée ne tient pas dans la journée : essayez un autre jour ou retirez un soin.';
      slotsEl.appendChild(e1);
    }
    list.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.textContent = fmtHM(m);
      b.setAttribute('aria-pressed', book.time === m ? 'true' : 'false');
      b.addEventListener('click', function () {
        book.time = m;
        $$('.slot', slotsEl).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        renderSummary();
      });
      slotsEl.appendChild(b);
    });
    $('#stepHeure').classList.toggle('is-done', book.time !== null);
  }

  function renderSummary() {
    var s = $('#sum'), items = selectedItems(), name = $('#bName').value.trim();
    s.textContent = '';
    var t = document.createElement('b'); t.textContent = 'Votre demande'; s.appendChild(t);
    function line(txt) { var l = document.createElement('span'); l.textContent = txt; s.appendChild(l); }
    if (!items.length) line('Aucun soin sélectionné pour le moment.');
    else line(items.length + (items.length > 1 ? ' soins' : ' soin') + ' · ' + totalPrice() + ' € au total');
    if (book.date) line(dateLabel(book.date).replace(/^./, function (c) { return c.toUpperCase(); }) + (book.time !== null ? ' à ' + fmtHM(book.time) : ' · heure à choisir'));
    if (name) line('Au nom de ' + name);
    $('#stepMoi').classList.toggle('is-done', !!name);
  }
  ['bName', 'bTel', 'bNote'].forEach(function (id) { $('#' + id).addEventListener('input', renderSummary); });

  function buildMessage() {
    var items = selectedItems(), name = $('#bName').value.trim(), tel = $('#bTel').value.trim(), note = $('#bNote').value.trim();
    var L = ['Bonjour Sandrine,', items.length ? 'je souhaite prendre rendez-vous :' : 'j’ai une question :'];
    items.forEach(function (i) { L.push('• ' + i.name + ' (' + i.price + ' €)'); });
    if (book.date) L.push('Le ' + dateLabel(book.date) + (book.time !== null ? ' à ' + fmtHM(book.time) : '') + '.');
    L.push('Je m’appelle ' + name + '.');
    if (tel) L.push('Mon numéro : ' + tel);
    if (note) L.push('Message : ' + note);
    if (items.length) L.push('Merci de me confirmer ce créneau !');
    return L.join('\n');
  }
  function validateBooking() {
    var items = selectedItems(), err = '';
    if (!$('#bName').value.trim()) err = 'Indiquez votre prénom pour que Sandrine sache à qui répondre.';
    else if (!items.length && !$('#bNote').value.trim()) err = 'Choisissez au moins un soin, ou écrivez votre question dans le message.';
    else if (items.length && !book.date) err = 'Choisissez un jour pour votre rendez-vous.';
    else if (items.length && book.time === null) err = 'Choisissez une heure : un créneau est à toucher à l’étape 3.';
    $('#bErr').textContent = err;
    return !err;
  }
  function smsHref(msg) { return 'sms:' + PHONE_SMS + '?&body=' + encodeURIComponent(msg); }

  $('#bookForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateBooking()) return;
    var msg = buildMessage();
    $('#bAfter').classList.add('is-on');
    $('#bIcs').style.display = (book.date && book.time !== null) ? '' : 'none';
    toast('Ouverture de votre messagerie… Sinon, copiez le message ou appelez le ' + PHONE_LABEL + '.');
    window.location.href = smsHref(msg);
  });
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (er) { rej(er); } finally { ta.remove(); }
    });
  }
  $('#bCopy').addEventListener('click', function () {
    if (!validateBooking()) return;
    copyText(buildMessage()).then(function () {
      toast('Message copié. Collez-le dans un SMS au ' + PHONE_LABEL + '.');
    }, function () { toast('Copie impossible : écrivez votre demande au ' + PHONE_LABEL + '.'); });
  });

  /* .ics : ajoute le créneau demandé à l'agenda de la cliente */
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 800);
  }
  $('#bIcs').addEventListener('click', function () {
    if (!book.date || book.time === null) return;
    var d = book.date, items = selectedItems(), start = book.time, end = start + neededMinutes();
    var f = function (m) { return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(Math.floor(m / 60)) + pad2(m % 60) + '00'; };
    var now = new Date(), stamp = now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) + 'T' + pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + '00Z';
    var desc = (items.length ? 'Soins : ' + items.map(function (i) { return i.name; }).join(', ') + '\n' : '') + 'Demande envoyée à Sandrine par SMS (' + PHONE_LABEL + '). Créneau à confirmer par Sandrine.';
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ma bulle beaute//Reservation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + Date.now() + Math.floor(Math.random() * 1e6) + '@ma-bulle-beaute', 'DTSTAMP:' + stamp,
      'DTSTART:' + f(start), 'DTEND:' + f(end),
      'SUMMARY:' + icsEscape('Ma bulle beauté · rendez-vous (à confirmer)'),
      'LOCATION:' + icsEscape(ADDRESS), 'DESCRIPTION:' + icsEscape(desc),
      'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Rendez-vous Ma bulle beauté', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'rdv-ma-bulle-beaute.ics');
  });

  syncSelection();

  /* ---------- Bon cadeau : aperçu en direct, SMS, PNG ---------- */
  (function gift() {
    var f = { to: $('#gTo'), from: $('#gFrom'), what: $('#gWhat'), msg: $('#gMsg') };
    function val(el, fb) { return el.value.trim() || fb; }
    function render() {
      $('#vTo').textContent = val(f.to, 'Camille');
      $('#vFrom').textContent = val(f.from, 'Julien');
      $('#vWhat').textContent = f.what.value.replace(/^Un bon de /, 'Bon de ').replace(', à définir avec Sandrine', '');
      $('#vMsg').textContent = f.msg.value.trim() || 'Pour te dire merci…';
    }
    Object.keys(f).forEach(function (k) { f[k].addEventListener('input', render); f[k].addEventListener('change', render); });
    render();
    $('#giftForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var L = ['Bonjour Sandrine,', 'je souhaite offrir un bon cadeau : ' + f.what.value.toLowerCase() + '.'];
      if (f.to.value.trim()) L.push('Pour : ' + f.to.value.trim());
      if (f.from.value.trim()) L.push('De la part de : ' + f.from.value.trim());
      if (f.msg.value.trim()) L.push('Petit mot : ' + f.msg.value.trim());
      L.push('Comment procéder ? Merci !');
      toast('Ouverture de votre messagerie… Sinon, appelez le ' + PHONE_LABEL + '.');
      window.location.href = smsHref(L.join('\n'));
    });
    $('#giftPng').addEventListener('click', function () {
      var W = 1400, H = 886, c = document.createElement('canvas');
      c.width = W; c.height = H;
      var x = c.getContext('2d');
      var draw = function () {
        var g = x.createRadialGradient(W * .85, 0, 40, W * .5, H * .5, W * .8);
        g.addColorStop(0, '#4b2b3b'); g.addColorStop(.6, '#24161e'); g.addColorStop(1, '#24161e');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.strokeStyle = 'rgba(232,185,177,.55)'; x.lineWidth = 2;
        x.beginPath(); x.arc(W * .88, H * .1, 380, 0, Math.PI * 2); x.stroke();
        x.setLineDash([8, 10]); x.strokeStyle = 'rgba(201,164,106,.6)';
        x.beginPath(); x.arc(W * .88, H * .1, 330, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
        x.fillStyle = '#c9a46a'; x.font = '500 22px Jost, sans-serif';
        x.fillText('BON CADEAU · INSTITUT MA BULLE BEAUTÉ', 90, 120);
        x.fillStyle = '#e8b9b1'; x.font = 'italic 300 118px Fraunces, Georgia, serif';
        x.fillText('Une bulle', 90, 300); x.fillText('rien que pour ' + (f.to.value.trim() ? 'toi' : 'toi'), 90, 420);
        x.fillStyle = '#f8f0eb'; x.font = '300 56px Fraunces, Georgia, serif';
        x.fillText(val(f.to, 'Camille') + ' · ' + $('#vWhat').textContent, 90, 560);
        x.font = '400 30px Jost, sans-serif'; x.globalAlpha = .85;
        x.fillText(f.msg.value.trim() || 'Pour te dire merci…', 90, 625); x.globalAlpha = 1;
        x.font = '400 24px Jost, sans-serif'; x.globalAlpha = .7;
        x.fillText('De la part de ' + val(f.from, 'Julien'), 90, 790);
        x.textAlign = 'right'; x.fillText('30 rue Roosevelt · Essômes-sur-Marne · ' + PHONE_LABEL, W - 90, 790);
        c.toBlob(function (b) { if (b) downloadBlob(b, 'bon-cadeau-ma-bulle-beaute.png'); }, 'image/png');
      };
      if (document.fonts && document.fonts.load) {
        Promise.all([document.fonts.load('italic 300 40px Fraunces'), document.fonts.load('300 40px Fraunces'), document.fonts.load('400 24px Jost')]).then(draw, draw);
      } else draw();
    });
  })();

  /* ---------- Carrousel d'avis ---------- */
  (function reviews() {
    var tr = $('#revTrack');
    if (!tr) return;
    var step = function () { var c = $('.rcard', tr); return c ? c.getBoundingClientRect().width + 24 : 340; };
    var go = function (dir) { tr.scrollBy({ left: dir * step(), behavior: reduce ? 'auto' : 'smooth' }); };
    $('#revPrev').addEventListener('click', function () { go(-1); });
    $('#revNext').addEventListener('click', function () { go(1); });
    tr.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
  })();

  /* ---------- Vidéo hero : qualité adaptée, pause hors écran ---------- */
  var heroVideo = $('#heroVideo');
  (function heroVid() {
    if (!heroVideo || reduce) return;
    var saveData = navigator.connection && navigator.connection.saveData;
    var big = window.innerWidth > 1280 && !saveData;
    heroVideo.src = big ? 'video/hero-1080.mp4' : 'video/hero-720.mp4';
    var p = heroVideo.play();
    if (p && p.catch) p.catch(function () { /* l'image de secours (poster) reste affichée */ });
  })();

  /* ==========================================================================
     2. NAVIGATION (menu mobile, ancres)
     ========================================================================== */
  var lenis = null;
  var nav = $('#nav'), burger = $('#burger'), menu = $('#menu');
  var menuOpen = false;

  function setMenu(open) {
    if (open === menuOpen) return;
    menuOpen = open;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    var links = $$('.menu__links a span, .menu__foot > *', menu);
    if (open) {
      menu.classList.add('is-open');
      if (lenis) lenis.stop(); else root.style.overflow = 'hidden';
      if (fx) {
        var r = burger.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 40;
        gsap.fromTo(menu, { clipPath: 'circle(0px at ' + cx + 'px ' + cy + 'px)' }, { clipPath: 'circle(' + R + 'px at ' + cx + 'px ' + cy + 'px)', duration: 1, ease: 'expo.inOut' });
        gsap.fromTo(links, { yPercent: 115 }, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: .06, delay: .35 });
      } else menu.style.clipPath = 'none';
    } else {
      var done = function () { menu.classList.remove('is-open'); if (lenis) lenis.start(); else root.style.overflow = ''; };
      if (fx) {
        var rb = burger.getBoundingClientRect();
        gsap.to(menu, { clipPath: 'circle(0px at ' + (rb.left + rb.width / 2) + 'px ' + (rb.top + rb.height / 2) + 'px)', duration: .8, ease: 'expo.inOut', onComplete: done });
      } else done();
    }
  }
  burger.addEventListener('click', function () { setMenu(!menuOpen); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });

  function goTo(hash) {
    var target = hash === '#top' ? 0 : $(hash);
    if (target === null) return;
    if (lenis) lenis.scrollTo(target, { offset: hash === '#top' ? 0 : -10, duration: 1.6, easing: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); } });
    else if (target === 0) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  $$('a[href^="#"]').forEach(function (a) {
    var h = a.getAttribute('href');
    if (h.length < 2) return;
    a.addEventListener('click', function (e) {
      if (h !== '#top' && !$(h)) return;
      e.preventDefault();
      var fromMenu = menu.contains(a);
      if (fromMenu) { setMenu(false); setTimeout(function () { goTo(h); }, 450); } else goTo(h);
    });
  });

  /* ==========================================================================
     3. ANIMATIONS (GSAP + ScrollTrigger + Lenis)
     ========================================================================== */
  /* découpe de texte : mots ou lettres masqués, texte lu en entier par les lecteurs d'écran */
  function splitEl(el, mode) {
    if (el.dataset.splitDone) return $$('.sp-c', el);   /* déjà découpé (changement de taille d'écran) */
    el.dataset.splitDone = '1';
    var hasSr = !!$('.sr-only', el);
    var label = hasSr ? '' : el.textContent.replace(/\s+/g, ' ').trim();
    var pieces = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (tok) {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span');
            w.className = 'sp-w'; w.setAttribute('aria-hidden', 'true');
            if (mode === 'chars') {
              Array.from(tok).forEach(function (ch) {
                var c = document.createElement('span'); c.className = 'sp-c'; c.textContent = ch; w.appendChild(c); pieces.push(c);
              });
            } else {
              var c2 = document.createElement('span'); c2.className = 'sp-c'; c2.textContent = tok; w.appendChild(c2); pieces.push(c2);
            }
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR' && !n.classList.contains('sr-only')) walk(n);
      });
    })(el);
    if (label) {
      var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = label;
      el.insertBefore(sr, el.firstChild);
    }
    return pieces;
  }

  function makeBubbles(container, n, minS, maxS, opts) {
    opts = opts || {};
    var out = [];
    for (var i = 0; i < n; i++) {
      var b = document.createElement('span');
      b.className = 'bubble' + (opts.soft ? ' bubble--soft' : '');
      var s = rand(minS, maxS);
      b.style.width = b.style.height = s + 'px';
      b.style.left = rand(-3, 96) + '%';
      b.style.top = rand(opts.top0 || 4, opts.top1 || 92) + '%';
      container.appendChild(b);
      out.push(b);
      if (fx) {
        gsap.to(b, { y: '-=' + rand(30, 110), x: '+=' + rand(-40, 40), duration: rand(4.5, 9), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: rand(0, 3) });
      }
    }
    return out;
  }

  var mouse = { x: 0, y: 0 };

  function initAnimations() {
    gsap.registerPlugin(ScrollTrigger);
    var mm = gsap.matchMedia();

    /* ----- bulles décoratives dans les sections ----- */
    $$('[data-bubbles]').forEach(function (sec) {
      var wrap = document.createElement('div');
      wrap.className = 'bubbles';
      wrap.setAttribute('aria-hidden', 'true');
      sec.insertBefore(wrap, sec.firstChild);
      makeBubbles(wrap, isMobile() ? Math.ceil(+sec.dataset.bubbles / 2) : +sec.dataset.bubbles, 40, 170, { top0: 5, top1: 85 });
    });

    /* ----- barre de progression de lecture ----- */
    gsap.to('.progress span', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });

    /* ----- titres : lettres / mots qui montent dans leur masque ----- */
    $$('[data-split]').forEach(function (el) {
      if (el.closest('.panel--end') && !isMobile()) return;   /* géré avec containerAnimation plus bas */
      var text = el.textContent.trim();
      var mode = (el.dataset.split === 'words' || text.length > 38) ? 'words' : 'chars';
      var pieces = splitEl(el, mode);
      gsap.set(pieces, { yPercent: 118 });
      ScrollTrigger.create({
        trigger: el, start: 'top 86%', once: true,
        onEnter: function () { gsap.to(pieces, { yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: mode === 'chars' ? .02 : .07 }); }
      });
    });

    /* ----- révélations génériques ----- */
    $$('[data-reveal]').forEach(function (el) {
      gsap.from(el, { y: 44, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });

    /* ----- HERO : parallax multicouche ----- */
    var hero = $('#top');
    gsap.to('#heroMedia', { yPercent: 16, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('#heroInner', { y: -110, opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: '35% top', end: 'bottom 15%', scrub: true } });
    var layers = { back: -60, mid: -190, front: -420 };
    var layerEls = {};
    Object.keys(layers).forEach(function (k) {
      var el = $('.hero__bubbles[data-layer="' + k + '"]');
      layerEls[k] = el;
      var m = isMobile();
      if (k === 'back') makeBubbles(el, m ? 5 : 10, 30, 90, { soft: true });
      if (k === 'mid') makeBubbles(el, m ? 4 : 8, 50, 150);
      if (k === 'front') makeBubbles(el, m ? 2 : 4, 140, 300, { soft: true, top0: 55, top1: 100 });
      gsap.to(el, { y: layers[k], ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    });
    if (finePointer) {
      var qx = {};
      Object.keys(layers).forEach(function (k, i) { qx[k] = gsap.quickTo(layerEls[k], 'x', { duration: 1.4, ease: 'power3' }); });
      hero.addEventListener('pointermove', function (e) {
        var nx = e.clientX / innerWidth - .5;
        qx.back(nx * -20); qx.mid(nx * -55); qx.front(nx * -110);
      });
    }
    /* vidéo en pause quand le hero est hors champ */
    if (heroVideo) ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', onToggle: function (s) { if (reduce) return; if (s.isActive) { var p = heroVideo.play(); if (p && p.catch) p.catch(function () {}); } else heroVideo.pause(); } });
    /* respiration lente de la vidéo (Ken Burns) */
    gsap.to('#heroVideo', { scale: 1.14, duration: 22, ease: 'sine.inOut', yoyo: true, repeat: -1 });

    /* ----- MARQUEE : vitesse et sens liés au scroll ----- */
    (function marquee() {
      var rows = $$('.marquee__row'), tweens = [], widths = [];
      rows.forEach(function (row) {
        Array.prototype.slice.call(row.children).forEach(function (n) { row.appendChild(n.cloneNode(true)); });
      });
      function build() {
        tweens.forEach(function (t) { t.kill(); });
        tweens = [];
        rows.forEach(function (row) {
          var dir = +row.dataset.dir, w = row.scrollWidth / 2;
          var tw = gsap.fromTo(row, { x: dir < 0 ? 0 : -w }, { x: dir < 0 ? -w : 0, duration: w / 85, ease: 'none', repeat: -1 });
          tw.totalTime(tw.duration() * 400);
          tweens.push(tw);
        });
      }
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(build);
      var lastY = window.scrollY, ts = 1, flip = 1, rt;
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 300); });
      gsap.ticker.add(function () {
        var y = window.scrollY, v = y - lastY; lastY = y;
        if (Math.abs(v) > .5) flip = v > 0 ? 1 : -1;
        var target = 1 + Math.min(Math.abs(v) * .35, 9);
        ts += (target - ts) * .08;
        tweens.forEach(function (t) { t.timeScale(ts * flip); });
      });
    })();

    /* ----- SAVOIR-FAIRE : section pinnée en storytelling (desktop) ----- */
    mm.add('(min-width: 901px)', function () {
      if (reduce) return;
      var steps = $$('.step'), imgs = $$('.orb__img'), prog = $('#orbProg'), now = $('#stepNow');
      gsap.set(steps.slice(1), { autoAlpha: 0, y: 50 });
      gsap.set(imgs.slice(1), { clipPath: 'circle(0% at 50% 50%)' });
      var tl = gsap.timeline({
        scrollTrigger: {
          trigger: '#storyPin', start: 'top top', end: '+=330%', pin: true, scrub: .7, anticipatePin: 1,
          onUpdate: function (self) { var i = Math.min(3, Math.floor(self.progress * 4 + .08)); now.textContent = '0' + (i + 1); }
        }
      });
      tl.to(prog, { strokeDashoffset: 0, duration: 4, ease: 'none' }, 0);
      for (var i = 1; i < 4; i++) {
        tl.to(steps[i - 1], { autoAlpha: 0, y: -50, duration: .35, ease: 'power2.in' }, i - .25)
          .fromTo(steps[i], { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: .5, ease: 'power3.out' }, i + .02)
          .fromTo(imgs[i], { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(76% at 50% 50%)', duration: .7, ease: 'power2.inOut' }, i - .2)
          .fromTo($('img', imgs[i]), { scale: 1.3 }, { scale: 1, duration: .9, ease: 'power2.out' }, i - .2);
      }
      tl.to({}, { duration: .3 });
      return function () { gsap.set(steps.concat(imgs), { clearProps: 'all' }); };
    });
    mm.add('(max-width: 900px)', function () {
      $$('.step').forEach(function (s) {
        gsap.from(s, { y: 50, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: s, start: 'top 85%', once: true } });
      });
    });

    /* ----- PRESTATIONS : défilement horizontal piloté par le scroll vertical (desktop) ----- */
    mm.add('(min-width: 901px)', function () {
      if (reduce) return;
      var track = $('#hsTrack'), bar = $('#hsBar');
      var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      var tween = gsap.to(track, {
        x: function () { return -dist(); }, ease: 'none',
        scrollTrigger: {
          trigger: '#hsPin', start: 'top top', end: function () { return '+=' + dist(); }, pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: function (self) { bar.style.transform = 'scaleX(' + self.progress + ')'; }
        }
      });
      $$('[data-hs-img]').forEach(function (img) {
        gsap.fromTo(img, { xPercent: -7 }, { xPercent: 7, ease: 'none', scrollTrigger: { trigger: img.closest('.panel'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });
      $$('.panel .card__orb').forEach(function (o) {
        gsap.fromTo(o, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(78% at 50% 50%)', duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: o.closest('.panel'), containerAnimation: tween, start: 'left 88%', toggleActions: 'play none none none' }, onComplete: function () { gsap.set(o, { clearProps: 'clipPath' }); } });
      });
      $$('.panel__n').forEach(function (n) {
        gsap.fromTo(n, { xPercent: 30 }, { xPercent: -30, ease: 'none', scrollTrigger: { trigger: n.closest('.panel'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });
      /* titre de fin de piste : lettres qui montent quand il entre à droite */
      var endT = $('.panel--end [data-split]');
      if (endT) {
        var ep = splitEl(endT, 'words');
        gsap.set(ep, { yPercent: 118 });
        ScrollTrigger.create({ trigger: endT, containerAnimation: tween, start: 'left 88%', once: true, onEnter: function () { gsap.to(ep, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: .1 }); } });
      }
    });
    mm.add('(max-width: 900px)', function () {
      $$('.panel').forEach(function (p) {
        gsap.from(p, { y: 60, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: p, start: 'top 85%', once: true } });
        var o = $('.card__orb', p);
        if (o) gsap.fromTo(o, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(78% at 50% 50%)', duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: o, start: 'top 85%', once: true }, onComplete: function () { gsap.set(o, { clearProps: 'clipPath' }); } });
      });
    });

    /* ----- CARTE : lignes qui s'échelonnent à l'arrivée ----- */
    ScrollTrigger.create({
      trigger: '.tabs', start: 'top 85%', once: true,
      onEnter: function () {
        var p = $('.tabpanel:not([hidden])');
        if (p) gsap.from($$('.prow', p), { opacity: 0, y: 30, duration: 1, ease: 'power3.out', stagger: .045, clearProps: 'transform,opacity' });
      }
    });
    gsap.from('.carte__foot', { opacity: 0, y: 20, scrollTrigger: { trigger: '.carte__foot', start: 'top 95%', once: true } });

    /* ----- CHIFFRES : compteurs + anneaux qui se dessinent ----- */
    $$('.stat').forEach(function (st, i) {
      var b = $('b', st), target = +b.dataset.count, ring = $('.b', st), o = { v: 0 };
      ScrollTrigger.create({
        trigger: st, start: 'top 82%', once: true,
        onEnter: function () {
          gsap.to(o, { v: target, duration: 2.4, ease: 'power3.out', delay: i * .12, onUpdate: function () { b.textContent = Math.round(o.v); } });
          gsap.to(ring, { strokeDashoffset: 0, duration: 2.6, ease: 'power2.inOut', delay: i * .12 });
        }
      });
    });

    /* ----- BON CADEAU : la carte bascule en entrant ----- */
    gsap.fromTo('#voucher', { rotate: 8, y: 90, opacity: 0 }, { rotate: -2.5, y: 0, opacity: 1, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '#voucher', start: 'top 85%', once: true } });
    gsap.to('.rotor', { y: -80, ease: 'none', scrollTrigger: { trigger: '.gift', start: 'top bottom', end: 'bottom top', scrub: true } });

    /* ----- GALERIE : rideau en cercle + image qui bouge dans son cadre ----- */
    $$('[data-reveal-circle]').forEach(function (tile, i) {
      gsap.fromTo(tile, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(80% at 50% 50%)', duration: 1.6, ease: 'expo.out', delay: (i % 3) * .08, scrollTrigger: { trigger: tile, start: 'top 88%', once: true }, onComplete: function () { gsap.set(tile, { clearProps: 'clipPath' }); } });
      var img = $('[data-gimg]', tile);
      if (img) gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: tile, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    /* ----- AVIS : entrée en cascade ----- */
    gsap.from('.rcard', { x: 140, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: .12, scrollTrigger: { trigger: '#revTrack', start: 'top 85%', once: true } });

    /* ----- RÉSERVATION : étapes qui apparaissent ----- */
    gsap.from('.bstep', { y: 36, opacity: 0, duration: 1, ease: 'power3.out', stagger: .12, scrollTrigger: { trigger: '.bform', start: 'top 82%', once: true }, clearProps: 'transform,opacity' });
    gsap.fromTo('.book__bg img', { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.book', start: 'top bottom', end: 'bottom top', scrub: true } });

    /* ----- NOUS TROUVER ----- */
    gsap.from('.map', { scale: .6, opacity: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: '.map', start: 'top 85%', once: true } });
    gsap.from('.hours tr', { opacity: 0, x: -30, duration: .9, ease: 'power3.out', stagger: .07, scrollTrigger: { trigger: '.hours', start: 'top 88%', once: true } });

    /* ----- FOOTER : grand nom animé ----- */
    var giant = $('#footGiant');
    var gp = splitEl(giant, 'chars');
    gsap.set(gp, { yPercent: 105 });
    ScrollTrigger.create({ trigger: giant, start: 'top 95%', once: true, onEnter: function () { gsap.to(gp, { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: .04 }); } });
    gsap.to(giant, { xPercent: -3, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true } });

    /* ----- panier : apparition fluide (CSS) ; liens ----- */
    ScrollTrigger.refresh();
  }

  /* ---------- micro-interactions ---------- */
  function initMicro() {
    if (!HAS_GSAP || reduce) return;
    /* menu : cacher au scroll vers le bas, réapparaître vers le haut */
    var lastY = window.scrollY, hidden = false;
    gsap.ticker.add(function () {
      var y = window.scrollY, d = y - lastY;
      nav.classList.toggle('is-solid', y > 60);
      if (!menuOpen && Math.abs(d) > 4) {
        var shouldHide = d > 0 && y > 280;
        if (shouldHide !== hidden) { hidden = shouldHide; nav.classList.toggle('is-hidden', hidden); }
        lastY = y;
      }
      if (y <= 60 && hidden) { hidden = false; nav.classList.remove('is-hidden'); }
    });

    if (!finePointer) return;
    /* curseur bulle */
    var cur = $('.cursor');
    var cx = gsap.quickTo(cur, 'x', { duration: .45, ease: 'power3' }), cy = gsap.quickTo(cur, 'y', { duration: .45, ease: 'power3' });
    window.addEventListener('pointermove', function (e) {
      document.body.classList.add('has-cursor');
      cx(e.clientX); cy(e.clientY);
    }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      var hot = e.target.closest && e.target.closest('a, button, summary, input, select, textarea, label, [data-tilt]');
      gsap.to(cur, { scale: hot ? 1.9 : 1, duration: .5, ease: 'power3.out', overwrite: 'auto' });
    });

    /* boutons magnétiques + origine du remplissage */
    $$('[data-magnetic]').forEach(function (btn) {
      var inner = $('.btn__t', btn);
      var qx = gsap.quickTo(btn, 'x', { duration: .6, ease: 'elastic.out(1,.55)' }), qy = gsap.quickTo(btn, 'y', { duration: .6, ease: 'elastic.out(1,.55)' });
      var ix = inner && gsap.quickTo(inner, 'x', { duration: .6, ease: 'elastic.out(1,.55)' }), iy = inner && gsap.quickTo(inner, 'y', { duration: .6, ease: 'elastic.out(1,.55)' });
      btn.addEventListener('pointerenter', function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', (e.clientX - r.left) + 'px'); btn.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        qx(dx * .3); qy(dy * .3);
        if (inner) { ix(dx * .15); iy(dy * .15); }
      });
      btn.addEventListener('pointerleave', function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', (e.clientX - r.left) + 'px'); btn.style.setProperty('--my', (e.clientY - r.top) + 'px');
        qx(0); qy(0); if (inner) { ix(0); iy(0); }
      });
    });

    /* cartes : inclinaison 3D + reflet qui suit la souris */
    $$('[data-tilt]').forEach(function (el) {
      var glare = $('.card__glare', el);
      var rx = gsap.quickTo(el, 'rotationX', { duration: .7, ease: 'power3' }), ry = gsap.quickTo(el, 'rotationY', { duration: .7, ease: 'power3' });
      gsap.set(el, { transformPerspective: 1000 });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        ry((px - .5) * 14); rx(-(py - .5) * 14);
        if (glare) { glare.style.setProperty('--gx', (px * 100) + '%'); glare.style.setProperty('--gy', (py * 100) + '%'); }
      });
      el.addEventListener('pointerleave', function () { rx(0); ry(0); });
    });
  }

  /* ==========================================================================
     4. SÉQUENCE D'ENTRÉE : préchargeur → rideau circulaire → hero
     ========================================================================== */
  var loader = $('#loader'), ringEl = $('#revealRing'), hero = $('#top');

  function finishIntro() {
    if (loader) loader.remove();
    if (ringEl) ringEl.remove();
    hero.style.clipPath = 'none';
    root.classList.remove('is-loading');
    if (lenis) lenis.start();
    window.__bulleReady = true;
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  function runIntro() {
    if (!fx) { finishIntro(); initMicro(); return; }
    var ring = $('.loader__ring .r2'), count = $('#loadCount'), brand = $$('.loader__brand b');
    var cnt = { v: 0 };
    gsap.set(brand, { yPercent: 115 });
    gsap.set(hero, { clipPath: 'circle(0px at 50% 50%)' });
    makeBubbles(loader, isMobile() ? 5 : 9, 30, 120, { top0: 10, top1: 90 });
    var t = gsap.timeline();
    t.to(brand, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: .12 }, .15)
      .to(ring, { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut' }, 0)
      .to(cnt, { v: 100, duration: 2, ease: 'power2.inOut', onUpdate: function () { count.textContent = Math.round(cnt.v); } }, 0);

    var loaded = new Promise(function (res) {
      if (document.readyState === 'complete') res(); else window.addEventListener('load', res, { once: true });
    });
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var timeout = new Promise(function (res) { setTimeout(res, 6500); });
    Promise.race([Promise.all([new Promise(function (r) { t.eventCallback('onComplete', r); }), loaded, fonts]), timeout]).then(reveal);

    function reveal() {
      var R = Math.hypot(window.innerWidth, window.innerHeight) / 2 + 30;
      var title = $$('.sp-c', $('#heroTitle'));
      var tl = gsap.timeline({ onComplete: finishIntro });
      ringEl.style.display = 'block';
      tl.to(brand, { yPercent: -115, duration: .6, ease: 'power3.in', stagger: .05 })
        .to('.loader__ring', { scale: 1.2, opacity: 0, duration: .7, ease: 'power2.in' }, '<')
        .to('.loader__count', { opacity: 0, duration: .4 }, '<')
        .fromTo(hero, { clipPath: 'circle(0px at 50% 50%)' }, { clipPath: 'circle(' + R + 'px at 50% 50%)', duration: 1.6, ease: 'expo.inOut' }, '-=.15')
        .fromTo(ringEl, { scale: 0, opacity: 1 }, { scale: (R * 2) / 100, opacity: 0, duration: 1.6, ease: 'expo.inOut' }, '<')
        .fromTo('#heroMedia', { scale: 1.35 }, { scale: 1, duration: 2.4, ease: 'expo.out' }, '<')
        .fromTo(title, { yPercent: 118 }, { yPercent: 0, duration: 1.5, ease: 'expo.out', stagger: .04 }, '-=.9')
        .fromTo('[data-hero-in]', { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out', stagger: .12 }, '-=1.1')
        .fromTo('.hero__badge, .hero__scroll', { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: 1, ease: 'expo.out', stagger: .1 }, '-=1')
        .fromTo('.nav', { yPercent: -120 }, { yPercent: 0, duration: 1.1, ease: 'expo.out', clearProps: 'transform,transition' }, '-=1.1')
        .fromTo('.hero__bubbles', { opacity: 0 }, { opacity: 1, duration: 1.6, ease: 'power2.out' }, '-=1.4');
    }
  }

  /* ---------- démarrage ---------- */
  function boot() {
    if (HAS_GSAP) {
      if (!reduce && typeof window.Lenis !== 'undefined') {
        lenis = new window.Lenis({ lerp: .085, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
        gsap.ticker.lagSmoothing(0);
        lenis.stop();
      }
      if (fx) {
        initAnimations();
        /* préparer le titre du hero avant l'intro (les lettres restent invisibles sous le rideau) */
        var heroTitle = $('#heroTitle');
        var hp = splitEl(heroTitle, 'chars');
        gsap.set(hp, { yPercent: 118 });
        gsap.set('[data-hero-in], .hero__badge, .hero__scroll, .hero__bubbles', { opacity: 0 });
        gsap.set('.nav', { yPercent: -120, transition: 'none' });
      }
    }
    runIntro();
    if (fx) initMicro();
    else {
      /* version allégée (prefers-reduced-motion ou GSAP indisponible) : menu lisible + progression de lecture */
      var bar = $('.progress span');
      var onScroll = function () {
        nav.classList.toggle('is-solid', window.scrollY > 60);
        if (bar) {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
