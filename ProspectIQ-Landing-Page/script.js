const nav = document.getElementById('nav');
const reveals = document.querySelectorAll('.reveal');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

reveals.forEach(el => observer.observe(el));

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 18);
}, { passive: true });
