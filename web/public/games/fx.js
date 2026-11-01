// Shared rendering and effects for the TV games, on PixiJS (WebGL).
// Measured on the VIDAA TV: Canvas 2D 47 fps; Pixi 57 fps with 250 additive sprites,
// 54 fps with a blur filter. So glow is baked into textures once (canvas shadowBlur),
// and per-frame work is just moving sprites. Game logic stays in world units (W x H);
// the world container is scaled to fit the #stage element.
(function () {
  'use strict';

  var RENDER_SCALE = 0.85; // draw a bit below CSS size: the TV's GPU is modest

  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    draw(c.getContext('2d'), c.width, c.height);
    return PIXI.Texture.from(c);
  }

  // White base textures; sprites are tinted per use.
  function baseTextures() {
    return {
      dot: canvasTex(64, 64, function (g, w) {
        var gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
      }),
      spark: canvasTex(64, 12, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
      }),
      smoke: canvasTex(96, 96, function (g, w) {
        for (var i = 0; i < 7; i++) {
          var x = w / 2 + (Math.random() - 0.5) * w * 0.3, y = w / 2 + (Math.random() - 0.5) * w * 0.3, r = w * (0.22 + Math.random() * 0.15);
          var gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
      }),
      ring: canvasTex(128, 128, function (g, w) {
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.shadowColor = '#fff'; g.shadowBlur = 10;
        g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, Math.PI * 2); g.stroke();
      }),
      square: canvasTex(12, 12, function (g, w) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); }),
      shadow: canvasTex(96, 96, function (g, w) {
        var gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
      }),
    };
  }

  function create(stageEl, W, H) {
    var rect = stageEl.getBoundingClientRect();
    var fit = Math.min(rect.width / W, rect.height / H);
    var cssW = Math.round(W * fit), cssH = Math.round(H * fit);
    var app = new PIXI.Application({
      width: Math.round(cssW * RENDER_SCALE), height: Math.round(cssH * RENDER_SCALE),
      backgroundAlpha: 0, antialias: true, powerPreference: 'high-performance',
    });
    app.view.style.width = cssW + 'px'; app.view.style.height = cssH + 'px';
    app.view.style.position = 'absolute';
    stageEl.appendChild(app.view);

    var px = fit * RENDER_SCALE; // pixels per world unit in the backbuffer
    var root = new PIXI.Container(), world = new PIXI.Container();
    root.scale.set(px); root.addChild(world); app.stage.addChild(root);

    var L = {};
    ['bg', 'decal', 'shadow', 'obj', 'glow', 'fx', 'top'].forEach(function (n) { L[n] = new PIXI.Container(); world.addChild(L[n]); });
    var ui = new PIXI.Container(); app.stage.addChild(ui);

    // Persistent marks (skids, scorches, trails) are drawn into a render texture at half resolution.
    var decalRT = PIXI.RenderTexture.create({ width: Math.ceil(W * px * 0.5), height: Math.ceil(H * px * 0.5) });
    var decalSprite = new PIXI.Sprite(decalRT); decalSprite.scale.set(2 / px); L.decal.addChild(decalSprite);
    var stamp = new PIXI.Container(); // reused for drawing into the decal texture
    stamp.scale.set(px * 0.5);

    var tex = baseTextures();
    var pool = [], live = [], motes = [];
    var shakeAmt = 0, shakeEnd = 0, flashG = new PIXI.Graphics(), flashA = 0;
    flashG.beginFill(0xffffff).drawRect(0, 0, app.view.width, app.view.height).endFill(); flashG.alpha = 0; ui.addChild(flashG);

    function color(c) { return typeof c === 'string' ? PIXI.utils.string2hex(c) : c; }

    var fx = {
      app: app, W: W, H: H, px: px, layers: L, tex: tex,
      // Bake a texture in world units (drawn at backbuffer resolution so it stays crisp).
      texture: function (w, h, draw) {
        var s = px;
        return canvasTex(w * s, h * s, function (g) {
          g.scale(s, s);
          // Canvas shadows ignore the transform; scale them too so glows fit inside the texture.
          ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY'].forEach(function (k) {
            var d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, k);
            Object.defineProperty(g, k, { get: function () { return d.get.call(g) / s; }, set: function (v) { d.set.call(g, v * s); } });
          });
          draw(g, w, h);
        });
      },
      sprite: function (texture, layer, opts) {
        var sp = new PIXI.Sprite(texture);
        sp.anchor.set(0.5);
        sp.scale.set(1 / px);
        if (opts && opts.add) sp.blendMode = PIXI.BLEND_MODES.ADD;
        if (opts && opts.tint) sp.tint = color(opts.tint);
        (L[layer] || L.obj).addChild(sp);
        return sp;
      },
      // Particles: count, x, y, color, speed [min,max], life [min,max] (s), size (world units),
      // texture key, add (additive), gravity, drag, grow, angle/spread (radians) for directed bursts.
      emit: function (o) {
        for (var i = 0; i < (o.count || 10); i++) {
          var p = pool.pop() || new PIXI.Sprite();
          p.texture = tex[o.tex || 'dot']; p.anchor.set(0.5);
          p.blendMode = o.add === false ? PIXI.BLEND_MODES.NORMAL : PIXI.BLEND_MODES.ADD;
          p.tint = color(Array.isArray(o.color) ? o.color[i % o.color.length] : (o.color || 0xffffff));
          var ang = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.spread || 0.6) : Math.random() * Math.PI * 2;
          var sp = (o.speed ? o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]) : 200);
          p.vx = Math.cos(ang) * sp + (o.vx || 0); p.vy = Math.sin(ang) * sp + (o.vy || 0);
          p.x = o.x + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0); p.y = o.y + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0);
          p.life = p.maxLife = o.life ? o.life[0] + Math.random() * (o.life[1] - o.life[0]) : 0.5;
          var size = (o.size || 12) * (0.6 + Math.random() * 0.8);
          p.baseScale = size / p.texture.width; p.scale.set(p.baseScale);
          p.gravity = o.gravity || 0; p.drag = o.drag === undefined ? 2 : o.drag; p.grow = o.grow || 0;
          p.alphaStart = o.alpha === undefined ? 1 : o.alpha; p.alpha = p.alphaStart;
          p.spin = o.spin ? (Math.random() - 0.5) * o.spin : 0;
          p.rotation = o.tex === 'spark' ? Math.atan2(p.vy, p.vx) : Math.random() * Math.PI * 2;
          p.stretch = o.tex === 'spark';
          (L[o.layer || 'fx']).addChild(p);
          live.push(p);
        }
      },
      ring: function (x, y, c, size, life) {
        fx.emit({ x: x, y: y, count: 1, color: c, tex: 'ring', speed: [0, 0], life: [life || 0.4, life || 0.4], size: 20, grow: (size || 200) / (life || 0.4) });
      },
      shake: function (amount, ms) { shakeAmt = Math.max(shakeAmt, amount); shakeEnd = performance.now() + (ms || 250); },
      flash: function (alpha) { flashA = Math.max(flashA, alpha || 0.35); },
      // Stamp a display object into the persistent decal layer (then discard it).
      decal: function (obj) {
        stamp.addChild(obj);
        app.renderer.render(stamp, { renderTexture: decalRT, clear: false });
        stamp.removeChild(obj); obj.destroy();
      },
      clearDecals: function () { app.renderer.render(new PIXI.Container(), { renderTexture: decalRT, clear: true }); },
      text: function (str, x, y, c, size) {
        var t = new PIXI.Text(str, { fontFamily: 'Tajawal', fontWeight: '800', fontSize: (size || 60) * px, fill: color(c || 0xffffff),
          dropShadow: true, dropShadowColor: color(c || 0xffffff), dropShadowBlur: 18 * px, dropShadowAlpha: 0.7, dropShadowDistance: 0 });
        t.anchor.set(0.5); t.scale.set(1 / px); t.x = x; t.y = y;
        L.top.addChild(t);
        return t;
      },
      // Slow floating light motes over the whole scene (ambient depth; ~40 sprites).
      ambient: function (n, colors) {
        for (var i = 0; i < n; i++) {
          var m = new PIXI.Sprite(tex.dot); m.anchor.set(0.5); m.blendMode = PIXI.BLEND_MODES.ADD;
          m.tint = color(colors[i % colors.length]); m.x = Math.random() * W; m.y = Math.random() * H;
          m.vx = (Math.random() - 0.5) * 14; m.vy = -6 - Math.random() * 12; m.phase = Math.random() * 6.3;
          m.scale.set((6 + Math.random() * 12) / 64);
          L.fx.addChild(m); motes.push(m);
        }
      },
      // A small floating name tag that follows a point (call .follow(x, y) every frame).
      tag: function (str, c) {
        var t = fx.text(str, 0, 0, c || 0xffffff, 26);
        t.alpha = 0.9;
        t.follow = function (x, y) { t.position.set(x, y); };
        return t;
      },
      update: function (dt) {
        var now = performance.now() / 1000;
        motes.forEach(function (m) {
          m.x += m.vx * dt; m.y += m.vy * dt;
          if (m.y < -20) { m.y = H + 20; m.x = Math.random() * W; }
          if (m.x < -20) m.x = W + 20; if (m.x > W + 20) m.x = -20;
          m.alpha = 0.25 + 0.25 * Math.sin(now * 1.3 + m.phase);
        });
        for (var i = live.length - 1; i >= 0; i--) {
          var p = live[i];
          p.life -= dt;
          if (p.life <= 0) { p.parent && p.parent.removeChild(p); live.splice(i, 1); pool.push(p); continue; }
          var k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k; p.vy = p.vy * k + p.gravity * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          var t = p.life / p.maxLife;
          p.alpha = p.alphaStart * Math.min(1, t * 1.6);
          if (p.grow) { var s = p.baseScale + p.grow * (p.maxLife - p.life) / p.texture.width; p.scale.set(s); }
          if (p.stretch) { var v = Math.sqrt(p.vx * p.vx + p.vy * p.vy); p.rotation = Math.atan2(p.vy, p.vx); p.scale.set(p.baseScale * (0.6 + v / 600), p.baseScale); }
          else if (p.spin) p.rotation += p.spin * dt;
        }
        var now = performance.now();
        if (now < shakeEnd) {
          var a = shakeAmt * (shakeEnd - now) / 300;
          world.x = (Math.random() - 0.5) * a; world.y = (Math.random() - 0.5) * a;
        } else { world.x = world.y = 0; shakeAmt = 0; }
        if (flashA > 0) { flashG.alpha = flashA; flashA = Math.max(0, flashA - dt * 2.5); } else flashG.alpha = 0;
      },
    };
    return fx;
  }

  // Shared look helpers for baked textures.
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function noise(g, w, h, amount, alpha) {
    for (var i = 0; i < amount; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(0,0,0,' + alpha + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }

  window.GameFX = { create: create, roundRect: roundRect, noise: noise };
})();
