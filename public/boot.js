// Recovery for stale pages. After a deploy, the old hashed script files are gone, so a copy of the page
// saved before the deploy (an open tab, the back/forward cache) can't start the app and shows only the
// static fallback. If the app hasn't replaced that fallback shortly after load, reload once to get the
// current version. A session flag makes sure this happens at most once a minute, so it can never loop.
(function () {
  function check() {
    var root = document.getElementById('root');
    if (!root || !root.querySelector('[data-fallback]')) return;      // the app is running
    try {
      var last = +sessionStorage.getItem('nxt-reloaded') || 0;
      if (Date.now() - last < 60000) return;                          // already tried recently
      sessionStorage.setItem('nxt-reloaded', String(Date.now()));
    } catch (e) { return; }                                          // no storage: don't risk a loop
    location.reload();
  }
  window.addEventListener('load', function () { setTimeout(check, 2500); });
})();
