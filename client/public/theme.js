// Settings → Theme, applied before the first paint: <html data-theme="light|dark"> from the choice remembered on this
// device (localStorage 'anzo.theme', written by src/lib/theme.js after login), else the device's own setting. A file,
// not an inline script: the CSP allows only same-origin scripts. Loaded in <head>, blocking, before anything is drawn.
(function () {
  var choice = null;
  try {
    choice = window.localStorage.getItem('anzo.theme');
  } catch (e) {
    /* storage blocked: follow the device */
  }
  var dark = choice === 'dark' ||
    (choice !== 'light' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  var scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', dark ? 'dark' : 'light');
  // the browser's toolbar at once (the same values as --theme-color in tokens.css)
  if (choice === 'dark' || choice === 'light') {
    var bars = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < bars.length; i++) bars[i].setAttribute('content', dark ? '#11141d' : '#1f7ae0');
  }
})();
