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
      renderScheduleTable(nbBody, nbData.events, 'northbethesda');
      var nbNote = document.getElementById('nb-schedule-note');
      if (nbNote) nbNote.classList.add('schedule-note--hidden');
    }
    if (rvData && rvData.events.length > 0 && rvBody) {
      renderScheduleTable(rvBody, rvData.events, 'rockville');
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

function renderScheduleTable(tbody, events, locationKey) {
  var now = new Date();
  var colCount = 6; // Date, Bracket, Special, Spots, Register, Players toggle
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  events.forEach(function(e) {
    var dt = new Date(e.startDateTime);
    var isPast = dt < now;
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

    // Spots cell
    var tdSpots = document.createElement('td');
    if (isPast) {
      tdSpots.textContent = '\u2014';
    } else if (e.maxRegistrants > 0) {
      var remaining = e.maxRegistrants - e.registeredCount;
      var spotsBadge = document.createElement('span');
      if (remaining <= 0) {
        spotsBadge.className = 'spots-badge spots-badge--full';
        spotsBadge.textContent = 'Full';
      } else if (remaining <= 4) {
        spotsBadge.className = 'spots-badge spots-badge--low';
        spotsBadge.textContent = remaining + ' spot' + (remaining === 1 ? '' : 's') + ' left';
      } else {
        spotsBadge.className = 'spots-badge';
        spotsBadge.textContent = e.registeredCount + '/' + e.maxRegistrants + ' filled';
      }
      tdSpots.appendChild(spotsBadge);
      if (e.waitlistCount > 0) {
        var wl = document.createElement('span');
        wl.className = 'spots-waitlist';
        wl.textContent = e.waitlistCount + ' on waitlist';
        tdSpots.appendChild(wl);
      }
    } else {
      tdSpots.textContent = '\u2014';
    }
    tr.appendChild(tdSpots);

    // Registration cell
    var tdReg = document.createElement('td');
    if (isPast) {
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

    // "See Who's Playing" expandable row (only for upcoming events with registrants)
    if (!isPast && e.registeredCount > 0) {
      // Toggle link in a row below
      var toggleTr = document.createElement('tr');
      toggleTr.className = 'registrants-toggle-row';
      var toggleTd = document.createElement('td');
      toggleTd.setAttribute('colspan', colCount);
      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'registrants-toggle';
      toggleBtn.textContent = 'See Who\u2019s Playing \u25BC';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleTd.appendChild(toggleBtn);
      toggleTr.appendChild(toggleTd);
      tbody.appendChild(toggleTr);

      // Expandable registrant list row (hidden by default)
      var detailTr = document.createElement('tr');
      detailTr.className = 'registrants-detail-row';
      detailTr.style.display = 'none';
      var detailTd = document.createElement('td');
      detailTd.setAttribute('colspan', colCount);
      detailTd.className = 'registrants-detail';
      detailTr.appendChild(detailTd);
      tbody.appendChild(detailTr);

      // Wire up toggle
      (function(btn, detailRow, detailCell, eventId, loc) {
        var loaded = false;
        btn.addEventListener('click', function() {
          var isOpen = detailRow.style.display !== 'none';
          if (isOpen) {
            detailRow.style.display = 'none';
            btn.textContent = 'See Who\u2019s Playing \u25BC';
            btn.setAttribute('aria-expanded', 'false');
            return;
          }
          detailRow.style.display = '';
          btn.textContent = 'Hide Players \u25B2';
          btn.setAttribute('aria-expanded', 'true');
          if (loaded) return;

          // Fetch registrants
          detailCell.innerHTML = '<span class="registrants-loading">Loading players\u2026</span>';
          fetch('/api/registrants?eventId=' + encodeURIComponent(eventId) + '&location=' + encodeURIComponent(loc))
            .then(function(r) { return r.json(); })
            .then(function(data) {
              loaded = true;
              if (!data.supported) {
                detailCell.innerHTML = renderRegistrantsFallback(data.message);
                return;
              }
              detailCell.innerHTML = renderRegistrantsList(data.registrants, data.waitlisted);
            })
            .catch(function() {
              detailCell.innerHTML = renderRegistrantsFallback('Could not load player list. Try again later.');
            });
        });
      })(toggleBtn, detailTr, detailTd, e.eventId, locationKey);
    }
  });
}

// ─── Registrant rendering helpers ───
function renderRegistrantsList(registered, waitlisted) {
  var html = '<div class="registrants-list">';
  if (registered.length === 0) {
    html += '<p class="registrants-empty">No player details available yet.</p>';
  } else {
    html += '<div class="registrants-group">';
    html += '<span class="registrants-label">Registered (' + registered.length + ')</span>';
    html += '<div class="registrants-chips">';
    registered.forEach(function(r) {
      html += '<span class="registrant-chip">' + escapeHtml(r.name) + '</span>';
    });
    html += '</div></div>';
  }
  if (waitlisted && waitlisted.length > 0) {
    html += '<div class="registrants-group registrants-group--waitlist">';
    html += '<span class="registrants-label">Waitlisted (' + waitlisted.length + ')</span>';
    html += '<div class="registrants-chips">';
    waitlisted.forEach(function(r) {
      html += '<span class="registrant-chip registrant-chip--waitlist">' + escapeHtml(r.name) + '</span>';
    });
    html += '</div></div>';
  }
  html += '<p class="registrants-hub-cta">Don\u2019t see a partner? <a href="https://play.linkanddink.com" target="_blank" rel="noopener noreferrer">Find one on the Hub \u2192</a></p>';
  html += '</div>';
  return html;
}

function renderRegistrantsFallback(message) {
  var html = '<div class="registrants-list">';
  html += '<p class="registrants-empty">' + escapeHtml(message) + '</p>';
  html += '<p class="registrants-hub-cta">Looking for a partner? <a href="https://play.linkanddink.com" target="_blank" rel="noopener noreferrer">Find one on the Hub \u2192</a></p>';
  html += '</div>';
  return html;
}
