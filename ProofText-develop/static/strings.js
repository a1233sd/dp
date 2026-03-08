// strings.js
window.VibrateGridStrings = true;

// Для устойчивой работы нужно ждать загрузки DOM:
document.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll('.grid-col').forEach(col => {
    col.addEventListener('mouseenter', function() {
      col.classList.add('vibrate');
    });
    col.addEventListener('mouseleave', function() {
    col.classList.remove('vibrate');
    });
    col.addEventListener('animationend', function() {
      col.classList.remove('vibrate');
    });
    col.addEventListener('touchstart', function() {
      col.classList.add('vibrate');
    });
    col.addEventListener('touchend', function() {
      col.classList.remove('vibrate');
    });
  });
});