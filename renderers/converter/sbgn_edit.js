// sbgn_edit (2026-11-14): an SBGN-ML map edited as the GraphML the converter makes of it (its copy in mapconv/:
// sbgnml.read, then graphml.write), as cd_edit does for CellDesigner. The converter keeps the glyph ids as the node ids
// and the arc ids as the edge ids, every box as the file's bbox, so the two files map number for number:
//   graphml(sbgnText, baseGraphml, opt) -> the GraphML of sbgnText, made from baseGraphml (the converter's GraphML of
//     a version of the same file, moves apart): the places read as sbgnml.read reads them, written as graphml.write
//     writes them (repr of each float), the rest of baseGraphml byte for byte. graphml(s, conv(s)) is conv(s).
//   write(sbgnText, graphmlText, opt) -> sbgnText with the places of graphmlText: only the numbers that change (the
//     bbox of a glyph moved or resized, of what it carries: its state variables, units of information, label, ports
//     no arc names; an arc's start, end and next points; a port's place), the rest byte for byte, so other tools open
//     it as before. write(s, conv(s)) is s. An arc end at the glyph's centre in the GraphML (0, 0) is written where the
//     line toward its next point leaves the glyph's box (the file's own end kept, or carried with a move, while it
//     still lies on that line: Newt stops short of the glyph for the arrowhead); any other end where the GraphML has
//     it. A process or logic gate is one object with its two ports (user, 2026-11-14): its arcs at a port give the
//     port's place; a glyph with ports in the GraphML but none in the file gets them (<port> after its bbox, its id
//     with .1 for the consumptions, .2 for the products, the arcs pointed at them), so a turned process keeps its turn.
//   tests/sbgn-edit.js checks both ways against the converter on every SBGN-ML map of the demo.
// Glyphs the converter leaves out (tags, terminals, clone markers have no box) and arcs to them are not moved.
(function (root) {
  'use strict';
  var YNS = 'http://www.yworks.com/xml/graphml', GNS = 'http://graphml.graphdrawing.org/xmlns';
  function DP(opt) { return (opt && opt.DOMParser) || root.DOMParser; }
  function kids(el, name) { var out = []; for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!name || c.localName === name)) out.push(c); return out; }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function F(v) { return parseFloat(v); }
  // Python's repr of a float (graphml.write writes every number so)
  function repr(v) {
    if (v === 0) return 1 / v < 0 ? '-0.0' : '0.0';
    var a = Math.abs(v);
    if (a >= 1e16 || a < 1e-4) {
      var e = v.toExponential(), m = e.match(/^(-?[\d.]+)e([+-])(\d+)$/);
      return m[1] + 'e' + m[2] + (m[3].length < 2 ? '0' : '') + m[3];
    }
    var s = String(v);
    return /[.e]/.test(s) ? s : s + '.0';
  }
  // an attribute's value as XML text (an id may hold & < > ")
  function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // the element before el among its parent's children (the start before an arc's first next)
  function prevEl(el) { var p = el.previousSibling; while (p && p.nodeType !== 1) p = p.previousSibling; return p; }
  // a number written into the SBGN-ML file: four places at most, as short as it goes
  function num(v) { var r = Math.round(v * 10000) / 10000; return String(r === 0 ? 0 : r); }

  // the start tags of a text in document order, which is the order of its elements (getElementsByTagName('*')), and
  // edits by element: an attribute's value set, a span replaced; applied from the end, so every place stays valid
  function Tags(t, doc) {
    this.t = t; this.ed = []; this.at = new Map();
    var re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/[^>]*>|<([A-Za-z_][^\s/>]*)(?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*(\/?)>/g, m, list = [];
    while ((m = re.exec(t))) if (m[1]) list.push([m.index, m.index + m[0].length, !!m[2]]);
    var all = doc.getElementsByTagName('*');
    if (all.length !== list.length) throw new Error('the file is not read tag for tag');
    for (var i = 0; i < all.length; i++) this.at.set(all[i], list[i]);
  }
  Tags.prototype.set = function (el, k, v) {   // the attribute's value, added before the tag's end when missing
    v = esc(v);
    var s = this.at.get(el), tag = this.t.slice(s[0], s[1]), re = new RegExp('(\\s' + k.replace(/[.:]/g, '\\$&') + '\\s*=\\s*)("[^"]*"|\'[^\']*\')'), m = tag.match(re);
    if (m) { var from = s[0] + m.index + m[1].length; this.ed.push([from, from + m[2].length, '"' + v + '"']); }
    else { var end = s[1] - (s[2] ? 2 : 1); this.ed.push([end, end, ' ' + k + '="' + v + '"']); }
  };
  Tags.prototype.unset = function (el, k) {   // the attribute taken out, where the tag has it
    var s = this.at.get(el), tag = this.t.slice(s[0], s[1]), m = tag.match(new RegExp('\\s+' + k.replace(/[.:]/g, '\\$&') + '\\s*=\\s*("[^"]*"|\'[^\']*\')'));
    if (m) this.ed.push([s[0] + m.index, s[0] + m.index + m[0].length, '']);
  };
  Tags.prototype.end = function (el) {   // where the element ends (a self-closed tag, or its end tag)
    var s = this.at.get(el);
    if (s[2]) return s[1];
    var name = this.t.slice(s[0] + 1).match(/^[^\s/>]+/)[0], re = new RegExp('<(/?)' + name.replace(/[.:]/g, '\\$&') + '(?=[\\s/>])[^>]*?(/?)>', 'g'), m, depth = 1;   // nested ones of the same name (a group's graph) counted
    re.lastIndex = s[1];
    while ((m = re.exec(this.t))) { if (m[1]) depth--; else if (!m[2]) depth++; if (!depth) return m.index + m[0].length; }
    return this.t.length;
  };
  Tags.prototype.indent = function (el) { var s = this.at.get(el), i = this.t.lastIndexOf('\n', s[0]); return this.t.slice(i + 1, s[0]).match(/^\s*/)[0]; };
  Tags.prototype.text = function () {
    var t = this.t;
    this.ed.sort(function (a, b) { return b[0] - a[0] || b[1] - a[1]; }).forEach(function (e) { t = t.slice(0, e[0]) + e[2] + t.slice(e[1]); });
    return t;
  };

  Tags.prototype.cut = function (el) {   // the element taken out, with the line it stood on when it stood alone there
    var s = this.at.get(el), i = this.t.lastIndexOf('\n', s[0] - 1), from = /^\s*$/.test(this.t.slice(i + 1, s[0])) && i >= 0 ? i : s[0];
    this.ed.push([from, this.end(el), '']);
  };
  // glyphs deleted in the editor (user, 2026-11-14): their ids kept in a comment at the end of the editor's GraphML, so
  // write() takes them out of the file (a glyph the GraphML lacks is no proof: the converter leaves some out)
  var GONE = /<!-- deleted: ([^>]*?) -->/;
  function gone(gtext) { var m = gtext.match(GONE); return m ? m[1].split(' ').map(decodeURIComponent) : []; }
  function goneMark(t, ids) {   // the ids added to the comment (encoded: an id with -- would end the comment)
    var all = gone(t).concat(ids).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var mark = '<!-- deleted: ' + all.map(function (x) { return encodeURIComponent(x).replace(/-/g, '%2D'); }).join(' ') + ' -->';
    return GONE.test(t) ? t.replace(GONE, mark) : t.replace(/\s*$/, '\n' + mark + '\n');
  }

  // ---------- the SBGN-ML side, read as sbgnml.read reads it ----------
  function sbgn(t, opt) {
    var doc = new (DP(opt))().parseFromString(t.replace(/^\ufeff/, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('not a readable SBGN-ML file');
    var map = kids(doc.documentElement, 'map')[0], S = { doc: doc, glyph: {}, port: {}, portOf: {}, arc: {} };
    var walk = function (g) {
      var i = g.getAttribute('id'), b = kid(g, 'bbox');
      if (i && b) S.glyph[i] = { el: g, bbox: b, box: ['x', 'y', 'w', 'h'].map(function (k) { return F(b.getAttribute(k)); }) };
      kids(g, 'port').forEach(function (p) { S.port[p.getAttribute('id')] = p; S.portOf[p.getAttribute('id')] = i; });
      kids(g, 'glyph').forEach(walk);
    };
    kids(map, 'glyph').forEach(walk);
    kids(map, 'arc').forEach(function (a) { S.arc[a.getAttribute('id')] = a; });
    return S;
  }
  function xy(el) { return el ? [F(el.getAttribute('x')), F(el.getAttribute('y'))] : null; }
  function centre(b) { return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
  function boxCut(b, aim) {   // where the line from the box's centre toward aim leaves the box
    var c = centre(b), u = [aim[0] - c[0], aim[1] - c[1]];
    if (!u[0] && !u[1]) return c;
    var tt = Math.min(u[0] ? b[2] / 2 / Math.abs(u[0]) : Infinity, u[1] ? b[3] / 2 / Math.abs(u[1]) : Infinity);
    return [c[0] + tt * u[0], c[1] + tt * u[1]];
  }
  // sbgnml.at: where an arc meets its glyph, from the glyph's centre
  function at(S, gid, ref, p, q, flux) {   // flux false: an arc ending at a port that is not a consumption's or a gate input's (a modifier), read as the centre
    var c = centre(S.glyph[gid].box);
    if (ref !== gid) { var P = flux !== false && xy(S.port[ref]); return P ? [P[0] - c[0], P[1] - c[1]] : [0, 0]; }
    if (!p || !q) return [0, 0];
    var ux = q[0] - c[0], uy = q[1] - c[1], vx = p[0] - c[0], vy = p[1] - c[1], n = Math.hypot(ux, uy);
    if (!n || (Math.abs(ux * vy - uy * vx) / n <= 1.5 && ux * vx + uy * vy >= 0)) return [0, 0];
    return [vx, vy];
  }
  function flux(a) { return /^(consumption|logic arc)$/.test(a.getAttribute('class')); }   // sbgnml.read's flux
  function ends(S, a) {   // [glyph of the source, of the target, the file's start, end, next points]
    var s = a.getAttribute('source'), t = a.getAttribute('target');
    return [S.portOf[s] || s, S.portOf[t] || t, xy(kid(a, 'start')), xy(kid(a, 'end')), kids(a, 'next').map(xy)];
  }

  // ---------- the GraphML side ----------
  function realizer(n) {   // the node's realizer shown (a group's active one), as graphml.realizer and the editor take it
    var dd = kids(n, 'data');
    for (var i = 0; i < dd.length; i++) {
      var r = kids(dd[i]).filter(function (c) { return c.namespaceURI === YNS; })[0];
      if (!r) continue;
      if (r.localName === 'ProxyAutoBoundsNode') { var rs = r.getElementsByTagNameNS(YNS, 'Realizers')[0]; return rs ? kids(rs)[parseInt(rs.getAttribute('active') || '0', 10)] : null; }
      return r;
    }
    return null;
  }
  function gml(t, opt) {
    var doc = new (DP(opt))().parseFromString(t, 'application/xml'), G = { doc: doc, node: {}, edge: {}, ids: [] };
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(GNS, 'node'), function (n) {
      var r = realizer(n), geo = r && kid(r, 'Geometry');
      if (geo) G.ids.push(n.getAttribute('id'));
      if (geo) G.node[n.getAttribute('id')] = { el: n, geo: geo, box: ['x', 'y', 'width', 'height'].map(function (k) { return F(geo.getAttribute(k)); }) };
    });
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(GNS, 'edge'), function (e) {
      var path = e.getElementsByTagNameNS(YNS, 'Path')[0];
      if (!path) return;
      G.edge[e.getAttribute('id')] = { el: e, path: path, s: e.getAttribute('source'), t: e.getAttribute('target'),
        off: ['sx', 'sy', 'tx', 'ty'].map(function (k) { return F(path.getAttribute(k)) || 0; }),
        pts: kids(path, 'Point').map(xy), ptEl: kids(path, 'Point') };
    });
    return G;
  }

  // the GraphML of sbgnText: baseGraphml with the places sbgnml.read takes from sbgnText (graphml.write's numbers)
  function graphml(t, base, opt) {
    var S = sbgn(t, opt), G = gml(base, opt), T = new Tags(base, G.doc), out = {}, St = styles(S);
    Object.keys(G.node).forEach(function (id) {   // a glyph deleted in the editor: its node and lines out
      if (S.glyph[id] || S.port[id] || S.arc[id] || id.indexOf('|') >= 0 || !classOfCfg(cfgOf(G.node[id].geo.parentNode))) return;
      out[id] = 1;
    });
    Object.keys(out).forEach(function (id) {   // only the outermost cut: a glyph deleted with the compartment round it goes with it (the review: two cuts overlapped)
      for (var up = G.node[id].el.parentNode; up && up.nodeType === 1; up = up.parentNode) if (up.localName === 'node' && out[up.getAttribute('id')]) return;
      T.cut(G.node[id].el);
    });
    Object.keys(G.edge).forEach(function (id) { if (!S.arc[id]) T.cut(G.edge[id].el); });   // at a glyph deleted, or deleted itself (every edge of the converter's is an arc of the file)
    Object.keys(G.node).forEach(function (id) {
      var g = S.glyph[id], n = G.node[id];
      if (!g) return;
      var B = g.box, w = B[2], h = B[3], to = function (el, k, v) { if (el.getAttribute(k) !== v) T.set(el, k, v); };
      ['x', 'y', 'width', 'height'].forEach(function (k, j) { to(n.geo, k, repr(B[j])); });
      if (LOOKED.test(g.el.getAttribute('class') || '')) setLook(T, G, id, fileLook(St, id));   // the file's look (a draft, a build of an older converter)
      // what graphml.write works out from the box: the state variables' places (their ratios read from the file as
      // sbgnml.read reads them), the units of information spread evenly along the top (graphml.write, whatever the
      // file's places), a compartment's name where the file has it. Counted by kind: one deleted in the editor is cut
      var r = n.geo.parentNode, labs = kids(r, 'NodeLabel'), icons = labs.filter(function (l) { return l.getAttribute('iconData'); });
      var states = kids(g.el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'state variable'; }), units = unitsOf(g.el), js = 0, ju = 0;
      var R = G.R || (G.R = resources(G));
      icons.forEach(function (l) {
        var p = l.getElementsByTagNameNS(YNS, 'SmartNodeLabelModelParameter')[0], kind = (R[l.getAttribute('iconData')] || {}).kind, rx, ry, j;
        if (!p) return;
        if (kind === 'StateVariable') {
          if ((j = js++) >= states.length) { T.cut(l); return; }   // deleted in the editor
          var cb = kid(states[j], 'bbox'), cx = F(cb.getAttribute('x')) + F(cb.getAttribute('w')) / 2, cy = F(cb.getAttribute('y')) + F(cb.getAttribute('h')) / 2;
          rx = (cx - B[0] - w / 2) / w; ry = (cy - B[1] - h / 2) / h;
          to(p, 'nodeRatioX', repr(rx)); to(p, 'nodeRatioY', repr(ry));
        } else if (kind === 'UnitOfInformation') {
          if ((j = ju++) >= units.length) { T.cut(l); return; }
          rx = uRatio(j, units.length); ry = -0.5;
          to(p, 'nodeRatioX', repr(rx)); to(p, 'nodeRatioY', repr(ry));
        } else { rx = F(p.getAttribute('nodeRatioX')); ry = F(p.getAttribute('nodeRatioY')); }
        to(l, 'x', repr((0.5 + rx) * w - F(l.getAttribute('width')) / 2)); to(l, 'y', repr((0.5 + ry) * h - F(l.getAttribute('height')) / 2));
      });
      if (g.el.getAttribute('class') === 'compartment') {
        var l = labs.filter(function (x) { return !x.getAttribute('iconData'); })[0], lab = kid(g.el, 'label'), lb = lab && kid(lab, 'bbox');
        if (!l) return;
        var lw = F(l.getAttribute('width'));
        if (!lb) { to(l, 'x', repr((w - lw) / 2)); to(l, 'y', '0.0'); return; }
        var lx = F(lb.getAttribute('x')) - B[0], ly = F(lb.getAttribute('y')) - B[1], bd = Math.max(0, ly), mid = (lx + lw / 2) / w;
        to(l, 'x', repr(lx)); to(l, 'y', repr(ly));
        to(l, 'modelPosition', lw + 2 * bd > w ? 't' : mid < 1 / 3 ? 'tl' : mid > 2 / 3 ? 'tr' : 't'); to(l, 'borderDistance', repr(bd));
      }
    });
    Object.keys(G.edge).forEach(function (id) {
      var a = S.arc[id], e = G.edge[id];
      if (!a) return;
      var E = ends(S, a), pts = E[4], want = ARROW[a.getAttribute('class')], ar = e.el.getElementsByTagNameNS(YNS, 'Arrows')[0];
      if (want != null && ar && ar.getAttribute('target') !== want) T.set(ar, 'target', want);   // an id used again by another arc (the review: a draft reopened over an old build kept the old arrowhead)
      [['source', 's', 0], ['target', 't', 1]].forEach(function (q) {   // an end moved to another glyph in the editor: that glyph
        if (E[q[2]] !== e[q[1]] && G.node[E[q[2]]] && G.node[e[q[1]]]) { T.set(e.el, q[0], E[q[2]]); e[q[1]] = E[q[2]]; }
      });
      if (E[0] !== e.s || E[1] !== e.t || !S.glyph[E[0]] || !S.glyph[E[1]]) return;   // an activity's arcs moved to its entity: as the converter left them
      var o = at(S, E[0], a.getAttribute('source'), E[2], (pts.length ? pts : [E[3]])[0])
        .concat(at(S, E[1], a.getAttribute('target'), E[3], (pts.length ? pts[pts.length - 1] : E[2]), flux(a)));
      ['sx', 'sy', 'tx', 'ty'].forEach(function (k, j) { if (repr(o[j]) !== e.path.getAttribute(k)) T.set(e.path, k, repr(o[j])); });
      var same = pts.length === e.pts.length && pts.every(function (p, j) { return repr(p[0]) === e.ptEl[j].getAttribute('x') && repr(p[1]) === e.ptEl[j].getAttribute('y'); });
      if (same) return;
      // as lxml writes them: the points on the path's line, a path with none closed in itself
      var body = pts.map(function (p) { return '<y:Point x="' + repr(p[0]) + '" y="' + repr(p[1]) + '"/>'; }).join(''), s = T.at.get(e.path);
      T.ed.push([s[1] - (s[2] ? 2 : 1), T.end(e.path), body ? '>' + body + '</y:Path>' : '/>']);
    });
    var out2 = made(S, G, T.text(), t, opt);
    // an arc whose end is a glyph the base lacks (made in the editor, then given its first arc): the glyph is in the
    // GraphML only now, so the arcs are read again onto it; the rest of a second pass changes nothing
    var late = Object.keys(S.arc).some(function (id) { var E = G.edge[id] && ends(S, S.arc[id]); return !!E && [0, 1].some(function (j) { return !G.node[E[j]] && !!S.glyph[E[j]]; }); });
    return late && out2 !== base ? graphml(t, out2, opt) : out2;
  }
  // what the editor made or renamed that the base GraphML lacks (a draft reopened before the build has drawn it)
  function made(S, G, out, t, opt) {
    var St = null, D = null, H = null, Hfor = null;   // the output read again only after it changed (the review: a reading per glyph froze a 2 MB map for minutes)
    var svOf = function (g) {   // a glyph's state variables: [text, rx, ry]
      var B = g.box;
      return kids(g.el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'state variable'; }).map(function (c) {
        var st = kid(c, 'state'), cb = kid(c, 'bbox'), cx = F(cb.getAttribute('x')) + F(cb.getAttribute('w')) / 2, cy = F(cb.getAttribute('y')) + F(cb.getAttribute('h')) / 2;
        return [st ? svText(st.getAttribute('value'), st.getAttribute('variable')) : '', (cx - B[0] - B[2] / 2) / B[2], (cy - B[1] - B[3] / 2) / B[3]];
      });
    };
    var perf = {};   // activities the converter draws as the entity of their performance arc (Newt's hybrid maps): not nodes
    Object.keys(S.arc).forEach(function (k) { if (S.arc[k].getAttribute('class') === 'performance arc') perf[S.arc[k].getAttribute('target')] = 1; });
    Object.keys(S.glyph).forEach(function (id) {
      var g = S.glyph[id], cls = g.el.getAttribute('class') || '', name = nameIn(g.el);
      var au = cls === 'biological activity' ? fileUnit(g.el) : null;   // an activity: its unit
      if (!G.node[id]) {
        var base = au != null ? actCls(au) : cls.replace(/ multimer$/, ''), dk = au != null ? cls : base;
        if (!MAKE[base] || g.el.parentNode.localName !== 'map' || perf[id]) return;
        St = St || styles(S); D = D || {}; D[dk] = D[dk] || defaults(t, opt, dk);
        var lk = fileLook(St, id), cref = g.el.getAttribute('compartmentRef');
        out = add(out, { id: id, cls: base, activity: au, label: name, box: g.box, parent: cref && S.glyph[cref] ? cref : null, fill: lk.fill, line: lk.line, width: lk.width, font: lk.font || D[dk].font,
                         states: svOf(g), units: unitsOf(g.el).map(unitText), multimer: fileMulti(g.el) }, opt);
        return;
      }
      if (au != null) {   // an activity's unit set in a draft the base predates, or a base of an older build without the properties
        if (Hfor !== out) { H = gml(out, opt); Hfor = out; }
        if (actOf(H, id) !== au) out = activity(out, id, au, opt);
      }
      if (PROC.test(cls) || GATES.test(cls)) {   // a process's (a gate's) kind changed in a draft the base predates: its sign
        if (Hfor !== out) { H = gml(out, opt); Hfor = out; }
        if (H.node[id] && classOfR(H.node[id].geo.parentNode) !== cls) out = kind(out, id, cls, opt);
        return;
      }
      if (!NAMED.test(cls)) return;
      if (Hfor !== out) { H = gml(out, opt); Hfor = out; }
      var L = labelsOf(H, id);
      if (L.main && ownText(L.main) !== name) out = label(out, id, name, opt);
      var svs = L.icons.filter(function (q) { return q[1].kind === 'StateVariable'; }), uis = L.icons.filter(function (q) { return q[1].kind === 'UnitOfInformation'; });
      var multi = isMulti(H, id);
      svOf(g).forEach(function (q, j) {
        if (j >= svs.length) out = state(out, id, q[0], q[1], q[2], opt);
        else if ((svs[j][1].text || '') !== q[0]) out = stateValue(out, id, j, q[0], opt);
      });
      unitsOf(g.el).map(unitText).forEach(function (u, j) {
        if (j >= uis.length) out = unit(out, id, u, opt);
        else if ((uis[j][1].text || '') !== u) out = unitValue(out, id, j, u, opt);
      });
      if (multi !== fileMulti(g.el)) out = multimer(out, id, !multi, opt);
    });
    // arcs the editor made (user, 2026-11-15): their edges, the ends as the converter reads them from the file
    var A = [];
    Object.keys(S.arc).forEach(function (id) {
      var a = S.arc[id], E = ends(S, a), head = ARROW[a.getAttribute('class')];
      if (G.edge[id] || head == null || !S.glyph[E[0]] || !S.glyph[E[1]]) return;
      if (Hfor !== out) { H = gml(out, opt); Hfor = out; }
      if (!H.node[E[0]] || !H.node[E[1]]) return;
      var pts = E[4], o = at(S, E[0], a.getAttribute('source'), E[2], (pts.length ? pts : [E[3]])[0])
        .concat(at(S, E[1], a.getAttribute('target'), E[3], (pts.length ? pts[pts.length - 1] : E[2]), flux(a)));
      A.push([id, E[0], E[1], o, head, pts]);
    });
    if (A.length) out = edgesIn(out, H, A);
    return out;
  }

  // ---------- back into the SBGN-ML text ----------
  function write(t, gtext, opt) {
    var dropped = {}, was = gone(gtext);   // dropped: glyphs one of whose units of information was deleted; was: ids never given again (the comment stays with the GraphML)
    t = drop(t, was, opt, dropped);
    var S = sbgn(t, opt), G = gml(gtext, opt);
    var af = afNow(t, S, G);   // an Activity Flow map: activities and influences written as AF's (user, 2026-11-15)
    if (af && !isAf(t)) { t = afLanguage(t); S = sbgn(t, opt); }
    var T = new Tags(t, S.doc);
    var close = function (a, b) { return Math.abs(a - b) < 1e-6; };
    var iconsOf = function (id, kind) {   // [text, rx, ry] of a node's state variables (or units of information) in the GraphML
      return labelsOf(G, id).icons.filter(function (q) { return q[1].kind === (kind || 'StateVariable'); }).map(function (q) {
        var p = q[0].getElementsByTagNameNS(YNS, 'SmartNodeLabelModelParameter')[0];
        return [q[1].text || '', F(p.getAttribute('nodeRatioX')), F(p.getAttribute('nodeRatioY'))];
      });
    };
    // units of information changed in the editor (one added, deleted or retyped): all of the glyph's written again where
    // the converter draws them, spread evenly along the top (layout.decorations); untouched ones stay as the file has them
    var uChanged = {};
    Object.keys(S.glyph).forEach(function (id) {
      var g = S.glyph[id];
      if (!G.node[id] || !NAMED.test(g.el.getAttribute('class') || '')) return;
      var have = unitsOf(g.el).map(unitText), now = iconsOf(id, 'UnitOfInformation').map(function (q) { return q[0]; });
      if (dropped[id] || have.length !== now.length || have.some(function (u, j) { return u !== now[j]; })) uChanged[id] = 1;
    });
    // an activity's unit of information made another or taken off in the editor (activity()): its entity, its box where
    // the editor draws it (afUnitBox), a unit given where it had none; written below, not mapped with the glyph
    var aChanged = {};
    Object.keys(S.glyph).forEach(function (id) {
      var g = S.glyph[id], want = G.node[id] ? actOf(G, id) : null;
      if (want != null && g.el.getAttribute('class') === 'biological activity' && want !== fileUnit(g.el)) aChanged[id] = want;
    });
    var setXY = function (el, p, kx, ky) {
      kx = kx || 'x'; ky = ky || 'y';
      if (!close(F(el.getAttribute(kx)), p[0])) T.set(el, kx, num(p[0]));
      if (!close(F(el.getAttribute(ky)), p[1])) T.set(el, ky, num(p[1]));
    };
    // the glyphs: their boxes, and what they carry mapped from the old box to the new (centres scaled with the box,
    // a label kept at its place from the top left)
    var svMoved = new Set();   // state variables the editor moved along their glyph's border: placed below, not mapped here
    Object.keys(S.glyph).forEach(function (id) {
      var g = S.glyph[id], n = G.node[id];
      if (!n || !NAMED.test(g.el.getAttribute('class') || '')) return;
      var have = kids(g.el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'state variable'; });
      iconsOf(id).forEach(function (q, j) {
        var cb = have[j] && kid(have[j], 'bbox'), B = g.box;
        if (!cb) return;
        var rx = (F(cb.getAttribute('x')) + F(cb.getAttribute('w')) / 2 - B[0] - B[2] / 2) / B[2], ry = (F(cb.getAttribute('y')) + F(cb.getAttribute('h')) / 2 - B[1] - B[3] / 2) / B[3];
        if (!close(rx, q[1]) || !close(ry, q[2])) svMoved.add(cb);
      });
    });
    var map = {};   // glyph id -> function from an old point to the new
    Object.keys(S.glyph).forEach(function (id) {
      var g = S.glyph[id], n = G.node[id];
      if (!n) return;
      var o = g.box, b = n.box;
      if (o.every(function (v, j) { return close(v, b[j]); })) return;
      ['x', 'y', 'w', 'h'].forEach(function (k, j) { if (!close(o[j], b[j])) T.set(g.bbox, k, n.geo.getAttribute(['x', 'y', 'width', 'height'][j])); });
      var f = map[id] = function (p) { return [b[0] + (o[2] ? (p[0] - o[0]) * b[2] / o[2] : b[2] / 2), b[1] + (o[3] ? (p[1] - o[1]) * b[3] / o[3] : b[3] / 2)]; };
      kids(g.el, 'glyph').forEach(function (c) {   // state variables, units of information, glyphs the converter left out
        var cb = kid(c, 'bbox');
        if (!cb || G.node[c.getAttribute('id')] || svMoved.has(cb) || ((uChanged[id] || aChanged[id] != null) && c.getAttribute('class') === 'unit of information')) return;
        var w = F(cb.getAttribute('w')), h = F(cb.getAttribute('h')), m = f([F(cb.getAttribute('x')) + w / 2, F(cb.getAttribute('y')) + h / 2]);
        setXY(cb, [m[0] - w / 2, m[1] - h / 2]);
      });
      var lab = kid(g.el, 'label'), lb = lab && kid(lab, 'bbox');
      if (lb) setXY(lb, [F(lb.getAttribute('x')) + b[0] - o[0], F(lb.getAttribute('y')) + b[1] - o[1]]);
    });
    // names and state variables set in the editor, and glyphs it made (user, 2026-11-14: the full editor)
    var pre = S.doc.documentElement.prefix ? S.doc.documentElement.prefix + ':' : '';
    var svBox = function (txt, b, rx, ry) { var sw = txt.length <= 2 ? 15 : 45; return [b[0] + b[2] / 2 + rx * b[2] - sw / 2, b[1] + b[3] / 2 + ry * b[3] - 7.5, sw, 15]; };   // layout.decorations
    var bboxXml = function (b) { return '<' + pre + 'bbox x="' + num(b[0]) + '" y="' + num(b[1]) + '" w="' + num(b[2]) + '" h="' + num(b[3]) + '"/>'; };
    var svXml = function (gid, k, q, b, ind) {
      var v = q[0].split('@'), val = v.shift(), vr = v.join('@'), sid = gid + '_sv' + k, j = 0;
      while (S.glyph[sid] || S.port[sid] || S.arc[sid] || was.indexOf(sid) >= 0) sid = gid + '_sv' + k + '_' + (++j);
      return '\n' + ind + '<' + pre + 'glyph class="state variable" id="' + esc(sid) + '">\n' + ind + '  <' + pre + 'state value="' + esc(val) + '"' + (vr ? ' variable="' + esc(vr) + '"' : '') + '/>\n' +
        ind + '  ' + bboxXml(svBox(q[0], b, q[1], q[2])) + '\n' + ind + '</' + pre + 'glyph>';
    };
    var uiXml = function (gid, k, txt, b, ind) {   // a unit of information as sbgnml.write writes it
      var uid = gid + '_ui' + k, j = 0;
      while (S.glyph[uid] || S.port[uid] || S.arc[uid] || was.indexOf(uid) >= 0) uid = gid + '_ui' + k + '_' + (++j);
      return '\n' + ind + '<' + pre + 'glyph class="unit of information" id="' + esc(uid) + '">\n' + ind + '  <' + pre + 'label text="' + esc(txt) + '"/>\n' +
        ind + '  ' + bboxXml(b) + '\n' + ind + '</' + pre + 'glyph>';
    };
    var actUnitXml = function (gid, unit, b, ind) {   // an activity's unit of information: its entity only, no text (user, 2026-11-15)
      var uid = gid + '_ui0', j = 0;
      while (S.glyph[uid] || S.port[uid] || S.arc[uid] || was.indexOf(uid) >= 0) uid = gid + '_ui0_' + (++j);
      return '\n' + ind + '<' + pre + 'glyph class="unit of information" id="' + esc(uid) + '">\n' + ind + '  <' + pre + 'entity name="' + esc(unit) + '"/>\n' +
        ind + '  ' + bboxXml(afUnitBox(b, unit)) + '\n' + ind + '</' + pre + 'glyph>';
    };
    Object.keys(aChanged).forEach(function (id) {
      var g = S.glyph[id], want = aChanged[id], b = G.node[id].box, u = kids(g.el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'unit of information'; })[0];
      var e = u && kid(u, 'entity'), ub = u && kid(u, 'bbox');
      if (u && !ub) return;
      if (!want) { if (u) T.cut(unitText(u) ? e : u); return; }   // taken off (a unit with text keeps its text, its entity goes)
      if (!u) { var e0 = T.end(g.bbox); T.ed.push([e0, e0, actUnitXml(id, want, b, T.indent(g.bbox))]); return; }
      if (e) T.set(e, 'name', want);
      else { var at4 = T.at.get(ub)[0]; T.ed.push([at4, at4, '<' + pre + 'entity name="' + esc(want) + '"/>\n' + T.indent(ub)]); }
      var nb = afUnitBox(b, want);
      ['x', 'y', 'w', 'h'].forEach(function (k, j) { if (!close(F(ub.getAttribute(k)), nb[j])) T.set(ub, k, num(nb[j])); });
    });
    Object.keys(S.glyph).forEach(function (id) {   // a process made omitted or uncertain, or the generic one again (its sign in the GraphML)
      var g = S.glyph[id], n = G.node[id], cls = g.el.getAttribute('class') || '', want = (n && (PROC.test(cls) || /^(and|or|not)$/.test(cls)) && classOfR(n.geo.parentNode)) || cls;
      if (want !== cls) {
        T.set(g.el, 'class', want);
        var gl = GATES.test(want) && kid(g.el, 'label');   // a gate's label, as the converter writes it (AND, OR, NOT)
        if (gl) T.set(gl, 'text', GATE[want]);
      }
    });
    Object.keys(S.glyph).forEach(function (id) {
      var g = S.glyph[id], n = G.node[id], cls = g.el.getAttribute('class') || '';
      if (!n || !NAMED.test(cls)) return;
      var L = labelsOf(G, id), lab = kid(g.el, 'label');
      if (L.main && ownText(L.main) !== nameIn(g.el)) {
        if (lab) T.set(lab, 'text', ownText(L.main));
        else { var at1 = T.at.get(g.bbox)[0]; T.ed.push([at1, at1, '<' + pre + 'label text="' + esc(ownText(L.main)) + '"/>\n' + T.indent(g.bbox)]); }
      }
      // made a multimer or a single macromolecule again (user, 2026-11-14): the class, where the converter would read the
      // file otherwise (a multimer with N:1 reads as one unit: left as it is)
      var base = cls.replace(/ multimer$/, ''), multi = isMulti(G, id);
      if (MULTI.test(base) && multi !== drawnMulti(cls, iconsOf(id, 'UnitOfInformation').map(function (q) { return q[0]; }))) T.set(g.el, 'class', base + (multi ? ' multimer' : ''));   // judged by the units as now typed
      var have = kids(g.el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'state variable'; }), more = '';
      var icons = iconsOf(id), hu = unitsOf(g.el), ui = iconsOf(id, 'UnitOfInformation'), cutEls = [];
      have.slice(icons.length).forEach(function (c) { T.cut(c); cutEls.push(c); });   // deleted in the editor
      var moreU = '';
      if (uChanged[id]) {   // units of information: their text, all placed as the converter draws them, new ones written
        hu.slice(ui.length).forEach(function (c) { T.cut(c); cutEls.push(c); });
        ui.forEach(function (q, k) {
          var ub = uBox(q[0], n.box, k, ui.length);
          if (k >= hu.length) { moreU += uiXml(id, k, q[0], ub, T.indent(g.bbox)); return; }
          var cb2 = kid(hu[k], 'bbox'), lab2 = kid(hu[k], 'label');
          if (unitText(hu[k]) !== q[0]) {
            if (lab2) T.set(lab2, 'text', q[0]);
            else { var at3 = T.at.get(cb2)[0]; T.ed.push([at3, at3, '<' + pre + 'label text="' + esc(q[0]) + '"/>\n' + T.indent(cb2)]); }
          }
          setXY(cb2, ub);
          if (!close(F(cb2.getAttribute('w')), ub[2])) T.set(cb2, 'w', num(ub[2]));
          if (!close(F(cb2.getAttribute('h')), ub[3])) T.set(cb2, 'h', num(ub[3]));
        });
      }
      icons.forEach(function (q, j) {
        if (j >= have.length) { more += svXml(id, j, q, n.box, T.indent(g.bbox)); return; }
        var cb = kid(have[j], 'bbox');
        if (svMoved.has(cb)) { var nb = svBox(q[0], n.box, q[1], q[2]), w0 = F(cb.getAttribute('w')), h0 = F(cb.getAttribute('h')); setXY(cb, [nb[0] + nb[2] / 2 - w0 / 2, nb[1] + nb[3] / 2 - h0 / 2]); }
        var st = kid(have[j], 'state'), v = q[0].split('@'), val = v.shift(), vr = v.join('@');
        if ((st ? svText(st.getAttribute('value'), st.getAttribute('variable')) : '') === q[0]) return;   // no state element reads as empty (sbgnml.read)
        if (!st) { var at2 = T.at.get(kid(have[j], 'bbox'))[0]; T.ed.push([at2, at2, '<' + pre + 'state value="' + esc(val) + '"' + (vr ? ' variable="' + esc(vr) + '"' : '') + '/>\n' + T.indent(kid(have[j], 'bbox'))]); return; }
        T.set(st, 'value', val);
        if (vr) T.set(st, 'variable', vr); else T.unset(st, 'variable');
      });
      if (more || moreU) {   // after the last state variable or unit of information that stays, else after the bbox
        var lastKid = have.concat(hu).filter(function (c) { return cutEls.indexOf(c) < 0; }).sort(function (x, y) { return T.at.get(y)[0] - T.at.get(x)[0]; })[0];
        var e1 = T.end(lastKid || g.bbox); T.ed.push([e1, e1, more + moreU]);
      }
    });
    // the look set in the editor's properties (user, 2026-11-14): fill, border colour and width
    var St = styles(S), looks = new Map();   // glyph id -> the look wanted, where it is not the file's
    Object.keys(S.glyph).forEach(function (id) {
      var cls = S.glyph[id].el.getAttribute('class') || '';
      if (!G.node[id] || !LOOKED.test(cls)) return;   // the glyphs the editor restyles (other kinds keep their templates' borders: a compartment's 2)
      var want = lookG(G, id), have = fileLook(St, id);
      if (want.fill !== have.fill || want.line !== have.line || want.width !== have.width) looks.set(id, { fill: want.fill, line: want.line, width: want.width, font: have.font, cls: cls });
    });
    var mapEl = kids(S.doc.documentElement, 'map')[0], tops = kids(mapEl, 'glyph'), last = tops[tops.length - 1];
    var ind0 = last ? T.indent(last) : T.indent(mapEl) + '  ', fresh = '', front = '', made = {};
    G.ids.forEach(function (id) {
      if (S.glyph[id] || S.port[id] || S.arc[id] || id.indexOf('|') >= 0) return;
      var n = G.node[id], cls = classOfR(n.geo.parentNode), act = af ? actOf(G, id) : null;
      if (!cls) return;
      if (act != null) cls = 'biological activity';   // on an Activity Flow map (elsewhere written as its entity)
      made[id] = 1;
      var up = n.el.parentNode; while (up && up.localName !== 'node') up = up.parentNode;
      var uid = up && up.getAttribute('id'), cref = uid && (S.glyph[uid] ? S.glyph[uid].el.getAttribute('class') === 'compartment' : !!G.node[uid] && cfgOf(G.node[uid].geo.parentNode) === 'Compartment') ? uid : null;   // a compartment of the file or made with it
      var L = labelsOf(G, id), name = L.main && !PROC.test(cls) ? ownText(L.main) : '', lk = lookG(G, id);   // a process's sign is its class, no label
      if (GATES.test(cls)) name = /^(equivalence|delay)$/.test(cls) ? '' : GATE[cls];   // a gate's label as sbgnml.write writes it (none on the equivalence, the spec 2.9.4, nor on a delay: its class says it)
      var fu = iconsOf(id, 'UnitOfInformation');
      var xml = '\n' + ind0 + '<' + pre + 'glyph class="' + cls + (isMulti(G, id) && MULTI.test(cls) ? ' multimer' : '') + '" id="' + esc(id) + '"' + (cref ? ' compartmentRef="' + esc(cref) + '"' : '') + '>' +
        (name ? '\n' + ind0 + '  <' + pre + 'label text="' + esc(name) + '"/>' : '') + '\n' + ind0 + '  ' + bboxXml(n.box) +
        (act != null ? (act ? actUnitXml(id, act, n.box, ind0 + '  ') : '') :   // under AF no state variables or text units (create.js afMap)
        iconsOf(id).map(function (q, k) { return svXml(id, k, q, n.box, ind0 + '  '); }).join('') +
        fu.map(function (q, k) { return uiXml(id, k, q[0], uBox(q[0], n.box, k, fu.length), ind0 + '  '); }).join('')) + '\n' + ind0 + '</' + pre + 'glyph>';
      if (cls === 'compartment') front += xml; else fresh += xml;   // a compartment before the glyphs, as the editor draws it under them
      if (lk.fill || lk.line || lk.width !== 1) looks.set(id, { fill: lk.fill, line: lk.line, width: lk.width, font: L.main ? F(L.main.getAttribute('fontSize')) : null, cls: cls, fresh: true });
    });
    var ext = restyle0(S, T, St, looks, pre);   // a render extension written for an empty <map/>: put into it below
    if (front && tops.length) { var f0 = T.at.get(tops[0])[0]; T.ed.push([f0, f0, front.replace(/^\n\s*/, '') + '\n' + T.indent(tops[0])]); }
    else fresh = front + fresh;
    if (fresh) {
      var ms = T.at.get(mapEl);
      if (!last && ms[2]) T.ed.push([ms[0], ms[1], T.t.slice(ms[0], ms[1] - 2).replace(/\s+$/, '') + '>' + (ext || '') + fresh + '\n' + T.indent(mapEl) + '</' + pre + 'map>']);   // an empty <map/>
      else { var e2 = last ? T.end(last) : T.t.lastIndexOf('</', T.end(mapEl) - 1); T.ed.push([e2, e2, fresh.replace(/\s+$/, '') + (last ? '' : '\n' + T.indent(mapEl))]); }   // an empty <map></map>: before its end, after an extension written at its start
    }
    // the arcs: their bends, then their ends (an end at a port gives the port its place)
    var portAt = {}, newPorts = {}, use = {};
    Object.keys(S.arc).forEach(function (id) {   // which port of a glyph its consumptions (1) and products (2) use in the file
      var a = S.arc[id], src = a.getAttribute('source'), tgt = a.getAttribute('target');
      if (S.portOf[src]) use[S.portOf[src] + '\u0000' + 2] = use[S.portOf[src] + '\u0000' + 2] || src;
      if (S.portOf[tgt] && flux(a)) use[S.portOf[tgt] + '\u0000' + 1] = use[S.portOf[tgt] + '\u0000' + 1] || tgt;
    });
    var newId = function (gid, no) { var i = gid + '.' + no, k = 0; while (S.port[i] || S.glyph[i]) i = gid + '.p' + no + (k++ ? k : ''); return i; };
    Object.keys(S.arc).forEach(function (id) {
      var a = S.arc[id], e = G.edge[id];
      if (!e) return;
      var E = ends(S, a), ref = [a.getAttribute('source'), a.getAttribute('target')], cls = a.getAttribute('class');
      var hc = headClass(headOf(e)), pc = PD_ARC[cls] || cls;   // a modulation made another in the editor: its class from the arrowhead (an influence's under AF's name)
      if (MODS.test(pc) && hc && MODS.test(hc) && hc !== pc) T.set(a, 'class', (af || PD_ARC[cls]) && AF_ARC[hc] ? AF_ARC[hc] : hc);
      // an end moved to another glyph (the editor, user 2026-11-14): the arc names that glyph, its port set below; the
      // arrowhead-less line is a consumption at a process and a logic arc at a gate (user: one connector for both)
      var moved = [0, 1].map(function (j) { var g = j ? e.t : e.s; return E[j] !== g && !!G.node[E[j]] && !!G.node[g] && !!S.glyph[g]; });
      moved.forEach(function (m, j) { if (m) { E[j] = ref[j] = j ? e.t : e.s; E[2 + j] = null; } });
      if (moved[0] || moved[1]) {
        var hub = (S.glyph[E[1]] && S.glyph[E[1]].el.getAttribute('class')) || '';
        if (cls === 'consumption' && GATES.test(hub)) cls = 'logic arc';
        else if (cls === 'logic arc' && HUB.test(hub) && !GATES.test(hub)) cls = 'consumption';
        if (cls !== a.getAttribute('class')) T.set(a, 'class', cls);
      }
      if (E[0] !== e.s || E[1] !== e.t || !G.node[E[0]] || !G.node[E[1]] || !S.glyph[E[0]] || !S.glyph[E[1]]) return;
      var nx = kids(a, 'next');
      if (nx.length !== e.pts.length || nx.some(function (q, j) { var p = xy(q); return !close(p[0], e.pts[j][0]) || !close(p[1], e.pts[j][1]); })) {
        var pre = a.prefix ? a.prefix + ':' : '';
        var out = e.pts.map(function (p, j) { return '<' + pre + 'next x="' + (e.ptEl[j].getAttribute('x')) + '" y="' + (e.ptEl[j].getAttribute('y')) + '"/>'; });
        if (nx.length) {
          var ind = '\n' + T.indent(nx[0]);
          var from = T.at.get(nx[0])[0];
          if (!out.length) from = T.end(prevEl(nx[0]));   // all taken out: from the tag before them (a one-line file too: the review of V4)
          T.ed.push([from, T.end(nx[nx.length - 1]), out.join(ind)]);
        } else {
          var en = kid(a, 'end'), at0 = en ? T.at.get(en)[0] : T.end(kid(a, 'start'));
          var ind2 = en ? T.indent(en) : T.indent(kid(a, 'start'));
          if (out.length) T.ed.push([at0, at0, out.join('\n' + ind2) + (en ? '\n' + ind2 : '')]);
        }
      }
      // the ends: one at a port gives the port its place; one off the centre is written where the GraphML has it; one at
      // the centre (0, 0) where the converter reads it back as the centre: the file's own point (moved with its glyph)
      // while it lies on the line toward the next point (sbgnml.at's rule), else where that line leaves the box
      var side = [['source', 'start', 0, E[0], E[2]], ['target', 'end', 2, E[1], E[3]]].map(function (q) {
        var gid = q[3], b = G.node[gid].box, c = centre(b), o = S.glyph[gid].box;
        var port = ref[q[2] / 2] !== gid && (q[0] === 'source' || /^(consumption|logic arc)$/.test(cls));   // an end the converter reads at its port
        var zero = !e.off[q[2]] && !e.off[q[2] + 1] && !port;
        return { q: q, gid: gid, c: c, zero: zero, port: port, P: [c[0] + e.off[q[2]], c[1] + e.off[q[2] + 1]],
                 old: q[4] && (map[gid] ? map[gid](q[4]) : q[4]) };   // with its glyph, scaled when the box was resized
      });
      // nothing about the arc changed (its glyphs, bends and ends as the converter reads them from the file): its ends kept
      var fileOff = at(S, E[0], a.getAttribute('source'), E[2], (E[4].length ? E[4] : [E[3]])[0])
        .concat(at(S, E[1], a.getAttribute('target'), E[3], (E[4].length ? E[4][E[4].length - 1] : E[2]), flux(a)));
      var still = !moved[0] && !moved[1] && !map[E[0]] && !map[E[1]] && nx.length === e.pts.length && fileOff.every(function (v, j) { return close(v, e.off[j]); }) &&
        e.pts.every(function (p, j) { var q = xy(nx[j]); return close(p[0], q[0]) && close(p[1], q[1]); });
      if (still) return;
      var keep = function (s, aim) { return !!s.old && onLine(s.c, s.old, aim); };   // the file's own end carried with its glyph while on the line
      var onLine = function (c, p, aim) {
        var u = [aim[0] - c[0], aim[1] - c[1]], v = [p[0] - c[0], p[1] - c[1]], n = Math.hypot(u[0], u[1]);
        return !n || (Math.abs(u[0] * v[1] - u[1] * v[0]) / n <= 1 && u[0] * v[0] + u[1] * v[1] >= 0);   // within 1 of the converter's 1.5: safe after rounding
      };
      var cut = function (s, aim) { return boxCut(G.node[s.gid].box, aim); };
      var aim = [e.pts.length ? e.pts[0] : null, e.pts.length ? e.pts[e.pts.length - 1] : null];
      if (e.pts.length) side.forEach(function (s, j) { if (s.zero) s.P = keep(s, aim[j]) ? s.old : cut(s, aim[j]); });
      else if (side[0].zero && side[1].zero) {   // both at their centres: kept as a pair, else both on the line between the centres
        if (keep(side[0], side[1].old || side[1].c) && keep(side[1], side[0].old || side[0].c)) { side[0].P = side[0].old; side[1].P = side[1].old; }
        else { side[0].P = cut(side[0], side[1].c); side[1].P = cut(side[1], side[0].P); }   // toward the start written (the converter's aim)
      } else side.forEach(function (s, j) { var o = side[1 - j]; if (s.zero) s.P = keep(s, o.zero ? o.old || o.c : o.P) ? s.old : cut(s, o.P); });
      side.forEach(function (s) {
        var q = s.q, j0 = q[2] / 2, rf = ref[j0], el = kid(a, q[1]), P = s.P;
        if (!el) return;
        if (!s.port && rf !== s.gid && !s.zero) ref[j0] = s.gid;   // a modifier the file aimed at a port, moved: now at the glyph (read as the centre else)
        if (s.port) {
          // at a port: the port where the GraphML has it, the arc's end on it (the file's own kept while the port stays)
          portAt[rf] = portAt[rf] || P;
          var o0 = xy(S.port[rf]);
          if (!close(o0[0], portAt[rf][0]) || !close(o0[1], portAt[rf][1])) setXY(el, portAt[rf]);   // a port moved: the end on it
          return;
        }
        var b2 = G.node[s.gid].box, out2 = Math.abs(P[0] - s.c[0]) > b2[2] / 2 + 0.5 || Math.abs(P[1] - s.c[1]) > b2[3] / 2 + 0.5;
        var no = q[0] === 'source' ? 2 : /^(consumption|logic arc)$/.test(cls) ? 1 : 0;   // what leaves a process or gate (a production, a gate's output: a logic arc or a modulation) from its port two
        if (!s.zero && out2 && no && HUB.test(S.glyph[s.gid].el.getAttribute('class') || '')) {   // at a port of a process or gate
          // the arc named the glyph: now the port its glyph's other consumptions (products) use, else a port made
          var have = kids(S.glyph[s.gid].el, 'port').map(function (x) { return x.getAttribute('id'); }), other = use[s.gid + '\u0000' + (3 - no)];
          var pid = use[s.gid + '\u0000' + no] || (have.length >= 2 ? have.filter(function (x) { return x !== other; })[other ? 0 : no - 1] : null);
          if (pid) { ref[j0] = pid; portAt[pid] = portAt[pid] || P; }
          else {
            (newPorts[s.gid] = newPorts[s.gid] || {})[no] = newPorts[s.gid][no] || P;
            ref[j0] = newId(s.gid, no);
          }
        }
        setXY(el, P);
      });
      ['source', 'target'].forEach(function (k, j) { if (ref[j] !== a.getAttribute(k)) T.set(a, k, ref[j]); });
    });
    // the ports: where their arcs put them; a port no arc names moves with its glyph; a made one written
    Object.keys(S.port).forEach(function (pid) {
      var p = S.port[pid], gid = S.portOf[pid], P = portAt[pid] || (map[gid] && map[gid](xy(p)));
      if (P) setXY(p, P);
    });
    Object.keys(newPorts).forEach(function (gid) {
      var g = S.glyph[gid], P = newPorts[gid], c = centre(G.node[gid].box);
      P[1] = P[1] || [2 * c[0] - P[2][0], 2 * c[1] - P[2][1]]; P[2] = P[2] || [2 * c[0] - P[1][0], 2 * c[1] - P[1][1]];
      var ind = '\n' + T.indent(g.bbox), e = T.end(g.bbox);
      T.ed.push([e, e, [1, 2].map(function (k) { return ind + '<' + (g.el.prefix ? g.el.prefix + ':' : '') + 'port id="' + esc(newId(gid, k)) + '" x="' + num(P[k][0]) + '" y="' + num(P[k][1]) + '"/>'; }).join('')]);
      if (!g.el.getAttribute('orientation') && HUB.test(g.el.getAttribute('class') || '') && !GATES.test(g.el.getAttribute('class'))) T.set(g.el, 'orientation', Math.abs(P[2][0] - P[1][0]) >= Math.abs(P[2][1] - P[1][1]) ? 'horizontal' : 'vertical');   // a bare process given its ports by its first arc
    });
    // a process's orientation, where the file gives one, follows its ports
    Object.keys(S.glyph).forEach(function (gid) {
      var g = S.glyph[gid], o = g.el.getAttribute('orientation');
      if (!o || !G.node[gid]) return;
      var ps = kids(g.el, 'port').map(function (p) { return portAt[p.getAttribute('id')] || xy(p); });
      if (ps.length < 2) return;
      var want = Math.abs(ps[1][0] - ps[0][0]) >= Math.abs(ps[1][1] - ps[0][1]) ? 'horizontal' : 'vertical';
      if (want !== o) T.set(g.el, 'orientation', want);
    });
    // an arc's end moved onto a glyph made in this editing (a bare process and its first arc): that glyph is in the file
    // only now, so the arcs are written again on the text that has it (the review: the move was lost on save); the
    // rest of a second pass changes nothing, the file already holding it
    if (Object.keys(G.edge).some(function (k) { return S.arc[k] && (made[G.edge[k].s] || made[G.edge[k].t]); })) return write(T.text(), gtext, opt);
    // arcs made in the editor (user, 2026-11-15): written after the file's arcs, naming their glyphs, their ends where the
    // GraphML has them; the second pass then gives a process end its port (a bare process its two, and its orientation)
    var out = T.text(), S2 = null, add = [];
    Object.keys(G.edge).forEach(function (k) {
      var e = G.edge[k];
      if (S.arc[k] || S.glyph[k] || S.port[k] || was.indexOf(k) >= 0) return;
      S2 = S2 || sbgn(out, opt);
      if (!S2.glyph[e.s] || !S2.glyph[e.t] || !G.node[e.s] || !G.node[e.t]) return;   // an end the file does not have (a glyph the converter left out)
      var cls = arcClass(G, e, S2);
      if (!cls) return;
      if (af && AF_ARC[cls]) cls = AF_ARC[cls];   // an influence (user, 2026-11-15: AF's names in an Activity Flow file)
      var pre2 = S2.doc.documentElement.prefix ? S2.doc.documentElement.prefix + ':' : '', pt = function (tag, p) { return '<' + pre2 + tag + ' x="' + num(p[0]) + '" y="' + num(p[1]) + '"/>'; };
      var A = [G.node[e.s].box, G.node[e.t].box].map(function (bb, j) { var c = centre(bb); return [c[0] + e.off[2 * j], c[1] + e.off[2 * j + 1]]; });
      // an end at the centre: where the line toward the next point leaves the box (sbgnml.at reads it back as the centre);
      // an end off it (a port of a process) at the centre for now, so the second pass sees it moved and names the port
      var P2 = [0, 1].map(function (j) {
        var aim = e.pts.length ? e.pts[j ? e.pts.length - 1 : 0] : A[1 - j], b = j ? G.node[e.t].box : G.node[e.s].box;
        return e.off[2 * j] || e.off[2 * j + 1] ? centre(b) : boxCut(b, aim);
      });
      add.push({ xml: '<' + pre2 + 'arc class="' + cls + '" id="' + esc(k) + '" source="' + esc(e.s) + '" target="' + esc(e.t) + '">',
                 body: [pt('start', P2[0])].concat(e.pts.map(function (p) { return pt('next', p); }), [pt('end', P2[1])]), end: '</' + pre2 + 'arc>' });
    });
    if (!add.length) return out;
    var T2 = new Tags(out, S2.doc), mapEl2 = kids(S2.doc.documentElement, 'map')[0], arcs2 = kids(mapEl2, 'arc'), glyphs2 = kids(mapEl2, 'glyph');
    var after = arcs2.length ? arcs2[arcs2.length - 1] : glyphs2[glyphs2.length - 1], ind3 = T2.indent(after), at3 = T2.end(after);
    T2.ed.push([at3, at3, add.map(function (q) { return '\n' + ind3 + q.xml + q.body.map(function (x) { return '\n' + ind3 + '  ' + x; }).join('') + '\n' + ind3 + q.end; }).join('')]);
    return write(T2.text(), gtext, opt);
  }

  // ---------- creating (user, 2026-11-14: the full editor, entities added from a palette as in yEd and Newt) ----------
  // What the editor adds is written into its GraphML as graphml.write writes it (the yed.graphml templates, its label
  // and icon sizes), write() puts it into the SBGN-ML text, and graphml() makes it again from the SBGN-ML text (a draft
  // reopened before the build has drawn it). So far: a macromolecule, its name, its state variables; a simple chemical and
  // its name (no state variable or unit of information: the house profile, user 2026-11-14, CellDesigner keeps none).
  //   defaults(sbgnText, opt, cls) -> { w, h, font, fill } of a new glyph of that class on that map (its scale, the style
  //   most of the map's glyphs of that class use); cls defaults to macromolecule
  //   add(g, { id, cls, label, box, parent, fill, font }) -> g with the node (parent: a compartment's node id)
  //   label(g, id, text) -> g with the node's name; state(g, id, value, rx, ry) -> g with a state variable added at that
  //   point of the border (rx, ry from the centre, as yEd's nodeRatio); stateValue(g, id, j, value): its j-th one's value
  //   resize(g, id, [x, y, w, h]) -> g with the node's box set, its name, state variables and line ends following
  var CHAR = 9.5, LINE = 16.5, ICON_CHAR = 5.4;   // graphml.py: a label line's height and a character's width at 14; an icon's character
  // what the palette makes: SBGN class -> yEd's configuration (a compartment is yEd's GroupNode, which has none: cfgOf);
  // the glyphs added on 2026-11-14 (user: "perturbing agent ... phenotype ... nucleic acid feature ... empty set ...
  // complex ... submap ... compartment with line thickness 2 pixels", "unspecified entity too") as graphml.write writes
  // each from its template in mapconv/yed.graphml (the master; the realizers below copy it): a complex made empty is the
  // plain Complex (a group only once it has members), a compartment the template's GroupNode with its 2 px border
  var MAKE = { macromolecule: 'Macromolecule', 'simple chemical': 'SimpleChemical', 'nucleic acid feature': 'NucleicAcidFeature',
               'unspecified entity': 'UnspecifiedEntity', complex: 'Complex', 'perturbing agent': 'PerturbingAgent', 'source and sink': 'EmptySet',
               phenotype: 'Phenotype', submap: 'Submap', compartment: 'Compartment',
               // processes (user, 2026-11-14: "process, omitted, uncertain"; no association or dissociation, by choice): yEd's
               // Process, the omitted and the uncertain one labelled with their sign (graphml.PROCESS_LABEL); made bare, no
               // ports or orientation in the file until a first arc gives them (yrender draws no antennas without arcs)
               process: 'Process', 'omitted process': 'Process', 'uncertain process': 'Process',
               // logic gates (user, 2026-11-15: "let's add logic gates, including identity gate", the identity gate SBGN's
               // equivalence operator): yEd's Operator labelled AND, OR, NOT or the equivalence's sign (graphml.EQUIV); made
               // bare as a process is, its ports written by its first arc
               and: 'Operator', or: 'Operator', not: 'Operator', equivalence: 'Operator',
               // Activity Flow's delay (user, 2026-11-15: the palette's AF tab): yEd's Operator labelled tau (graphml.DELAY), drawn as the equivalence
               delay: 'Operator' };
  var SIGN = { 'omitted process': '\\\\', 'uncertain process': '?' }, PROC = /^(process|omitted process|uncertain process)$/;
  var GATE = { and: 'AND', or: 'OR', not: 'NOT', equivalence: '\u2261', delay: '\u03c4' }, GATES = /^(and|or|not|equivalence|delay)$/;   // sbgnml.OPERATORS
  // sizes at the map's scale: the converter's standard ones (style.py) where it has them, else on the 8 grid near the
  // templates' (an empty complex 144 by 64, the empty set 32)
  var SIZE = { macromolecule: [80, 40], 'simple chemical': [40, 40], 'nucleic acid feature': [80, 40], 'unspecified entity': [80, 40], complex: [144, 64],
               'perturbing agent': [80, 40], 'source and sink': [32, 32], phenotype: [120, 40], submap: [120, 64], compartment: [400, 320],
               process: [18, 18], 'omitted process': [18, 18], 'uncertain process': [18, 18],   // a process: our yEd maps' 18
               and: [30, 30], or: [30, 30], not: [30, 30], equivalence: [30, 30], delay: [30, 30],   // a gate: our yEd maps' 30 (yed.graphml's Operator)
               'biological activity': [80, 40] };   // every activity a protein's size, whatever its unit (user, 2026-11-15: "All activities should have the same size, 80 by 40")
  function cfgOf(r) { return r.localName === 'GroupNode' ? 'Compartment' : (r.getAttribute('configuration') || '').replace('com.yworks.sbgn.', ''); }
  function classOfCfg(cfg) { var c = null; Object.keys(MAKE).forEach(function (k) { if (!c && MAKE[k] === cfg) c = k; }); return c; }
  function classOfR(r) {   // the class a realizer of the editor's GraphML stands for: a process's by its sign
    var cfg = cfgOf(r);
    if (cfg !== 'Process' && cfg !== 'Operator') return classOfCfg(cfg);
    var l = kids(r, 'NodeLabel').filter(function (x) { return !x.getAttribute('iconData'); })[0], t = l ? ownText(l).trim() : '';
    if (cfg === 'Operator') return Object.keys(GATE).filter(function (k) { return GATE[k] === t || GATE[k] === t.toUpperCase(); })[0] || null;   // tau as it is (its upper case is another letter)
    return Object.keys(SIGN).filter(function (k) { return SIGN[k] === t; })[0] || 'process';
  }
  var NAMED = /^(macromolecule|simple chemical|nucleic acid feature|unspecified entity|perturbing agent|phenotype|complex|submap|compartment)( multimer)?$|^biological activity$/;   // names kept in step both ways
  function ownText(el) { var t = ''; for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 || c.nodeType === 4) t += c.nodeValue; return t; }
  function labelBox(text, w, h, k) {   // graphml._label: the label's box estimated and centred
    var lines = text ? text.split('\n') : [], n = 0;
    lines.forEach(function (x) { n = Math.max(n, x.length); });
    var lw = n * CHAR * k, lh = lines.length * LINE * k + 4;
    return [lw, lh, (w - lw) / 2, (h - lh) / 2];
  }
  var LM = '<y:LabelModel><y:SmartNodeLabelModel distance="4.0"/></y:LabelModel>';
  function mainLabel(text, w, h, fs) {
    var b = labelBox(text, w, h, fs / 14);
    return '<y:NodeLabel alignment="center" autoSizePolicy="content" fontFamily="Dialog" fontSize="' + fs + '" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" height="' + repr(b[1]) +
      '" horizontalTextPosition="center" iconTextGap="4" modelName="custom" textColor="#000000" verticalTextPosition="center" visible="true" width="' + repr(b[0]) + '" x="' + repr(b[2]) +
      '" xml:space="preserve" y="' + repr(b[3]) + '" hasText="' + (text ? 'true' : 'false') + '">' + esc(text) + LM +
      '<y:ModelParameter><y:SmartNodeLabelModelParameter labelRatioX="0.0" labelRatioY="0.0" nodeRatioX="0.0" nodeRatioY="0.0" offsetX="0.0" offsetY="0.0" upX="0.0" upY="-1.0"/></y:ModelParameter></y:NodeLabel>';
  }
  function svSize(text, k) { return text.length <= 2 ? [18 * k, 18 * k] : [Math.ceil(text.length * ICON_CHAR * k + 12 * k), 18 * k]; }   // graphml.write's resource (k: its font against 10)
  function iconLabel(rid, size, w, h, rx, ry) {
    return '<y:NodeLabel alignment="center" autoSizePolicy="content" borderDistance="0.0" bottomInset="0" fontFamily="Dialog" fontSize="12" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" hasText="false" height="' + repr(size[1]) +
      '" horizontalTextPosition="center" iconData="' + rid + '" iconTextGap="0" leftInset="0" modelName="custom" rightInset="0" textColor="#000000" topInset="0" verticalTextPosition="center" visible="true" width="' + repr(size[0]) +
      '" x="' + repr((0.5 + rx) * w - size[0] / 2) + '" y="' + repr((0.5 + ry) * h - size[1] / 2) + '">\n' +
      '                <y:LabelModel>\n                  <y:SmartNodeLabelModel distance="4.0"/>\n                </y:LabelModel>\n                <y:ModelParameter>\n' +
      '                  <y:SmartNodeLabelModelParameter labelRatioX="0.0" labelRatioY="0.0" nodeRatioX="' + repr(rx) + '" nodeRatioY="' + repr(ry) + '" offsetX="0.0" offsetY="0.0" upX="0.0" upY="-1.0"/>\n' +
      '                </y:ModelParameter>\n              </y:NodeLabel>';
  }
  function resources(G) {   // the GraphML's shared icons: id -> { kind, text, size, font }
    var out = {};
    Array.prototype.forEach.call(G.doc.getElementsByTagNameNS(YNS, 'Resource'), function (r) {
      var gn = r.getElementsByTagNameNS(YNS, 'GenericNode')[0], l = gn && kid(gn, 'NodeLabel'), geo = gn && kid(gn, 'Geometry');
      if (!gn || !l || !geo) return;
      out[r.getAttribute('id')] = { el: r, kind: (gn.getAttribute('configuration') || '').replace('com.yworks.sbgn.', ''), text: ownText(l), font: l.getAttribute('fontSize'), size: [F(geo.getAttribute('width')), F(geo.getAttribute('height'))] };
    });
    return out;
  }
  // a state variable's icon of that text (shared, as yEd shares them): its id, the text with the icon added when new
  function svIcon(t, text, opt, small, kind) {   // small: the node's icons' own font size (a Newt map's), else 10; kind: UnitOfInformation, else a state variable
    kind = kind || 'StateVariable';
    var G = gml(t, opt), R = resources(G), id = null, max = 0, fs = small ? String(small) : '10', k = (small || 10) / 10;
    Object.keys(R).forEach(function (q) { max = Math.max(max, parseInt(q, 10) || 0); if (R[q].kind === kind && R[q].text === text && R[q].font === fs) id = id || q; });
    if (id) return [id, t, R[id].size];
    var sz = kind === 'UnitOfInformation' ? [Math.ceil(Math.max(text.length, 3) * ICON_CHAR * k + 8 * k), 16 * k] : svSize(text, k), b = labelBox(text, sz[0], sz[1], k * 10 / 14);
    id = String(max + 1);
    var res = '<y:Resource id="' + id + '">\n        <yed:NodeRealizerIcon>\n          <y:GenericNode configuration="com.yworks.sbgn.' + kind + '">\n' +
      '            <y:Geometry height="' + repr(sz[1]) + '" width="' + repr(sz[0]) + '" x="0.0" y="0.0"/>\n            <y:Fill color="#FFFFFF" transparent="false"/>\n            <y:BorderStyle color="#000000" type="line" width="1.0"/>\n' +
      '            <y:NodeLabel alignment="center" autoSizePolicy="content" fontFamily="Dialog" fontSize="' + fs + '" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" height="' + repr(b[1]) +
      '" horizontalTextPosition="center" iconTextGap="4" modelName="custom" textColor="#000000" verticalTextPosition="center" visible="true" width="' + repr(b[0]) + '" x="' + repr(b[2]) +
      '" xml:space="preserve" y="' + repr(b[3]) + '" hasText="' + (text ? 'true' : 'false') + '">' + esc(text) + LM +
      '<y:ModelParameter><y:SmartNodeLabelModelParameter labelRatioX="0.0" labelRatioY="0.0" nodeRatioX="0.0" nodeRatioY="0.0" offsetX="0.0" offsetY="0.0" upX="0.0" upY="-1.0"/></y:ModelParameter></y:NodeLabel>\n' +
      '          </y:GenericNode>\n        </yed:NodeRealizerIcon>\n      </y:Resource>';
    var rs = G.doc.getElementsByTagNameNS(YNS, 'Resources')[0], T = new Tags(t, G.doc);
    if (!G.doc.documentElement.getAttribute('xmlns:yed')) T.set(G.doc.documentElement, 'xmlns:yed', 'http://www.yworks.com/xml/yed/3');   // a map with no icons yet: lxml left the prefix out
    if (rs) {
      var s = T.at.get(rs);
      if (s[2]) T.ed.push([s[0], s[1], '<y:Resources>' + res + '</y:Resources>']);
      else { var e = T.end(rs), c = t.lastIndexOf('</', e - 1); T.ed.push([c, c, res]); }
    } else {
      var root = G.doc.documentElement, re = T.end(root), rc = t.lastIndexOf('</', re - 1);
      T.ed.push([rc, rc, '<data key="res"><y:Resources>' + res + '</y:Resources></data>\n']);
    }
    return [id, T.text(), sz];
  }
  function nodeXml(o, svs) {   // svs: [[icon id, size, rx, ry], ...], state variables then units of information
    var w = o.box[2], h = o.box[3], fs = o.font || 14, fill = o.fill ? '<y:Fill color="' + o.fill + '" transparent="false"/>' : '<y:Fill transparent="false" hasColor="false"/>';
    var border = '<y:BorderStyle color="' + (o.line || '#000000') + '" type="line" width="' + repr(o.width || (o.cls === 'compartment' ? 2 : 1)) + '"/>';
    if (o.cls === 'compartment') {   // yed.graphml's Compartment: its name centred at the top (graphml.write), the folded realizer as the template's
      var b = labelBox(o.label || '', w, h, fs / 14), named = o.label ? ' xml:space="preserve"' : '';
      var inner = function (x, y, lw, lh, f2, more) {
        return '<y:NodeLabel alignment="center" autoSizePolicy="content" borderDistance="0.0" fontFamily="Dialog" fontSize="' + f2 + '" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" height="' + repr(lh) +
          '" horizontalTextPosition="center" iconTextGap="4" modelName="internal" modelPosition="t" textColor="#000000" verticalTextPosition="bottom" visible="true" width="' + repr(lw) + '" x="' + repr(x) + '"' + named + ' y="' + repr(y) + '"' + more +
          (o.label ? '>' + esc(o.label) + '</y:NodeLabel>' : '/>');
      };
      return '<node id="' + esc(o.id) + '" yfiles.foldertype="group"><data key="ng">\n        <y:ProxyAutoBoundsNode>\n          <y:Realizers active="0">\n            <y:GroupNode>\n' +
        '              <y:Geometry height="' + repr(h) + '" width="' + repr(w) + '" x="' + repr(o.box[0]) + '" y="' + repr(o.box[1]) + '"/>\n              ' + fill + '\n              ' + border + '\n' +
        '              ' + inner((w - b[0]) / 2, 0, b[0], b[1], fs, ' hasText="' + (o.label ? 'true' : 'false') + '"') + '\n' +
        '              <y:Shape type="roundrectangle"/>\n              <y:State autoResize="false" closed="false" closedHeight="80.0" closedWidth="80.0" innerGraphDisplayEnabled="false"/>\n' +
        '              <y:Insets bottom="15" bottomF="15.0" left="15" leftF="15.0" right="15" rightF="15.0" top="15" topF="15.0"/>\n' +
        '              <y:BorderInsets bottom="0" bottomF="0.0" left="0" leftF="0.0" right="0" rightF="0.0" top="0" topF="0.0"/>\n            </y:GroupNode>\n            <y:GroupNode>\n' +
        '              <y:Geometry height="740.0" width="1280.0" x="75.0" y="515.0"/>\n              <y:Fill color="#FFFFFF" transparent="false"/>\n              <y:BorderStyle color="#000000" type="line" width="1.0"/>\n' +
        '              ' + inner(615.13623046875, 0, 49.7275390625, 15.77734375, fs, '') + '\n' +
        '              <y:Shape type="roundrectangle"/>\n              <y:State closed="true" closedHeight="740.0" closedWidth="1280.0" innerGraphDisplayEnabled="false"/>\n' +
        '              <y:Insets bottom="15" bottomF="15.0" left="15" leftF="15.0" right="15" rightF="15.0" top="15" topF="15.0"/>\n' +
        '              <y:BorderInsets bottom="0" bottomF="0.0" left="0" leftF="0.0" right="0" rightF="0.0" top="0" topF="0.0"/>\n            </y:GroupNode>\n          </y:Realizers>\n        </y:ProxyAutoBoundsNode>\n      </data>\n' +
        '      <graph edgedefault="directed" id="' + esc(o.id) + ':"/></node>';
    }
    var label;
    if (o.cls === 'complex') {   // yed.graphml's Complex: an internal label in the middle
      var c = labelBox(o.label || '', w, h, fs / 14);
      label = '<y:NodeLabel alignment="center" autoSizePolicy="content" fontFamily="Dialog" fontSize="' + fs + '" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" height="' + repr(c[1]) +
        '" horizontalTextPosition="center" iconTextGap="4" modelName="internal" modelPosition="c" textColor="#000000" verticalTextPosition="bottom" visible="true" width="' + repr(c[0]) + '" x="' + repr(c[2]) +
        '" xml:space="preserve" y="' + repr(c[3]) + '" hasText="' + (o.label ? 'true' : 'false') + '"' + (o.label ? '>' + esc(o.label) + '</y:NodeLabel>' : '/>');
    } else if (PROC.test(o.cls)) {   // yed.graphml's Process: its sign, if any, the font the template's 14, its box at the map's
      var pt = SIGN[o.cls] || '', pb = labelBox(pt, w, h, fs / 14);
      label = '<y:NodeLabel alignment="center" autoSizePolicy="content" bottomInset="0" fontFamily="Dialog" fontSize="14" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" hasText="' + (pt ? 'true' : 'false') + '" height="' + repr(pb[1]) +
        '" horizontalTextPosition="center" iconTextGap="4" leftInset="0" modelName="custom" rightInset="0" textColor="#000000" topInset="0" verticalTextPosition="center" visible="true" width="' + repr(pb[0]) + '" x="' + repr(pb[2]) + '" y="' + repr(pb[3]) + '">' + esc(pt) + LM +
        '<y:ModelParameter><y:SmartNodeLabelModelParameter labelRatioX="0.0" labelRatioY="0.0" nodeRatioX="0.0" nodeRatioY="0.0" offsetX="0.0" offsetY="0.0" upX="0.0" upY="-1.0"/></y:ModelParameter></y:NodeLabel>';
    } else if (GATES.test(o.cls)) {   // yed.graphml's Operator: AND, OR, NOT at the template's 12 (the map's font where it is not 14), the box at the
      // map's font; the equivalence's sign in Monospaced 18, as graphml.write draws yEd's palette's
      var gt = GATE[o.cls], eq = /^(equivalence|delay)$/.test(o.cls), gb = labelBox(gt, w, h, fs / 14);
      label = '<y:NodeLabel alignment="center" autoSizePolicy="content" bottomInset="0" fontFamily="' + (eq ? 'Monospaced' : 'Dialog') + '" fontSize="' + (eq ? 18 : fs !== 14 ? fs : 12) + '" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" height="' + repr(gb[1]) +
        '" horizontalTextPosition="center" iconTextGap="4" leftInset="0" modelName="custom" rightInset="0" textColor="#000000" topInset="0" verticalTextPosition="center" visible="true" width="' + repr(gb[0]) + '" x="' + repr(gb[2]) + '" xml:space="preserve" y="' + repr(gb[3]) + '" hasText="true">' + esc(gt) + LM +
        '<y:ModelParameter><y:SmartNodeLabelModelParameter labelRatioX="0.0" labelRatioY="0.0" nodeRatioX="0.0" nodeRatioY="0.0" offsetX="0.0" offsetY="0.0" upX="0.0" upY="-1.0"/></y:ModelParameter></y:NodeLabel>';
    } else label = mainLabel(o.label || '', w, h, fs);
    var round = o.cls === 'macromolecule' || o.cls === 'nucleic acid feature';   // the templates with yEd's radius 10
    return '<node id="' + esc(o.id) + '"><data key="ng">\n        <y:GenericNode configuration="com.yworks.sbgn.' + MAKE[o.cls] + '">\n' +
      '          <y:Geometry height="' + repr(h) + '" width="' + repr(w) + '" x="' + repr(o.box[0]) + '" y="' + repr(o.box[1]) + '"/>\n' +
      '          ' + fill + '\n          ' + border + '\n          ' + label +
      (svs || []).map(function (q) { return iconLabel(q[0], q[1], w, h, q[2], q[3]); }).join('') + '\n' +
      (round || o.multimer ? '          <y:StyleProperties>\n            ' + (round ? '<y:Property class="java.lang.Integer" name="com.yworks.sbgn.style.radius" value="10"/>\n            ' : '') +
        (o.multimer ? MCOUNT : '') + '</y:StyleProperties>\n' : '') +   // the other templates have none
      '        </y:GenericNode>\n      </data>\n    </node>';
  }
  function add(t, o, opt) {   // o.activity: an Activity Flow activity with that unit ('' none), the node its entity's (activity())
    if (o.activity != null) return activity(add(t, Object.assign({}, o, { activity: null, cls: actCls(o.activity) }), opt), o.id, o.activity, opt);
    if (!MAKE[o.cls]) throw new Error('cannot make a ' + o.cls);
    var svs = [];
    var mac = o.cls === 'macromolecule', naf = o.cls === 'nucleic acid feature';   // the house profile: state variables on macromolecules only, units of information on them and on nucleic acid features
    (mac ? o.states || [] : []).forEach(function (q) { var r = svIcon(t, q[0], opt); t = r[1]; svs.push([r[0], r[2], q[1], q[2]]); });
    (mac || naf ? o.units || [] : []).forEach(function (u, k, all) { var r = svIcon(t, u, opt, null, 'UnitOfInformation'); t = r[1]; svs.push([r[0], r[2], uRatio(k, all.length), -0.5]); });
    var G = gml(t, opt), T = new Tags(t, G.doc), xml = nodeXml(o, svs), graph;
    if (o.parent && G.node[o.parent]) graph = kids(G.node[o.parent].el, 'graph')[0];
    if (!graph) graph = kids(G.doc.documentElement, 'graph')[0];
    var s = T.at.get(graph);
    if (s[2]) { T.ed.push([s[0], s[1], T.t.slice(s[0], s[1] - 2) + '>' + xml + '</graph>']); return T.text(); }
    // a compartment first in its graph, so it lies under what is there (write() puts it first in the file too)
    var first = o.cls === 'compartment' ? kids(graph)[0] : kids(graph, 'edge')[0], at0 = first ? T.at.get(first)[0] : T.t.lastIndexOf('</', T.end(graph) - 1);
    T.ed.push([at0, at0, xml]);
    return T.text();
  }
  function labelsOf(G, id) {   // the node's main label, and its icons ([label, resource])
    var n = G.node[id], R = G.R || (G.R = resources(G)), labs = n ? kids(n.geo.parentNode, 'NodeLabel') : [];
    return { main: labs.filter(function (l) { return !l.getAttribute('iconData'); })[0] || null,
             icons: labs.filter(function (l) { return l.getAttribute('iconData'); }).map(function (l) { return [l, R[l.getAttribute('iconData')] || {}]; }) };
  }
  function label(t, id, text, opt) {
    var G = gml(t, opt), n = G.node[id], L = n && labelsOf(G, id).main;
    if (!L) return t;
    var T = new Tags(t, G.doc), s = T.at.get(L), b = labelBox(text, n.box[2], n.box[3], (F(L.getAttribute('fontSize')) || 12) / 14);
    var inner = L.getAttribute('modelName') === 'internal';   // a complex's or a compartment's: placed by its model position, x and y as they are
    [['width', b[0]], ['height', b[1]]].concat(inner ? [] : [['x', b[2]], ['y', b[3]]]).forEach(function (q) { T.set(L, q[0], repr(q[1])); });
    T.set(L, 'hasText', text ? 'true' : 'false');
    var rs = L.parentNode.parentNode;   // a group's other realizers (folded in yEd): the same name, as graphml.write writes it
    if (rs && rs.localName === 'Realizers') kids(rs).forEach(function (r) {
      var l2 = r !== L.parentNode && kid(r, 'NodeLabel');
      if (!l2) return;
      var s2 = T.at.get(l2);
      T.ed.push(s2[2] ? [s2[1] - 2, s2[1], '>' + esc(text) + '</y:NodeLabel>'] : [s2[1], T.t.lastIndexOf('</', T.end(l2) - 1), esc(text)]);
    });
    if (s[2]) { T.ed.push([s[1] - 2, s[1], '>' + esc(text) + '</y:NodeLabel>']); return T.text(); }
    var c = L.firstChild, from = s[1], to = s[1];
    while (c && (c.nodeType === 3 || c.nodeType === 4)) c = c.nextSibling;
    to = c ? T.at.get(c)[0] : T.t.lastIndexOf('</', T.end(L) - 1);
    T.ed.push([from, to, esc(text)]);
    return T.text();
  }
  function smallOf(t, id, opt, G) {   // the font size the node's icons have, where it is not the usual 10 (G: t read already)
    G = G || gml(t, opt);
    var L = G.node[id] && labelsOf(G, id), f = L && L.icons.map(function (q) { return q[1].font; }).filter(function (x) { return x && x !== '10'; })[0];
    return f ? F(f) : null;
  }
  function state(t, id, value, rx, ry, opt, kind) {   // a state variable added after the node's last one (a unit of information after its last icon)
    kind = kind || 'StateVariable';
    var G0 = gml(t, opt), n0 = G0.node[id];
    var cf = n0 ? cfgOf(n0.geo.parentNode) : '';
    if (cf !== 'Macromolecule' && !(cf === 'NucleicAcidFeature' && kind === 'UnitOfInformation')) return t;   // the house profile: state variables on macromolecules only, units of information on them and on nucleic acid features (none on a simple chemical)
    var r = svIcon(t, value, opt, smallOf(t, id, opt, G0), kind); t = r[1];
    var G = gml(t, opt), n = G.node[id], L = n && labelsOf(G, id);
    if (!L || !L.main) return t;
    var svs = L.icons.filter(function (q) { return kind === 'UnitOfInformation' || q[1].kind === 'StateVariable'; }), after = svs.length ? svs[svs.length - 1][0] : L.main;
    var T = new Tags(t, G.doc), e = T.end(after);
    T.ed.push([e, e, iconLabel(r[0], r[2], n.box[2], n.box[3], rx, ry)]);
    return T.text();
  }
  function stateValue(t, id, j, value, opt, kind) {
    kind = kind || 'StateVariable';
    var r = svIcon(t, value, opt, smallOf(t, id, opt), kind); t = r[1];
    var G = gml(t, opt), n = G.node[id], L = n && labelsOf(G, id), q = L && L.icons.filter(function (x) { return x[1].kind === kind; })[j];
    if (!q) return t;
    var T = new Tags(t, G.doc), p = q[0].getElementsByTagNameNS(YNS, 'SmartNodeLabelModelParameter')[0];
    var rx = F(p.getAttribute('nodeRatioX')), ry = F(p.getAttribute('nodeRatioY')), w = n.box[2], h = n.box[3];
    T.set(q[0], 'iconData', r[0]); T.set(q[0], 'width', repr(r[2][0])); T.set(q[0], 'height', repr(r[2][1]));
    T.set(q[0], 'x', repr((0.5 + rx) * w - r[2][0] / 2)); T.set(q[0], 'y', repr((0.5 + ry) * h - r[2][1] / 2));
    return T.text();
  }
  // the map's render styles: [{ el, fill (as yEd writes it), font, ids }]
  // an attribute by its local name (libsbgn's Java writer gives the render ones a prefix: ns1:idList, ns1:fill, as
  // sbgnml.read takes them), and the name it has in the file
  function anode(el, k) { if (!el) return null; for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if ((a.localName || a.name) === k) return a; } return null; }
  function av(el, k) { var a = anode(el, k); return a ? a.value : null; }
  function styles(S) {
    var defs = {};
    Array.prototype.forEach.call(S.doc.getElementsByTagName('*'), function (e) { if (e.localName === 'colorDefinition') defs[av(e, 'id')] = av(e, 'value'); });
    var colour = function (c) { var v = defs[c] || c; if (!v || v.charAt(0) !== '#') return null; v = v.toUpperCase(); return v.length === 9 && /FF$/.test(v) ? v.slice(0, 7) : v; };
    var out = Array.prototype.filter.call(S.doc.getElementsByTagName('*'), function (e) { return e.localName === 'style'; }).map(function (st) {
      var g = kids(st, 'g')[0], a = function (k) { return av(g, k) || null; }, il = anode(st, 'idList');
      return { el: st, g: g, fill: colour(a('fill')), line: colour(a('stroke')), width: a('stroke-width') ? F(a('stroke-width')) : null, font: a('font-size') ? F(a('font-size')) : null,
               has: { fill: !!a('fill'), line: !!a('stroke'), width: !!a('stroke-width'), font: !!a('font-size') },
               ids: ((il && il.value) || '').split(/\s+/).filter(Boolean), plain: !!il, idName: il ? il.name : 'idList' };
    });
    out.defs = defs;
    return out;
  }
  function defaults(t, opt, cls) {
    cls = cls || 'macromolecule';
    var S = sbgn(t, opt), hs = [], best = null, n = 0, same = {};
    Object.keys(S.glyph).forEach(function (id) {   // a protein's activity is a protein to the converter (sbgnml.ACTIVITY)
      var c = S.glyph[id].el.getAttribute('class');
      if (c === 'macromolecule' || (c === 'biological activity' && actCls(fileUnit(S.glyph[id].el)) === 'macromolecule')) hs.push(S.glyph[id].box[3]);
      if (c === cls) same[id] = 1;
    });
    hs.sort(function (a, b) { return a - b; });
    var m = hs.length ? (hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2) : 40, s = m / 40;   // the map's scale from its proteins, as style.scale_of
    if (!(s > 1.2 || s < 1 / 1.2)) s = 1;
    styles(S).forEach(function (st) { var k = st.ids.filter(function (i) { return same[i]; }).length; if (st.fill && st.plain && k > n) { n = k; best = st; } });
    var sz = SIZE[cls] || SIZE.macromolecule;
    return { w: sz[0] * s, h: sz[1] * s, font: best && best.font || Math.round(14 * s + 0.01), fill: best ? best.fill : null,
             line: best && best.line !== '#000000' ? best.line : null, width: cls === 'compartment' ? 2 : best && best.width || 1 };   // a new compartment's border 2 whatever the map's (user, 2026-11-14: "line thickness 2 pixels")
  }
  // ---------- the look of a glyph (user, 2026-11-14: Properties as yEd's, with Newt's fields): its fill, border colour and
  // width (size: resize(); multimer: multimer()). In the GraphML as graphml.write writes them; in the SBGN-ML file in the
  // render extension, read as sbgnml.read reads it (each attribute from the last style naming the glyph that gives it; a
  // black border and a width of 1 are the defaults)
  var LOOKED = /^(macromolecule|simple chemical)( multimer)?$/;   // the glyphs the editor restyles
  function lookG(G, id) { return lookOf(G.node[id].geo.parentNode); }
  function lookOf(r) {   // a node's realizer: its fill, border colour (null: black) and width, drawn as a multimer
    var fl = kid(r, 'Fill'), bs = kid(r, 'BorderStyle'), line = ((bs && bs.getAttribute('color')) || '#000000').toUpperCase();
    return { fill: fl && fl.getAttribute('hasColor') !== 'false' && fl.getAttribute('color') ? fl.getAttribute('color').toUpperCase() : null,
             line: line === '#000000' ? null : line, width: bs && bs.getAttribute('width') ? F(bs.getAttribute('width')) : 1,
             multimer: kids(kid(r, 'StyleProperties') || r, 'Property').some(function (q) { return q.getAttribute('name') === 'com.yworks.sbgn.style.mcount' && q.getAttribute('value') !== '1'; }) };
  }
  function fileLook(St, id) {
    var o = { fill: null, line: null, width: 1, font: null };
    St.forEach(function (st) {
      if (!st.plain || st.ids.indexOf(id) < 0) return;
      if (st.has.fill) o.fill = st.fill;
      if (st.has.line) o.line = st.line;
      if (st.has.width) o.width = st.width || 1;
      if (st.has.font) o.font = st.font;
    });
    if (o.line === '#000000') o.line = null;
    return o;
  }
  // the node's look in the GraphML set to o (fill, line, width: those given)
  function setLook(T, G, id, o) {
    var n = G.node[id], r = n.geo.parentNode, fl = kid(r, 'Fill'), bs = kid(r, 'BorderStyle'), now = lookG(G, id);
    if ('fill' in o && o.fill !== now.fill && fl) {   // as graphml.write writes it: color first, or hasColor last
      var fs0 = T.at.get(fl), tr = fl.getAttribute('transparent') || 'false';
      T.ed.push([fs0[0], fs0[1], o.fill ? '<y:Fill color="' + o.fill + '" transparent="' + tr + '"/>' : '<y:Fill transparent="' + tr + '" hasColor="false"/>']);
    }
    if ('line' in o && o.line !== now.line && bs) T.set(bs, 'color', o.line || '#000000');
    if ('width' in o && o.width !== now.width && bs) T.set(bs, 'width', repr(o.width));
  }
  //   lookOf(realizer) -> { fill, line, width, multimer } of a node of the editor's GraphML (its parsed realizer)
  //   restyle(g, id, o) -> g with the node's look set to o (any of fill, line, width)
  function restyle(t, id, o, opt) {
    var G = gml(t, opt);
    if (!G.node[id]) return t;
    var T = new Tags(t, G.doc);
    setLook(T, G, id, o);
    return T.text();
  }
  // the looks wanted put into the file's render styles: each glyph out of the styles naming it, into a plain style of its
  // fill, border and font (for a glyph made in the editor, a style with no font as well: the map's own), the one most of
  // the map's glyphs of its class use; else a style made for it, with the attributes of its old style it does not set
  // (font family, text colour), its colours in the map's colour definitions; a style left naming nothing taken out. Returns
  // the render extension's text when it is new and the map an empty <map/> (write() puts it in with the glyphs made)
  function restyle0(S, T, St, looks, pre) {
    if (!looks.size) return;
    var lists = new Map(), made = {}, order = [], used = {};
    var cnt = function (x, cls) { return x.ids.filter(function (i) { return S.glyph[i] && S.glyph[i].el.getAttribute('class') === cls; }).length; };
    var all = S.doc.getElementsByTagName('*'), first = function (name) { for (var i = 0; i < all.length; i++) if (all[i].localName === name) return all[i]; return null; };
    Array.prototype.forEach.call(all, function (e) { if (av(e, 'id')) used[av(e, 'id')] = 1; });
    var fresh = function (base) { var k = 1; while (used[base + k]) k++; used[base + k] = 1; return base + k; };
    looks.forEach(function (o, id) {
      var old = [];   // every style naming it, in order (a later one's attributes win, as sbgnml.read takes them)
      St.forEach(function (st) { if (st.plain && st.ids.indexOf(id) >= 0) { old.push(st); lists.set(st, (lists.get(st) || st.ids.slice()).filter(function (x) { return x !== id; })); } });
      var cand = St.filter(function (x) { return x.plain && x.fill === o.fill && (x.line === '#000000' ? null : x.line) === o.line && (x.width || 1) === o.width && (x.font === o.font || (o.fresh && x.font == null)); });
      cand.sort(function (a, b) { return (b.font === o.font) - (a.font === o.font) || cnt(b, o.cls) - cnt(a, o.cls); });
      if (cand[0]) { lists.set(cand[0], (lists.get(cand[0]) || cand[0].ids.slice()).concat(id)); return; }
      var key = [o.fill, o.line, o.width, o.font, o.fresh ? '' : old.map(function (x) { return St.indexOf(x); }).join(',')].join('\u0000');
      if (!made[key]) { made[key] = { o: o, old: o.fresh ? [] : old, ids: [] }; order.push(made[key]); }
      made[key].ids.push(id);
    });
    lists.forEach(function (ids, st) { if (ids.length) T.set(st.el, st.idName, ids.join(' ')); else T.cut(st.el); });   // a style left naming nothing taken out
    if (!order.length) return;
    var lsEl = first('listOfStyles'), lcEl = first('listOfColorDefinitions'), defs = St.defs, mapEl = kids(S.doc.documentElement, 'map')[0];
    var rp = lsEl && lsEl.prefix ? lsEl.prefix + ':' : '', ap = St.some(function (x) { return x.idName.indexOf(':') > 0; }) ? rp : '', bi = lsEl ? T.indent(lsEl) : T.indent(mapEl) + '      ', colours = '', styles = '';
    var cid = function (v) {   // a colour's id in the map's definitions, one added when it has none
      if (!lcEl && lsEl) return v;   // a map whose styles give their colours as values
      for (var k in defs) if (defs[k] && defs[k].toUpperCase().replace(/^(#[0-9A-F]{6})FF$/, '$1') === v) return k;
      var i = fresh('color_e'); defs[i] = v;
      colours += '\n' + bi + '  <' + rp + 'colorDefinition ' + ap + 'id="' + i + '" ' + ap + 'value="' + v.toLowerCase() + '"/>';
      return i;
    };
    order.forEach(function (m) {
      var o = m.o, at = {};
      m.old.forEach(function (st) { if (st.g) Array.prototype.forEach.call(st.g.attributes, function (a) { if (!/^(fill|stroke|stroke-width|font-size)$/.test(a.localName || a.name) && !/^xmlns/.test(a.name)) at[a.name] = a.value; }); });
      at[ap + 'stroke'] = cid(o.line || '#000000');
      if (o.fill) at[ap + 'fill'] = cid(o.fill);
      at[ap + 'stroke-width'] = num(o.width);
      if (o.font) at[ap + 'font-size'] = num(o.font);
      styles += '\n' + bi + '  <' + rp + 'style ' + ap + 'id="' + fresh('style_e') + '" ' + ap + 'idList="' + m.ids.map(esc).join(' ') + '">\n' + bi + '    <' + rp + 'g' +
        Object.keys(at).map(function (k) { return ' ' + k + '="' + esc(at[k]) + '"'; }).join('') + '/>\n' + bi + '  </' + rp + 'style>';
    });
    var into = function (el, xml) {   // xml put at the end of el
      var s = T.at.get(el);
      if (s[2]) { T.ed.push([s[0], s[1], T.t.slice(s[0], s[1] - 2).replace(/\s+$/, '') + '>' + xml + '\n' + T.indent(el) + '</' + T.t.slice(s[0] + 1).match(/^[^\s/>]+/)[0] + '>']); return; }
      var e = T.t.lastIndexOf('</', T.end(el) - 1), ls = T.t.lastIndexOf('\n', e - 1);
      T.ed.push(/^\s*$/.test(T.t.slice(ls + 1, e)) ? [ls, ls, xml] : [e, e, xml + '\n' + T.indent(el)]);
    };
    if (lsEl) { if (colours) into(lcEl, colours); into(lsEl, styles); return; }
    var i0 = T.indent(mapEl) + '  ', R = 'http://www.sbml.org/sbml/level3/version1/render/version1';
    if (lcEl) {   // colour definitions but no styles yet: a list of styles beside them
      var lp = lcEl.prefix ? lcEl.prefix + ':' : '';
      if (colours) into(lcEl, colours);
      into(lcEl.parentNode, '\n' + T.indent(lcEl) + '<' + lp + 'listOfStyles>' + styles + '\n' + T.indent(lcEl) + '</' + lp + 'listOfStyles>');
      return;
    }
    // a map with no render extension yet: one written, as the converter writes it
    var info = '\n' + i0 + '  <renderInformation xmlns="' + R + '" id="renderInformation">\n' + i0 + '    <listOfColorDefinitions>' + colours + '\n' + i0 + '    </listOfColorDefinitions>\n' +
      i0 + '    <listOfStyles>' + styles + '\n' + i0 + '    </listOfStyles>\n' + i0 + '  </renderInformation>';
    var ext = kids(mapEl, 'extension')[0];
    if (ext) { into(ext, info); return; }
    var block = '\n' + i0 + '<' + pre + 'extension>' + info + '\n' + i0 + '</' + pre + 'extension>';
    if (T.at.get(mapEl)[2]) return block;   // an empty <map/>: write() puts it in with the glyphs made
    var notes = kids(mapEl, 'notes')[0], at0 = notes ? T.end(notes) : T.at.get(mapEl)[1];
    T.ed.push([at0, at0, block]);
  }
  function drop(t, ids, opt, lost) {   // the file with the glyphs (state variables too) deleted in the editor taken out, and every arc at them; lost: the glyphs that lose a unit of information
    var S = sbgn(t, opt), del = {}, T = null, arcs = ids.filter(function (id) { return !!S.arc[id]; });   // arcs: deleted on their own
    ids.forEach(function (id) {
      var g = S.glyph[id];
      if (!g) return;
      del[id] = 1;
      if (lost && g.el.getAttribute('class') === 'unit of information' && g.el.parentNode.getAttribute) lost[g.el.parentNode.getAttribute('id')] = 1;
      Array.prototype.forEach.call(g.el.getElementsByTagName('*'), function (c) { if (c.getAttribute('id')) del[c.getAttribute('id')] = 1; });
    });
    if (!Object.keys(del).length && !arcs.length) return t;
    T = new Tags(t, S.doc);
    ids.forEach(function (id) { if (S.glyph[id]) T.cut(S.glyph[id].el); });
    Object.keys(S.arc).forEach(function (id) { var a = S.arc[id]; if (del[a.getAttribute('source')] || del[a.getAttribute('target')] || arcs.indexOf(id) >= 0) T.cut(a); });
    return T.text();
  }
  function svLabel(G, id, j, kind) { var L = G.node[id] && labelsOf(G, id); return L ? (L.icons.filter(function (x) { return x[1].kind === (kind || 'StateVariable'); })[j] || [])[0] : null; }
  function stateMove(t, id, j, rx, ry, opt) {   // the j-th state variable moved to rx, ry on its node's border (the editor's GraphML)
    var G = gml(t, opt), l = svLabel(G, id, j);
    if (!l) return t;
    var T = new Tags(t, G.doc), p = l.getElementsByTagNameNS(YNS, 'SmartNodeLabelModelParameter')[0], b = G.node[id].box;
    T.set(p, 'nodeRatioX', repr(rx)); T.set(p, 'nodeRatioY', repr(ry));
    T.set(l, 'x', repr((0.5 + rx) * b[2] - F(l.getAttribute('width')) / 2)); T.set(l, 'y', repr((0.5 + ry) * b[3] - F(l.getAttribute('height')) / 2));
    return T.text();
  }
  // the j-th state variable deleted; opt.sbgn, the SBGN-ML file the GraphML is written into: one of the file's own is
  // named in the deleted-ids comment by its id, so write() takes out that element and no other (the GraphML holds the
  // file's remaining state variables first, in the file's order, then those made in the editor)
  function stateDelete(t, id, j, opt, kind) {   // kind UnitOfInformation: the j-th unit of information, the others spread again
    var unit = kind === 'UnitOfInformation', G = gml(t, opt), l = svLabel(G, id, j, kind);
    if (!l) return t;
    var T = new Tags(t, G.doc); T.cut(l); t = T.text();
    if (unit) t = respace(t, id, opt);
    var g = opt && opt.sbgn && sbgn(opt.sbgn, opt).glyph[id], del = gone(t);
    var left = g ? (unit ? unitsOf(g.el) : kids(g.el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'state variable'; })).filter(function (c) { return del.indexOf(c.getAttribute('id')) < 0; }) : [];
    return j < left.length && left[j].getAttribute('id') ? goneMark(t, [left[j].getAttribute('id')]) : t;
  }
  // units of information (user, 2026-11-14: free text, "people know what they're doing"): spread evenly along the top as
  // graphml.write places them, (k + 1) / (n + 1) of the width, again whenever one is added or deleted
  function uRatio(k, n) { return (k + 1) / (n + 1) - 0.5; }
  function respace(t, id, opt) {
    var G = gml(t, opt), n = G.node[id], L = n && labelsOf(G, id);
    if (!L) return t;
    var us = L.icons.filter(function (q) { return q[1].kind === 'UnitOfInformation'; }), T = new Tags(t, G.doc), b = n.box;
    us.forEach(function (q, k) {
      var l = q[0], p = l.getElementsByTagNameNS(YNS, 'SmartNodeLabelModelParameter')[0], rx = uRatio(k, us.length), set = function (el, a, v) { if (el.getAttribute(a) !== v) T.set(el, a, v); };
      set(p, 'nodeRatioX', repr(rx)); set(p, 'nodeRatioY', repr(-0.5));
      set(l, 'x', repr((0.5 + rx) * b[2] - F(l.getAttribute('width')) / 2)); set(l, 'y', repr(-F(l.getAttribute('height')) / 2));
    });
    return T.text();
  }
  function unit(t, id, value, opt) { return respace(state(t, id, value, 0, -0.5, opt, 'UnitOfInformation'), id, opt); }
  function unitValue(t, id, j, value, opt) { return stateValue(t, id, j, value, opt, 'UnitOfInformation'); }
  function unitDelete(t, id, j, opt) { return stateDelete(t, id, j, opt, 'UnitOfInformation'); }
  // a multimer (user, 2026-11-14: "make multimer ... make macromolecule"): yEd's two shapes, mcount 2 (graphml.write); the
  // count, if any, is a unit of information the reader types (N:3)
  var MCOUNT = '<y:Property class="java.lang.Integer" name="com.yworks.sbgn.style.mcount" value="2"/>', MULTI = /^(macromolecule|simple chemical|nucleic acid feature)$/;
  function mcountOf(G, id) {
    var r = G.node[id] && G.node[id].geo.parentNode, sp = r && kid(r, 'StyleProperties');
    return sp ? kids(sp, 'Property').filter(function (p) { return p.getAttribute('name') === 'com.yworks.sbgn.style.mcount'; })[0] || null : null;
  }
  function isMulti(G, id) { var p = mcountOf(G, id); return !!p && p.getAttribute('value') !== '1'; }
  function multimer(t, id, on, opt) {
    var G = gml(t, opt), n = G.node[id];
    if (!n || isMulti(G, id) === !!on) return t;
    var T = new Tags(t, G.doc), p = mcountOf(G, id), r = n.geo.parentNode, sp = kid(r, 'StyleProperties');
    if (!on) { T.cut(p); return T.text(); }
    if (p) { T.set(p, 'value', '2'); return T.text(); }
    if (sp) { var s = T.at.get(sp); if (s[2]) T.ed.push([s[0], s[1], '<y:StyleProperties>' + MCOUNT + '</y:StyleProperties>']); else { var c = T.t.lastIndexOf('</', T.end(sp) - 1); T.ed.push([c, c, MCOUNT]); } }
    else { var c2 = T.t.lastIndexOf('</', T.end(r) - 1); T.ed.push([c2, c2, '<y:StyleProperties>' + MCOUNT + '</y:StyleProperties>']); }
    return T.text();
  }
  // the file's side, read as sbgnml.read reads it: a glyph's units of information (an empty one only off a biological
  // activity), their text, and whether the converter draws the glyph as a multimer (a count from N:x, else 2)
  function unitsOf(el) {
    var act = el.getAttribute('class') === 'biological activity';
    return kids(el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'unit of information' && (unitText(c) || !act); });
  }
  function unitText(c) { var l = kid(c, 'label'); return l ? l.getAttribute('text') || '' : ''; }
  function fileMulti(el) { return drawnMulti(el.getAttribute('class') || '', unitsOf(el).map(unitText)); }
  function drawnMulti(cls, units) {   // sbgnml.read's count: the first N:x, else 2 for a multimer; above 1 drawn as a multimer
    if (!/ multimer$/.test(cls)) return false;
    var n = units.filter(function (u) { return /^N:\d+$/.test(u); })[0];
    return (n ? parseInt(n.slice(2), 10) : 2) > 1;
  }
  function uBox(txt, b, k, n) { var uw = Math.max(3, txt.length) * 7; return [b[0] + (k + 1) / (n + 1) * b[2] - uw / 2, b[1] - 7.5, uw, 15]; }   // layout.decorations
  // a node's box set (user, 2026-11-14: a macromolecule or a simple chemical resized by its handles or its size typed):
  // the box written, its name kept centred, its state variables at their places on the border (yEd's ratios), and the
  // ends of its lines that are off its centre moved with the box in proportion, so a port on the border stays on it;
  // write() then scales what the SBGN-ML file's glyph carries the same way
  function resize(t, id, box, opt) {
    var G = gml(t, opt), n = G.node[id];
    if (!n) return t;
    var o = n.box, w = box[2], h = box[3], T = new Tags(t, G.doc);
    ['x', 'y', 'width', 'height'].forEach(function (k, j) { if (Math.abs(o[j] - box[j]) > 1e-9) T.set(n.geo, k, repr(box[j])); });
    var L = labelsOf(G, id);
    if (L.main) { T.set(L.main, 'x', repr((w - F(L.main.getAttribute('width'))) / 2)); T.set(L.main, 'y', repr((h - F(L.main.getAttribute('height'))) / 2)); }
    L.icons.forEach(function (q) {
      var l = q[0], p = l.getElementsByTagNameNS(YNS, 'SmartNodeLabelModelParameter')[0];
      if (!p) return;
      T.set(l, 'x', repr((0.5 + F(p.getAttribute('nodeRatioX'))) * w - F(l.getAttribute('width')) / 2));
      T.set(l, 'y', repr((0.5 + F(p.getAttribute('nodeRatioY'))) * h - F(l.getAttribute('height')) / 2));
    });
    // an end that comes to lie within 1.5 of the line from the centre toward the line's next point is read by the
    // converter as aimed at the centre (sbgnml.at): set so here too, so the editor draws what the file will hold
    var kx = o[2] ? w / o[2] : 1, ky = o[3] ? h / o[3] : 1, c = centre(box);
    var endAt = function (gid, ox, oy) { var b = gid === id ? box : G.node[gid] && G.node[gid].box; return b ? [b[0] + b[2] / 2 + ox, b[1] + b[3] / 2 + oy] : null; };
    Object.keys(G.edge).forEach(function (k) {
      var e = G.edge[k];
      [[e.s, 'sx', 'sy', 0], [e.t, 'tx', 'ty', 2]].forEach(function (q) {
        if (q[0] !== id || (!e.off[q[3]] && !e.off[q[3] + 1])) return;
        var v = [e.off[q[3]] * kx, e.off[q[3] + 1] * ky], j = 2 - q[3];
        var aim = e.pts.length ? e.pts[q[3] ? e.pts.length - 1 : 0] : endAt(q[3] ? e.s : e.t, e.off[j], e.off[j + 1]);
        if (aim) {
          var u = [aim[0] - c[0], aim[1] - c[1]], n = Math.hypot(u[0], u[1]);
          if (n && Math.abs(u[0] * v[1] - u[1] * v[0]) / n <= 1.5 && u[0] * v[0] + u[1] * v[1] >= 0) v = [0, 0];
        }
        var r4 = function (x) { return Math.round(x * 10000) / 10000; };   // as write() puts the point in the file: the offset the converter reads back
        if (v[0] || v[1]) v = [r4(c[0] + v[0]) - c[0], r4(c[1] + v[1]) - c[1]];
        T.set(e.path, q[1], repr(v[0])); T.set(e.path, q[2], repr(v[1]));
      });
    });
    return T.text();
  }
  function remove(t, ids, opt) {   // nodes deleted in the editor's GraphML, with every line at them; their ids kept for write()
    var G = gml(t, opt), T = new Tags(t, G.doc), del = {};
    ids.forEach(function (id) { if (G.node[id]) { del[id] = 1; T.cut(G.node[id].el); } });
    Object.keys(G.edge).forEach(function (k) { var e = G.edge[k]; if (del[e.s] || del[e.t]) T.cut(e.el); });
    return goneMark(T.text(), Object.keys(del));
  }
  // a process made another kind (user, 2026-11-14: the right-click menu's Make process, Make omitted process, Make
  // uncertain process): its sign written as its label, as graphml.write writes it
  function kind(t, id, cls, opt) {   // the sign at the template's 14 (graphml.write sets no font on a sign), its box at the map's font
    if (/^(and|or|not)$/.test(cls)) {   // a gate made another (user, 2026-11-15): AND, OR, NOT; the equivalence keeps its own rules (entities only)
      var Gg = gml(t, opt), ng = Gg.node[id], ins = Object.keys(Gg.edge).filter(function (k) { return Gg.edge[k].t === id; }).length;
      return ng && /^(and|or|not)$/.test(classOfR(ng.geo.parentNode) || '') && !(cls === 'not' && ins > 1) ? label(t, id, GATE[cls], opt) : t;   // a NOT has one input (the review)
    }
    if (!PROC.test(cls)) return t;
    var G0 = gml(t, opt), n0 = G0.node[id];   // never an association or dissociation (the node property SBGN class): not one of ours to change
    if (!n0 || kids(n0.el, 'data').some(function (d) { return /^(association|dissociation)$/.test(ownText(d).trim()); })) return t;
    t = label(t, id, SIGN[cls] || '', opt);
    var G = gml(t, opt), L = G.node[id] && labelsOf(G, id).main;
    if (!L || !SIGN[cls] || L.getAttribute('fontSize') === '14') return t;
    var T = new Tags(t, G.doc); T.set(L, 'fontSize', '14'); return T.text();
  }
  // ---------- arcs (user, 2026-11-15: "Now add connectors"; notes/process-glyph.md step 2) ----------
  // An arc made in the editor is an edge of its GraphML as graphml.write writes one from yed.graphml's template: its
  // arrowhead the class (graphml.ARROW), its end at an entity on the centre (0, 0), its end at a process on the port, so
  // yrender draws the antennas from it. write() puts the arc into the SBGN-ML file, its process end named the port (a
  // bare process gets its two ports and its orientation then), and graphml() makes the edge again from the file.
  // graphml.py's ARROW (its master), by SBGN class
  var ARROW = { consumption: 'none', production: 'delta', catalysis: 'white_circle', inhibition: 't_shape', modulation: 'white_diamond',
                stimulation: 'white_delta', 'necessary stimulation': 'white_delta_bar', 'logic arc': 'none' };
  // Activity Flow's influences, drawn with the arrowheads of the modulations they read as (sbgnml.HEAD); after them, so
  // an arrowhead reads back as the PD class (headClass), named again by AF_ARC where the map is Activity Flow
  var AF_ARC = { stimulation: 'positive influence', inhibition: 'negative influence', modulation: 'unknown influence' }, PD_ARC = {};
  Object.keys(AF_ARC).forEach(function (k) { PD_ARC[AF_ARC[k]] = k; ARROW[AF_ARC[k]] = ARROW[k]; });
  function edgeXml(id, s, t, off, head, pts, ind) {   // graphml.write's edge (pretty printed as lxml writes it)
    var i1 = ind + '  ', i2 = i1 + '  ', i3 = i2 + '  ';
    return '<edge id="' + esc(id) + '" source="' + esc(s) + '" target="' + esc(t) + '">\n' + i1 + '<data key="eg">\n' + i2 + '<y:PolyLineEdge>\n' + i3 +
      '<y:Path sx="' + repr(off[0]) + '" sy="' + repr(off[1]) + '" tx="' + repr(off[2]) + '" ty="' + repr(off[3]) + '"' +
      (pts.length ? '>' + pts.map(function (p) { return '<y:Point x="' + repr(p[0]) + '" y="' + repr(p[1]) + '"/>'; }).join('') + '</y:Path>' : '/>') + '\n' + i3 +
      '<y:LineStyle color="#000000" type="line" width="1.0"/>\n' + i3 + '<y:Arrows source="none" target="' + head + '"/>\n' + i3 + '<y:BendStyle smoothed="false"/>\n' + i2 +
      '</y:PolyLineEdge>\n' + i1 + '</data>\n' + ind + '</edge>';
  }
  function edgesIn(t, G, list) {   // the edges ([id, s, t, off, head, pts]) put after the last edge of the map's graph
    var T = new Tags(t, G.doc), graph = kids(G.doc.documentElement, 'graph')[0], es = kids(graph, 'edge'), last = es[es.length - 1];
    var ind = last ? T.indent(last) : T.indent(graph) + '  ', xml = list.map(function (q) { return edgeXml(q[0], q[1], q[2], q[3], q[4], q[5], ind); });
    var s = T.at.get(graph);
    if (s[2]) T.ed.push([s[0], s[1], T.t.slice(s[0], s[1] - 2) + '>\n' + ind + xml.join('\n' + ind) + '\n' + T.indent(graph) + '</graph>']);
    else if (last) { var e = T.end(last); T.ed.push([e, e, '\n' + ind + xml.join('\n' + ind)]); }
    else { var c = T.t.lastIndexOf('</', T.end(graph) - 1); T.ed.push([c, c, xml.join('\n' + ind) + '\n' + T.indent(graph)]); }
    return T.text();
  }
  function headOf(e) { var a = e.el.getElementsByTagNameNS(YNS, 'Arrows')[0]; return a ? a.getAttribute('target') || 'none' : 'none'; }
  // the two ports of a process, from its centre: where its arcs have them (a consumption's end the port in, a production's
  // start the port out; a missing one mirrored), else on the axis toward `toward` (the first arc's other end), as yrender
  // puts antennas (the nearer of horizontal or vertical, side / 2 + max(side / 2, 9) out); [in, out]
  function hubPorts(G, pid, toward, asIn, S) {   // S: the SBGN-ML file read, for its ports
    var n = G.node[pid], b = n.box, c = centre(b), pin = null, pout = null, nz = function (x, y) { return Math.abs(x) > 1e-9 || Math.abs(y) > 1e-9; };
    Object.keys(G.edge).forEach(function (k) {
      var e = G.edge[k], h = headOf(e);
      if (e.t === pid && h === 'none' && nz(e.off[2], e.off[3]) && !pin) pin = [e.off[2], e.off[3]];
    });
    Object.keys(G.edge).forEach(function (k) {   // a production from the port in (a reversible process) is not the port out
      var e = G.edge[k];
      if (e.s === pid && nz(e.off[0], e.off[1]) && !pout && !(pin && Math.abs(e.off[0] - pin[0]) < 1 && Math.abs(e.off[1] - pin[1]) < 1)) pout = [e.off[0], e.off[1]];
    });
    var f = !pin && !pout && S && S.glyph[pid], fp = f ? kids(f.el, 'port') : [];
    if (fp.length >= 2) {   // the file's own ports (its arcs at them read as the centre): the one its consumptions end at is in
      var ids = fp.map(function (q) { return q.getAttribute('id'); }), fc = centre(f.box), k0 = 0;
      Object.keys(S.arc).forEach(function (k) { var a = S.arc[k], j = ids.indexOf(a.getAttribute('target')); if (j >= 0 && flux(a) && !k0) k0 = j + 1; });
      var o = function (q) { var P = xy(q); return [P[0] - fc[0], P[1] - fc[1]]; };
      pin = o(fp[k0 ? k0 - 1 : 0]); pout = o(fp[k0 === 2 ? 0 : 1]);
    }
    if (!pin && !pout && toward) {
      var dx = toward[0] - c[0], dy = toward[1] - c[1], hz = Math.abs(dx) >= Math.abs(dy);
      // a modulation drawn to the bare process first (user, 2026-11-15) holds a side: the antennas go along the other axis
      if (heldAxis(G, pid) === hz) hz = !hz;
      var side = hz ? b[2] : b[3], r = side / 2 + Math.max(side / 2, 9);
      var p = hz ? [(dx >= 0 ? 1 : -1) * r, 0] : [0, (dy >= 0 ? 1 : -1) * r];
      if (asIn) pin = p; else pout = p;
    }
    if (!pin && pout) pin = [-pout[0], -pout[1]];
    if (!pout && pin) pout = [-pin[0], -pin[1]];
    var r4 = function (v) { return v && [Math.round((c[0] + v[0]) * 10000) / 10000 - c[0], Math.round((c[1] + v[1]) * 10000) / 10000 - c[1]]; };   // as write() puts the port in the file: the offset the converter reads back
    return [r4(pin), r4(pout)];
  }
  // the axis the modulations of process pid hold (true: they come in on the left or right), null when they hold none or
  // both: each modulation's end, or where it comes from when its end is at the centre
  function heldAxis(G, pid) {
    var c = centre(G.node[pid].box), held = Object.keys(G.edge).map(function (k) { return G.edge[k]; }).filter(function (e) { return e.t === pid && G.node[e.s] && MODS.test(headClass(headOf(e)) || ''); }).map(function (e) {
      if (Math.abs(e.off[2]) > 1e-9 || Math.abs(e.off[3]) > 1e-9) return Math.abs(e.off[2]) >= Math.abs(e.off[3]);
      var f = centre(G.node[e.s].box); return Math.abs(f[0] - c[0]) >= Math.abs(f[1] - c[1]);
    });
    return held.length && held.every(function (h) { return h === held[0]; }) ? held[0] : null;
  }
  // an arc from glyph s to glyph t, id given (user, 2026-11-15: the modulations and the logic gates added): a consumption
  // from an entity into a process, a production from a process to an entity, a logic arc into a gate (from an entity, or a
  // gate's port out) or out of an equivalence to an entity, a modulation (catalysis, stimulation, inhibition, necessary
  // stimulation, modulation) from an entity or a gate's port out to a process or a phenotype. An end at a process or gate
  // on its port (the axis guessed by the first arc, re-guessed by the second), a modulation's end at a process the middle of
  // the side off its antennas that faces where it comes from, an entity's end at its centre. opt.sbgn, the SBGN-ML text: a
  // process's own ports
  var sLast = [null, null], MODS = /^(catalysis|stimulation|inhibition|modulation|necessary stimulation)$/;
  function connect(t, id, s, tg, cls, opt) {
    var G = gml(t, opt);
    if (!G.node[s] || !G.node[tg] || !ARROW[cls]) return t;
    var off = [0, 0, 0, 0], cfg = function (x) { return G.node[x].geo.parentNode.getAttribute('configuration') || ''; };
    var hub = function (x) { return /\.(Process|Operator)$/.test(cfg(x)); };
    var S = opt && opt.sbgn ? (sLast[0] === opt.sbgn ? sLast[1] : (sLast = [opt.sbgn, sbgn(opt.sbgn, opt)])[1]) : null;   // read once for the arcs of one step (only read, never edited)
    var own = function (x) { return !!(S && S.glyph[x] && kids(S.glyph[x].el, 'port').length >= 2); };
    // the hub ends on their ports: the source's port out (a production, a gate's output), the target's port in (a
    // consumption, a gate's input)
    [[s, tg, false, cls === 'production' || cls === 'logic arc' || MODS.test(cls)], [tg, s, true, cls === 'consumption' || cls === 'logic arc']].forEach(function (q) {
      var pid = q[0], other = q[1], asIn = q[2];
      if (!q[3] || !hub(pid)) return;
      var re = !own(pid) ? reguess(t, G, pid, other, asIn) : null;   // a process or gate without the file's own ports
      if (re) { t = re; G = gml(t, opt); }
      var pp = hubPorts(G, pid, centre(G.node[other].box), asIn, S);
      if (asIn) { off[2] = pp[0][0]; off[3] = pp[0][1]; } else { off[0] = pp[1][0]; off[1] = pp[1][1]; }
    });
    if (MODS.test(cls) && /\.Process$/.test(cfg(tg))) {   // a modulation at a process: the middle of a side off the antennas
      var b = G.node[tg].box, c = centre(b), from = centre(G.node[s].box);
      from = [from[0] + off[0], from[1] + off[1]];
      var pp2 = hubPorts(G, tg, null, true, S), ax = pp2[0] ? (Math.abs(pp2[0][0]) >= Math.abs(pp2[0][1]) ? 'h' : 'v') : null;
      var dx = from[0] - c[0], dy = from[1] - c[1], vert = ax ? ax === 'h' : Math.abs(dy) > Math.abs(dx);   // on the top or bottom side
      var v = vert ? [0, (dy >= 0 ? 1 : -1) * b[3] / 2] : [(dx >= 0 ? 1 : -1) * b[2] / 2, 0];
      var u = [from[0] - c[0], from[1] - c[1]], n = Math.hypot(u[0], u[1]);
      if (n && Math.abs(u[0] * v[1] - u[1] * v[0]) / n <= 1.5 && u[0] * v[0] + u[1] * v[1] >= 0) v = [0, 0];   // on the line to the centre: read so by the converter (sbgnml.at)
      else v = [Math.round((c[0] + v[0]) * 10000) / 10000 - c[0], Math.round((c[1] + v[1]) * 10000) / 10000 - c[1]];   // as write() puts it in the file
      off[2] = v[0]; off[3] = v[1];
    }
    return edgesIn(t, G, [[id, s, tg, off, ARROW[cls], []]]);
  }
  // the second link re-guesses the axis (user, 2026-11-15: "as soon as the second link is added, this guess should be
  // changed to ... accommodate more information from first link and from the second link"; "if people do something
  // manually ... it should stick"): a process with one consumption or production whose port still lies on the side the
  // first arc's guess gives (so not turned by hand, nor a file's own placing) is set again along the pull of both ends,
  // from the mean of what goes in to the mean of what comes out, the nearer of horizontal or vertical; the first arc's
  // end moved to its new port. The text with that change, or null when nothing is re-guessed
  function reguess(t, G, pid, other, asIn) {
    var gate = /\.Operator$/.test(G.node[pid].geo.parentNode.getAttribute('configuration') || '');   // a gate's output: any arc out of it
    var flux = Object.keys(G.edge).map(function (k) { return G.edge[k]; }).filter(function (e) {
      return (e.t === pid && headOf(e) === 'none') || (e.s === pid && (gate || headOf(e) === 'delta'));
    });
    if (flux.length !== 1) return null;
    var e = flux[0], eIn = e.t === pid, o = eIn ? [e.off[2], e.off[3]] : [e.off[0], e.off[1]], b = G.node[pid].box, c = centre(b);
    if (Math.abs(o[0]) < 1e-9 && Math.abs(o[1]) < 1e-9) return null;   // at the centre: the file's own ports, kept
    var far = centre(G.node[eIn ? e.s : e.t].box), side = function (v) { return Math.abs(v[0]) >= Math.abs(v[1]) ? (v[0] >= 0 ? 'E' : 'W') : (v[1] >= 0 ? 'S' : 'N'); };
    if (side(o) !== side([far[0] - c[0], far[1] - c[1]])) return null;   // turned by hand, or placed so by the file: kept
    if (eIn === asIn) return null;   // one in and one out only: two of a kind keep the first guess (the review: two productions turned across their flow)
    var A = eIn ? far : centre(G.node[other].box), B = eIn ? centre(G.node[other].box) : far, dx = B[0] - A[0], dy = B[1] - A[1];
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
    var hz = Math.abs(dx) >= Math.abs(dy), k = (hz ? dx : dy) >= 0 ? 1 : -1, r = (hz ? b[2] : b[3]) / 2 + Math.max((hz ? b[2] : b[3]) / 2, 9);
    if (!gate && heldAxis(G, pid) === hz) return null;   // the antennas never onto a side a modulation holds (the review)
    var pout = hz ? [k * r, 0] : [0, k * r], want = eIn ? [-pout[0], -pout[1]] : pout;
    want = [Math.round((c[0] + want[0]) * 10000) / 10000 - c[0], Math.round((c[1] + want[1]) * 10000) / 10000 - c[1]];   // as hubPorts rounds
    if (Math.abs(want[0] - o[0]) < 1e-6 && Math.abs(want[1] - o[1]) < 1e-6) return null;
    var T = new Tags(t, G.doc), a = eIn ? ['tx', 'ty'] : ['sx', 'sy'];
    T.set(e.path, a[0], repr(want[0])); T.set(e.path, a[1], repr(want[1]));
    if ((Math.abs(o[0]) >= Math.abs(o[1])) !== hz) Object.keys(G.edge).forEach(function (k) {   // the axis turned a quarter: a modifier's end on a side off the antennas turned with it, as Turn process does (the review)
      var m = G.edge[k];
      if (m === e) return;
      [[m.t === pid, 2, ['tx', 'ty']], [m.s === pid, 0, ['sx', 'sy']]].forEach(function (q) {
        var x = m.off[q[1]], y = m.off[q[1] + 1];
        if (!q[0] || (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9)) return;
        T.set(m.path, q[2][0], repr(-y)); T.set(m.path, q[2][1], repr(x));
      });
    });
    return T.text();
  }
  function arcRemove(t, ids, opt) {   // arcs deleted in the editor's GraphML; their ids kept for write()
    var G = gml(t, opt), T = new Tags(t, G.doc), del = [];
    ids.forEach(function (id) { if (G.edge[id]) { del.push(id); T.cut(G.edge[id].el); } });
    return del.length ? goneMark(T.text(), del) : t;
  }
  function arcClass(G, e, S) {   // the SBGN class of an edge the editor made: its arrowhead; the bare line a consumption, a logic arc into a gate
    var h = headOf(e);
    if (h !== 'none') return headClass(h);
    var tc = S && S.glyph[e.t] ? S.glyph[e.t].el.getAttribute('class') || '' : '', sc = S && S.glyph[e.s] ? S.glyph[e.s].el.getAttribute('class') || '' : '';
    return GATES.test(tc) || sc === 'equivalence' ? 'logic arc' : 'consumption';   // into a gate, or out of an equivalence to its entity
  }
  function headClass(h) { return h === 'none' ? null : Object.keys(ARROW).filter(function (k) { return ARROW[k] === h; })[0] || null; }
  // a modulation made another (user, 2026-11-15: the right-click menu over an arc): its arrowhead in the editor's GraphML;
  // write() sets the file's class from it, graphml() the arrowhead from the file's
  function arcKind(t, id, cls, opt) {
    var G = gml(t, opt), e = G.edge[id];
    if (!e || !MODS.test(cls) || !MODS.test(headClass(headOf(e)) || '')) return t;
    var ar = e.el.getElementsByTagNameNS(YNS, 'Arrows')[0];
    if (!ar || ar.getAttribute('target') === ARROW[cls]) return t;
    var T = new Tags(t, G.doc); T.set(ar, 'target', ARROW[cls]); return T.text();
  }
  function classOf(t, id, opt) { var g = sbgn(t, opt).glyph[id]; return g ? g.el.getAttribute('class') || '' : ''; }
  function nameable(t, id, opt) { var g = sbgn(t, opt).glyph[id]; return !!g && NAMED.test(g.el.getAttribute('class') || ''); }   // a name the editor may change: one write() carries
  function svText(value, variable) { return (value || '') + (variable ? '@' + variable : ''); }
  var HUB = /process|^(and|or|not|association|dissociation|equivalence|delay)$/;

  // ---------- Activity Flow (user, 2026-11-15: an AF map "saved as clean SBGN Activity Flow" whichever view it is drawn in) ----------
  // An activity is the node of its entity, as the converter draws it (CellDesigner's way; sbgnml.ACTIVITY the master: no
  // unit a protein's, "if there is no auxiliary unit, it's a protein activity"), with the node properties "SBGN class"
  // biological activity and "SBGN unit" its unit's entity, if any, as sbgnml.read keeps them. write() writes a node so
  // marked as a biological activity whose unit of information holds only its entity, no text (user: "nothing should be
  // written in it ... The actual name goes into the large box"), and the influences under AF's names, on a map that is
  // Activity Flow: its file says so, or it was empty and an activity was drawn on it (then marked so). Elsewhere (a PD or
  // hybrid map) the node is written as its entity, as before.
  //   activity(g, id, unit) -> g with the node an activity of that unit ('' none): yEd's shape of the entity, the properties
  //   activities(g) -> { node id: unit } of the activities; afUnitBox(box, unit) -> the unit's box, drawn and written alike
  var UNIT_CLS = { '': 'macromolecule', macromolecule: 'macromolecule', 'simple chemical': 'simple chemical', 'nucleic acid feature': 'nucleic acid feature',
                   complex: 'complex', 'unspecified entity': 'unspecified entity', perturbation: 'phenotype' };   // the unit's entity -> the class drawn (sbgnml.ACTIVITY)
  function actCls(unit) { return UNIT_CLS[(unit || '').replace(/ multimer$/, '')] || 'macromolecule'; }   // an unknown entity: a protein's, as the converter reads it
  function nameIn(el) {   // a glyph's name as sbgnml.read reads it: an activity's without "activity" at its end (user, 2026-10-19: "SHC activity" is SHC)
    var lab = kid(el, 'label'), x = lab ? lab.getAttribute('text') || '' : '';
    return el.getAttribute('class') === 'biological activity' && /\sactivity\s*$/i.test(x) ? x.replace(/\s+activity\s*$/i, '') : x;
  }
  function fileUnit(el) {   // sbgnml.read: the entity of a biological activity's first unit of information, '' for none
    var u = kids(el, 'glyph').filter(function (c) { return c.getAttribute('class') === 'unit of information'; })[0], e = u && kid(u, 'entity');
    return e ? e.getAttribute('name') || '' : '';
  }
  function keyOf(G, name) {   // the id of the node property's key, or null
    if (!G.K) { G.K = {}; kids(G.doc.documentElement, 'key').forEach(function (k) { if (k.getAttribute('for') === 'node' && k.getAttribute('attr.name')) G.K[k.getAttribute('attr.name')] = k.getAttribute('id'); }); }
    return G.K[name] || null;
  }
  function propEl(G, id, name) { var k = keyOf(G, name), n = G.node[id]; return k && n ? kids(n.el, 'data').filter(function (d) { return d.getAttribute('key') === k; })[0] || null : null; }
  function actOf(G, id) {   // the unit of the activity id ('' none), or null: not an activity
    var c = propEl(G, id, 'SBGN class');
    if (!c || ownText(c).trim() !== 'biological activity') return null;
    var u = propEl(G, id, 'SBGN unit');
    return u ? ownText(u).trim() : '';
  }
  function activities(t, opt) { var G = gml(t, opt), out = {}; G.ids.forEach(function (id) { var u = actOf(G, id); if (u != null) out[id] = u; }); return out; }
  function setProps(t, id, P, opt) {   // the node's properties (name -> text, null: none), their keys declared where missing, as graphml.write writes them
    var G = gml(t, opt), n = G.node[id];
    if (!n) return t;
    var T = new Tags(t, G.doc), keys = kids(G.doc.documentElement, 'key'), taken = keys.map(function (k) { return k.getAttribute('id'); }), decl = '', ins = '';
    Object.keys(P).forEach(function (name) {
      var k = keyOf(G, name), d = propEl(G, id, name), v = P[name];
      if (d) {
        if (v == null) T.cut(d);
        else if (ownText(d).trim() !== v) { var s = T.at.get(d); T.ed.push([s[0], T.end(d), '<data key="' + esc(k) + '">' + esc(v) + '</data>']); }
        return;
      }
      if (v == null) return;
      if (!k) {
        for (var j = 0; taken.indexOf('d' + j) >= 0; j++);
        k = 'd' + j; taken.push(k);
        decl += '<key attr.name="' + esc(name) + '" attr.type="string" for="node" id="' + k + '"/>\n' + (keys.length ? T.indent(keys[0]) : '  ');
      }
      ins += '<data key="' + k + '">' + esc(v) + '</data>';
    });
    if (decl) { var at0 = keys.length ? T.at.get(keys[0])[0] : T.at.get(kids(G.doc.documentElement, 'graph')[0])[0]; T.ed.push([at0, at0, decl]); }
    if (ins) { var e0 = T.at.get(n.el)[1]; T.ed.push([e0, e0, ins]); }
    return T.text();
  }
  var RADIUS = '<y:Property class="java.lang.Integer" name="com.yworks.sbgn.style.radius" value="10"/>';
  function activity(t, id, unit, opt) {
    var G = gml(t, opt), n = G.node[id], cls = actCls(unit);
    if (!n || n.el.getAttribute('yfiles.foldertype')) return t;   // a complex with members: not an activity of AF
    var r = n.geo.parentNode;
    if (cfgOf(r) !== MAKE[cls]) {   // drawn as its entity (the CellDesigner view): yEd's shape, rounded as the templates of a protein and a nucleic acid feature
      var T = new Tags(t, G.doc), sp = kid(r, 'StyleProperties'), rad = sp && kids(sp, 'Property').filter(function (p) { return p.getAttribute('name') === 'com.yworks.sbgn.style.radius'; })[0];
      var round = cls === 'macromolecule' || cls === 'nucleic acid feature';
      T.set(r, 'configuration', 'com.yworks.sbgn.' + MAKE[cls]);
      if (rad && !round) T.cut(kids(sp, 'Property').length > 1 ? rad : sp);
      if (!rad && round) {
        if (sp) { var s = T.at.get(sp); if (s[2]) T.ed.push([s[0], s[1], '<y:StyleProperties>' + RADIUS + '</y:StyleProperties>']); else { var c = T.t.lastIndexOf('</', T.end(sp) - 1); T.ed.push([c, c, RADIUS]); } }
        else { var c2 = T.t.lastIndexOf('</', T.end(r) - 1); T.ed.push([c2, c2, '<y:StyleProperties>' + RADIUS + '</y:StyleProperties>']); }
      }
      t = T.text();
    }
    return setProps(t, id, { 'SBGN class': 'biological activity', 'SBGN unit': unit || null }, opt);
  }
  // the unit's box (user, 2026-11-15: small, at the top right, "1 to 2 to 1 for protein and 1 by 1 for metabolite"): 0.3
  // of the activity's height (12 at 80 by 40), twice as wide, a simple chemical's as wide as high, centred on the top
  // edge, its inset from the right side a tenth of the width (at least 4)
  function afUnitBox(b, unit) {
    if (!unit) return null;
    var h = b[3] * 0.3, w = actCls(unit) === 'simple chemical' ? h : 2 * h;
    return [b[0] + b[2] - w - Math.max(4, b[2] * 0.1), b[1] - h / 2, w, h];
  }
  // the map is Activity Flow: its file says so (its language, or SBGN-ML 0.3's version), or the file holds nothing but
  // compartments and the drawing an activity and no process (user: "an empty map on which AF things are drawn becomes AF")
  function isAf(t) {
    var m = (t || '').slice(0, 3000).match(/<(\w+:)?map\b[^>]*>/);
    return !!m && (/\blanguage=["']activity flow["']/.test(m[0]) || /\bversion=["'][^"']*sbgn\.af\./.test(m[0]));
  }
  function afNow(t, S, G) {
    if (isAf(t)) return true;
    if (Object.keys(S.glyph).some(function (id) { return S.glyph[id].el.getAttribute('class') !== 'compartment'; })) return false;
    return G.ids.some(function (id) { return actOf(G, id) != null; }) && !G.ids.some(function (id) { return cfgOf(G.node[id].geo.parentNode) === 'Process'; });
  }
  function afLanguage(t) {   // the map marked Activity Flow: its language, and a version naming PD
    return t.replace(/<(\w+:)?map\b[^>]*>/, function (tag) {
      tag = /\slanguage\s*=/.test(tag) ? tag.replace(/(\slanguage\s*=\s*)("[^"]*"|'[^']*')/, '$1"activity flow"') : tag.replace(/(\/?>)$/, ' language="activity flow"$1');
      return tag.replace(/(\sversion\s*=\s*["'][^"']*sbgn\.)pd\./, '$1af.');
    });
  }

  var api = { graphml: graphml, write: write, defaults: defaults, add: add, lookOf: lookOf, restyle: restyle, label: label, state: state, stateValue: stateValue, stateMove: stateMove, stateDelete: stateDelete,
              unit: unit, unitValue: unitValue, unitDelete: unitDelete, multimer: multimer, classOf: classOf, MAKE: MAKE, kind: kind, PROCESSES: ['process'].concat(Object.keys(SIGN)), SIGN: SIGN, remove: remove, resize: resize, gone: gone, nameable: nameable,
              connect: connect, arcRemove: arcRemove, arcKind: arcKind, GATE: GATE, ARROW: ARROW, MODULATIONS: ['stimulation', 'catalysis', 'inhibition', 'necessary stimulation', 'modulation'],
              activity: activity, activities: activities, afUnitBox: afUnitBox, isAf: isAf, AF_ARC: AF_ARC, UNITS: Object.keys(UNIT_CLS).filter(function (u) { return u && u !== 'perturbation'; }), unitClass: actCls };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.sbgn_edit = api;
})(typeof self !== 'undefined' ? self : this);
