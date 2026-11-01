// Two-player lobby for the TV games: shows a QR code, seats the first two phones that
// join, drops a player whose phone goes quiet, and routes their messages to the game.
// Phones open pad.html?game=<game>&room=<room>.
// Solo: with one phone seated, the phone's "play the computer" button (or OK on the TV
// remote) fills the other seat with the computer; a second phone joining later takes
// the computer's seat and a fresh match starts.
(function () {
  'use strict';

  var STALE_MS = 6000;
  var CPU = { name: 'الكمبيوتر 🤖' };

  function create(opts) {
    var room = GameLink.randomId(6);
    var padUrl = location.href.replace(/games\/[^/]*$/, 'games/pad.html') + '?game=' + opts.game + '&room=' + room;
    var players = [null, null];
    var playing = false;
    var el = document.getElementById('lobby');

    var api = {
      onHide: null,
      isCpu: function (slot) { return !!(players[slot] && players[slot].cpu); },
      solo: function () { return api.isCpu(0) || api.isCpu(1); },
      send: function (slot, msg) {
        if (!players[slot] || players[slot].cpu) return;
        var m = Object.assign({}, msg, { to: players[slot].id });
        link.send(m);
      },
      broadcast: function (msg) { link.send(Object.assign({}, msg)); },
    };

    function humans() { return players.filter(function (p) { return p && !p.cpu; }).length; }
    function slotOf(id) { return players[0] && players[0].id === id ? 0 : players[1] && players[1].id === id ? 1 : -1; }
    function seat(id) {
      var s = slotOf(id);
      if (s >= 0) return s;
      for (var i = 0; i < 2; i++) if (!players[i]) { players[i] = { id: id, lastSeen: Date.now() }; render(); return i; }
      // A second person arrived during a solo game: they replace the computer.
      for (i = 0; i < 2; i++) if (players[i].cpu) {
        players[i] = { id: id, lastSeen: Date.now() };
        if (playing) { playing = false; if (opts.onLeft) opts.onLeft(); }
        render();
        return i;
      }
      return -1;
    }

    function startSolo() {
      if (playing || humans() !== 1) return;
      for (var i = 0; i < 2; i++) if (!players[i]) players[i] = { id: 'cpu', cpu: true };
      render();
      check();
    }

    var link = GameLink.host(room, function (m) {
      if (!m || !m.from) return;
      var slot = seat(m.from);
      if (slot < 0) { link.send({ t: 'full', to: m.from }); return; }
      players[slot].lastSeen = Date.now();
      if (m.t === 'hello') {
        link.send({ t: 'slot', to: m.from, slot: slot, name: opts.slots[slot].name, color: opts.slots[slot].color, game: opts.game,
          phase: playing ? 'play' : 'lobby', solo: api.solo() });
        check();
      } else if (m.t === 'solo') startSolo();
      else if (m.t === 'move' && opts.onMove) opts.onMove(slot, m);
      else if (m.t === 'turn' && opts.onTurn) opts.onTurn(slot, m);
      else if (m.t === 'again' && opts.onAgain) opts.onAgain(slot);
      else if (m.t !== 'hb' && opts.onInput) opts.onInput(slot, m); // game-specific inputs (steer, stick, fire)
    }, function () { render(); });

    function check() {
      if (!playing && players[0] && players[1]) {
        playing = true;
        el.style.display = 'none';
        if (api.onHide) api.onHide();
        opts.onReady();
      }
    }

    setInterval(function () {
      var now = Date.now(), dropped = false;
      for (var i = 0; i < 2; i++) {
        if (players[i] && !players[i].cpu && now - players[i].lastSeen > STALE_MS) { players[i] = null; dropped = true; }
      }
      if (dropped && humans() === 0) players = [null, null]; // nobody left to play the computer
      if (dropped) {
        if (playing) { playing = false; if (opts.onLeft) opts.onLeft(); }
        el.style.display = '';
        render();
      }
    }, 1000);

    function render() {
      var qr = qrcode(0, 'M'); qr.addData(padUrl); qr.make();
      el.setAttribute('data-pad', padUrl);
      el.innerHTML =
        '<h1>' + opts.title + '</h1>' +
        '<div class="qr">' + qr.createImgTag(6, 0) + '</div>' +
        '<p class="dim">امسحوا الرمز بكاميرا الجوال — لاعب واحد أو لاعبان على نفس الواي فاي</p>' +
        '<div class="slots">' + opts.slots.map(function (s, i) {
          var p = players[i];
          return '<div class="slot' + (p ? ' in' : '') + '" style="--c:' + s.color + '">' +
            '<span class="dotc" style="background:' + s.color + '"></span>' + (p && p.cpu ? CPU.name : s.name) +
            '<b>' + (p ? 'جاهز ✓' : 'بانتظار لاعب…') + '</b></div>';
        }).join('') + '</div>' +
        (humans() === 1 ? '<p class="solo-hint">وحدك؟ اضغط <b>OK</b> في الريموت أو زر «العب ضد الكمبيوتر» في الجوال</p>' : '') +
        '<p class="dim small">' + opts.hint + '</p>';
    }

    document.addEventListener('keydown', function (e) {
      // The remote's Back key returns to the games menu instead of closing the app.
      if ([8, 27, 461, 10009].indexOf(e.keyCode) >= 0) { e.preventDefault(); location.href = 'index.html'; }
      if (e.keyCode === 13 && !playing) { e.preventDefault(); startSolo(); }
    });

    // Scores pop whenever a game updates them.
    Array.prototype.forEach.call(document.querySelectorAll('.score b'), function (b) {
      new MutationObserver(function () { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); })
        .observe(b, { childList: true, characterData: true, subtree: true });
    });

    render();
    return api;
  }

  window.Lobby = { create: create };
})();
