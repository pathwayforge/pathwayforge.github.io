    // ---------- How to edit (editor/src/help.js) ----------
    // The one source of the editor's how-to (user, 2026-11-13: the long text in the Edit window took the room palettes and
    // new tools need): shown as a popover over the map's left edge by the "?" after the tools, or the ? key while
    // editing; never open by itself (user, 2026-11-13: the switch to edit stays clean, who needs it clicks). A tool added
    // or changed gets its line here in the same change. Each section: a title ('' for none) and lines, or [key, what] pairs.
    var HELP = [
      ['', 'This tool is designed for improving the layout of a map. Moves are saved by themselves; the site shows them about two minutes later.'],
      ['Move and zoom', ['A drag on empty space moves the map.', 'Two-finger scrolling or a pinch zooms.', 'A right click opens the same menu as outside edit mode.']],
      ['Select', ['A click selects a node, an arc or a bend point; a second click without a drag deselects it.',
        'Shift with a drag on empty space selects an area.', 'Shift with a click adds to the selection.']],
      ['Move what is selected', ['A drag moves what is selected.', 'Arrow keys move by 1, with Shift by 10.',
        'Grid size, beside the Grid and Snap switches (8 by default; its arrow offers 4, 8, 16, 32 and 64, any whole number typed), sets the grid drawn and its snapping. With Snap to grid on (the magnet), a node dragged puts its centre on the grid and a bend point goes on half of it. Alt held, no snapping.',
        'With Settings, Editing on Full, a line\'s end dragged onto another node that can take it moves the line there; the node is lit while the pointer is over it, and dropped anywhere else the end goes back. An end never goes to a member inside a complex: the complex takes it. A logic gate takes only the line without an arrowhead as its input; its modulations leave from it. On a CellDesigner map an end at a species goes to another species or complex; the end at the process glyph stays. On a CellDesigner map, right-click an added reactant\'s or product\'s line and choose Make main reactant or Make main product to swap it with the main one (in Layout too: the network stays).',
        'A line\'s end dragged, or moved by the arrow keys, goes to the node\'s centre or the middle of a side. On a CellDesigner map a modifier\'s end at a process glyph goes to one of the six places CellDesigner has there: the corners and the middles of the two sides off the main line.',
        'A process or logic gate is one object with its two ports: what it consumes ends on one, what it makes leaves from the other, and they move with it. A modifier\'s end goes to the middle of one of its two sides off the ports. A right click on it turns it a quarter clockwise (Turn process), four turns round.',
        'A right click on a line adds a bend point there; on a bend point, removes it. A right click on empty map space offers Remove all bend points, which takes every bend point of the map away at once, and the whole map\'s tools: Snap map to grid, Pack all complexes, Show grid and Snap to grid.']],
      ['Make (Settings, Editing: Full; SBGN-ML maps)', ['The palette makes a macromolecule (80 by 40), a simple chemical (a 40 by 40 circle), a nucleic acid feature, an unspecified entity, a perturbing agent (each 80 by 40), a complex (144 by 64, empty), an empty set (32 by 32), a phenotype (120 by 40), a submap (120 by 64) or a compartment (400 by 320, border 2, under what is already there), at the map\'s scale and in the style most of its kind use there. A new glyph goes into the compartment it is put in, and beside a complex, not into it. A click on a sign of the palette takes it for one use: a click on the map puts it there. A double click keeps it in hand for several, until the sign is clicked again or Esc. A sign can also be dragged onto the map.',
        'Add state variable in the right-click menu over a macromolecule puts an empty one on the next free place: the bottom\'s middle, right and left of it, the sides, the corners, then the top (kept for units of information). A state variable is selected by a click and dragged from place to place round the border (each side in eighths, the corners included). The arrow keys move it round the border by 1, with Shift by 10: along a side as the arrow points, across it clockwise inward and anticlockwise outward; a key held goes on round the corners.',
        'Add unit of information in the same menu puts an empty one on the top, the size of N:2, selected; a double click on it types its text, whatever it is (N:3, mt:prot, ct:mRNA), nothing is offered. Units sit along the top, spread evenly, and move apart again when one is added or deleted.',
        'Make multimer in the same menu draws the macromolecule as a multimer; Make macromolecule makes it single again. A count is a unit of information typed by hand (N:2).',
        'A process, an omitted process or an uncertain process is made as a bare square (18 by 18 at the map\'s scale): its antennas come with its first arc. Its right-click menu makes it one of the other two kinds; Delete removes it with its arcs.',
        'A right click on a nucleic acid feature offers Add unit of information (empty), and Add unit of information ct:mRNA or ct:gene; it takes no state variable.',
        'A simple chemical takes no state variable or unit of information. Nothing asks for a name when it is made: a double click on a glyph (the empty set has no name; a compartment by its top band), a state variable or a unit of information, or a click on one already selected, edits its text in place (P, or P@S505 with the site). Enter keeps it, Esc not.',
        'Delete, or Delete in the right-click menu, removes the state variable or unit of information, or the glyphs selected that the palette makes (a compartment only when nothing is in it), with their lines.',
        'A glyph the palette makes, selected, is resized by dragging one of its eight handles: its width and height change in multiples of Grid size, Alt or Ctrl held for any size. Its state variables and units of information keep their places on the border.',
        'Properties, under the palette, shows the macromolecule or simple chemical selected: its label, width and height (a number typed gives that size, its centre kept), fill colour, border colour and width, and whether it is a multimer. A field is applied on Enter or when it is left, Esc puts it back; a colour is typed as its hex (an empty fill is none) or chosen from the swatch. Set as default gives the next ones of that kind made from the palette this size and look.']],
      ['Connecting arcs', ['With Settings, Editing on Full, on an SBGN-ML map: a drag from an entity or a process not selected draws an arc to the node where it is let go; a click still selects. The map moves by a drag on empty space.',
        'The kind is guessed from the two ends: from an entity into a process a consumption, ending on its port in; from a process to an entity a production, leaving from its port out. From an entity to an entity, a process is made midway (on the grid with Snap to grid on) with both arcs, one step to undo.',
        'A process\'s first arc sets its axis, horizontal or vertical, whichever is nearer the side it comes from; its antennas grow then.',
        'A sign picked in Connecting arcs makes that kind only, from any node, selected or not (between two entities nothing: the process between them is made with no sign picked); a click on the sign takes it for one arc, a double click keeps it for several, until a click on it again or Esc.',
        'Nothing is made between two processes, over empty space, or where the same arc is there already; the reason is said under the tools. Esc while drawing lets it go.',
        'A new arc is selected: Delete takes it back. Delete, or Delete in the right-click menu over a line, removes the arcs selected, the map\'s own too.']],
      ['Layout tools', ['The dotted square puts the whole map on the grid by the layout rules (complexes packed, rows and columns kept), one step to undo.',
        'The complex with two proteins packs the complex selected (or the one round a member selected), every complex when nothing is selected.']],
      ['Keys', [['Ctrl or Cmd Z', 'undo'], ['Ctrl or Cmd Y', 'redo'], ['Ctrl or Cmd S', 'save at once'], ['Ctrl or Cmd A', 'select all'], ['Esc', 'clear the selection'],
        ['Delete', 'remove the bend point, state variable, unit of information, glyph or arc selected'], ['E', 'switch between edit and view mode (not while typing in a field)'], ['?', 'this help']]]
    ];
    var helpBtn = box.querySelector('#m2-ed-help'), helpBox = null;
    function helpBuild() {
      var e = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
      helpBox = document.createElement('div');
      helpBox.id = 'm2-ed-help-box'; helpBox.setAttribute('role', 'dialog'); helpBox.setAttribute('aria-label', 'How to edit'); helpBox.hidden = true;
      helpBox.innerHTML = '<button type="button" class="m2-ed-help-x" aria-label="Close">×</button>' + HELP.map(function (s) {
        var body = typeof s[1] === 'string' ? '<p>' + e(s[1]) + '</p>'
          : Array.isArray(s[1][0]) ? '<dl>' + s[1].map(function (k) { return '<dt>' + e(k[0]) + '</dt><dd>' + e(k[1]) + '</dd>'; }).join('') + '</dl>'
          : '<ul>' + s[1].map(function (l) { return '<li>' + e(l) + '</li>'; }).join('') + '</ul>';
        return (s[0] ? '<h4>' + e(s[0]) + '</h4>' : '') + body;
      }).join('');
      document.body.appendChild(helpBox);
      helpBox.querySelector('.m2-ed-help-x').addEventListener('click', function () { help(false); });
    }
    function help(show, at) {   // show: true, false, or undefined to switch; at: a section's title, scrolled to
      if (!helpBox) helpBuild();
      show = show === undefined ? helpBox.hidden : show;
      if (show) {   // over the map's left edge, level with the "?"; on a narrow page under it
        var b = helpBtn.getBoundingClientRect(), p = V.view.getBoundingClientRect();
        helpBox.hidden = false;
        var w = helpBox.offsetWidth, h = helpBox.offsetHeight, left = Math.max(p.left + 28, b.right + 8), top = b.top;   // past the separator over the map window's edge
        if (left + w > innerWidth - 16) { left = Math.max(16, Math.min(b.right - w, innerWidth - 16 - w)); top = b.bottom + 6; }
        helpBox.style.left = left + 'px'; helpBox.style.top = Math.max(16, Math.min(top, innerHeight - 16 - h)) + 'px';
        var h4 = at && Array.prototype.filter.call(helpBox.querySelectorAll('h4'), function (x) { return x.textContent === at; })[0];
        if (h4) helpBox.scrollTop = h4.offsetTop - 8;
      } else helpBox.hidden = true;
      helpBtn.setAttribute('aria-pressed', String(show));
    }
    helpBtn.addEventListener('click', function () { help(); });
    document.addEventListener('keydown', function (ev) {
      if (helpBox && !helpBox.hidden && ev.key === 'Escape') { help(false); ev.stopPropagation(); return; }
      if (ev.key !== '?' || ev.ctrlKey || ev.metaKey || ev.altKey || !on) return;
      var a = document.activeElement;
      if (a && (/input|textarea|select/i.test(a.tagName) || a.isContentEditable)) return;
      ev.preventDefault(); help();
    }, true);
    document.addEventListener('pointerdown', function (ev) {   // a click elsewhere closes it
      if (helpBox && !helpBox.hidden && !helpBox.contains(ev.target) && !helpBtn.contains(ev.target)) help(false);
    }, true);
