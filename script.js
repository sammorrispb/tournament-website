// ─── Mobile hamburger menu ───
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav__links');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navLinks.classList.toggle('open');
});

// Close menu when a nav link is clicked
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

// ─── Nav scroll shadow ───
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('nav--scrolled', window.scrollY > 10);
}, { passive: true });

// ─── Scroll reveal ───
const revealEls = document.querySelectorAll('.reveal');
if (revealEls.length) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealEls.forEach(el => revealObserver.observe(el));
}

// ─── Photo Carousel ───
const track = document.querySelector('.carousel__track');

if (track) {
  const slides = document.querySelectorAll('.carousel__slide');
  const prevBtn = document.querySelector('.carousel__arrow--prev');
  const nextBtn = document.querySelector('.carousel__arrow--next');
  const dotsContainer = document.getElementById('carouselDots');

  // Build dots
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel__dot' + (i === 0 ? ' carousel__dot--active' : '');
    dot.setAttribute('aria-label', 'Go to photo ' + (i + 1));
    dot.addEventListener('click', () => {
      slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll('.carousel__dot');

  // Track visible slide with IntersectionObserver
  const slideObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = Array.from(slides).indexOf(entry.target);
        dots.forEach((d, i) => d.classList.toggle('carousel__dot--active', i === idx));
      }
    });
  }, { root: track, threshold: 0.6 });

  slides.forEach(slide => slideObserver.observe(slide));

  // Arrow navigation
  prevBtn.addEventListener('click', () => {
    track.scrollBy({ left: -track.offsetWidth, behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    track.scrollBy({ left: track.offsetWidth, behavior: 'smooth' });
  });

  // ─── Lightbox ───
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox.querySelector('img');
  const lightboxClose = lightbox.querySelector('.lightbox__close');

  track.addEventListener('click', e => {
    const img = e.target.closest('.carousel__img-wrap img');
    if (!img) return;
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightbox.classList.add('active');
    document.body.classList.add('lightbox-open');
  });

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.classList.remove('lightbox-open');
  }

  lightboxClose.addEventListener('click', closeLightbox);

  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
  });
}

// ═══════════════════════════════════════════════
// Dynamic Data Loading (Notion + CourtReserve)
// ═══════════════════════════════════════════════

function escapeHtml(str) {
  var el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ─── Leaderboard (index.html) ───
// Spring 2026: Static leaderboard in HTML, updated manually.
// Notion API loader preserved below for future use if needed.
// (async function loadLeaderboard() { ... })();

function createMedalSpan(type, count) {
  var span = document.createElement('span');
  span.className = 'medal medal--' + type;
  span.textContent = count;
  return span;
}

// ─── Dynamic Spring Schedule (spring-2026.html) ───
(async function loadSpringEvents() {
  var nbBody = document.getElementById('nb-schedule-body');
  var rvBody = document.getElementById('rv-schedule-body');
  if (!nbBody && !rvBody) return;

  var nbWrap = document.getElementById('nb-table-wrap');
  var rvWrap = document.getElementById('rv-table-wrap');
  if (nbWrap) nbWrap.setAttribute('data-loading', 'true');
  if (rvWrap) rvWrap.setAttribute('data-loading', 'true');

  try {
    var res = await fetch('/api/events');
    if (!res.ok) return;
    var data = await res.json();
    var locations = data.locations;
    if (!locations) return;

    var nbData = locations.find(function(l) { return l.location === 'northbethesda'; });
    var rvData = locations.find(function(l) { return l.location === 'rockville'; });

    if (nbData && nbData.events.length > 0 && nbBody) {
      renderScheduleTable(nbBody, nbData.events);
      var nbNote = document.getElementById('nb-schedule-note');
      if (nbNote) nbNote.classList.add('schedule-note--hidden');
    }
    if (rvData && rvData.events.length > 0 && rvBody) {
      renderScheduleTable(rvBody, rvData.events);
      var rvNote = document.getElementById('rv-schedule-note');
      if (rvNote) rvNote.classList.add('schedule-note--hidden');
    }
  } catch (e) {
    // Silent failure — static "Coming Soon" rows remain
  } finally {
    if (nbWrap) nbWrap.removeAttribute('data-loading');
    if (rvWrap) rvWrap.removeAttribute('data-loading');
  }
})();

function renderScheduleTable(tbody, events) {
  var now = new Date();
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  events.forEach(function(e) {
    var dt = new Date(e.startDateTime);
    var dateStr = dt.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });

    // Extract bracket from event name (e.g., "Link and Dink Tournament 3.0-3.5")
    var bracketMatch = e.name.match(/(\d\.\d)\s*[-\u2013]\s*(\d\.\d)/);
    var bracket = bracketMatch ? bracketMatch[1] + '\u2013' + bracketMatch[2] : '\u2014';

    // Detect special format tags from event name
    var nameLower = e.name.toLowerCase();
    var specialTag = null;
    if (nameLower.includes('women')) specialTag = 'Women\u2019s Only';
    else if (nameLower.includes('mixed')) specialTag = 'Mixed Gender';
    else if (nameLower.includes('senior') || nameLower.includes('50+')) specialTag = '50+ Seniors';
    else if (nameLower.includes('junior') || nameLower.includes('14')) specialTag = '14 & Under Juniors';

    var tr = document.createElement('tr');

    // Date cell
    var tdDate = document.createElement('td');
    tdDate.textContent = dateStr;
    tr.appendChild(tdDate);

    // Bracket cell
    var tdBracket = document.createElement('td');
    tdBracket.textContent = bracket;
    tr.appendChild(tdBracket);

    // Special format cell
    var tdSpecial = document.createElement('td');
    if (specialTag) {
      var badge = document.createElement('span');
      badge.className = 'badge badge--special';
      badge.textContent = specialTag;
      tdSpecial.appendChild(badge);
    } else {
      tdSpecial.textContent = '\u2014';
    }
    tr.appendChild(tdSpecial);

    // Registration cell
    var tdReg = document.createElement('td');
    if (dt < now) {
      var completed = document.createElement('span');
      completed.className = 'btn--disabled';
      completed.textContent = 'Completed';
      tdReg.appendChild(completed);
    } else if (e.isFull) {
      var full = document.createElement('span');
      full.className = 'btn--disabled';
      full.textContent = 'Full';
      tdReg.appendChild(full);
    } else {
      var link = document.createElement('a');
      link.href = e.registrationUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'btn btn--primary btn--small';
      link.textContent = 'Register';
      tdReg.appendChild(link);
    }
    tr.appendChild(tdReg);

    tbody.appendChild(tr);
  });
}
