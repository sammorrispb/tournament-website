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

// ─── Photo Carousel ───
const track = document.querySelector('.carousel__track');
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
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const idx = Array.from(slides).indexOf(entry.target);
      dots.forEach((d, i) => d.classList.toggle('carousel__dot--active', i === idx));
    }
  });
}, { root: track, threshold: 0.6 });

slides.forEach(slide => observer.observe(slide));

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

// Open lightbox on photo click
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

// Close on backdrop click (not the image itself)
lightbox.addEventListener('click', e => {
  if (e.target === lightbox) closeLightbox();
});

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
});
