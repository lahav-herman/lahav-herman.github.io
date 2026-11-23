(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CANVAS_SIZE = 640;
  const CENTER = CANVAS_SIZE / 2;
  const PARALLEL_SNAP_THRESHOLD = 4;

  const svg = document.getElementById('canvas');
  const layer = document.getElementById('objects-layer');
  const listEl = document.getElementById('object-list');
  const inspectorEmpty = document.getElementById('inspector-empty');
  const inspectorBody = document.getElementById('inspector-body');

  let objects = [];
  let nextId = 1;
  let selectedId = null;

  const REF_ICONS = {
    circle: '<circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="2"/>',
    line: '<line x1="8" y1="38" x2="40" y2="10" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="38" r="2.4" fill="currentColor"/><circle cx="40" cy="10" r="2.4" fill="currentColor"/>'
  };

  const TYPE_LABELS = { circle: 'Circle', line: 'Line' };

  const DEFAULTS = {
    circle: { length: 70, width: 2 },
    line: { length: 90, width: 2 }
  };

  function createObject(type) {
    const sameTypeCount = objects.filter(o => o.type === type).length;
    const d = DEFAULTS[type];
    const obj = {
      id: nextId++,
      type,
      length: d.length + sameTypeCount * 14,
      width: d.width,
      negSpace: 0,
      filled: false,
      lock: {
        mode: 'free',
        x: CENTER,
        y: CENTER,
        angle: type === 'line' ? 315 : 0,
        degreeStep: 15,
        parentId: null,
        radiusOffset: d.length,
        parentAngle: 0
      }
    };
    if (type === 'circle') obj.striped = false;
    return obj;
  }

  function normalizeAngle(a) {
    return ((a % 360) + 360) % 360;
  }

  function snapToStep(angle, step) {
    const s = Math.max(1, step || 15);
    return Math.round(angle / s) * s;
  }

  function wouldCycle(childId, candidateParentId) {
    let cur = candidateParentId;
    const seen = new Set();
    while (cur != null) {
      if (cur === childId) return true;
      if (seen.has(cur)) return false;
      seen.add(cur);
      const o = objects.find(x => x.id === cur);
      if (!o || o.lock.mode !== 'parent') return false;
      cur = o.lock.parentId;
    }
    return false;
  }

  function resolveAll() {
    const resolved = new Map();

    function resolve(obj, visiting) {
      if (resolved.has(obj.id)) return resolved.get(obj.id);
      if (visiting.has(obj.id)) {
        const fallback = { cx: obj.lock.x ?? CENTER, cy: obj.lock.y ?? CENTER, angle: obj.lock.angle || 0 };
        resolved.set(obj.id, fallback);
        return fallback;
      }
      visiting.add(obj.id);

      let out;
      if (obj.lock.mode === 'parent' && obj.lock.parentId != null) {
        const parent = objects.find(o => o.id === obj.lock.parentId);
        if (parent) {
          const p = resolve(parent, visiting);
          const a = ((obj.lock.parentAngle || 0) * Math.PI) / 180;
          const r = obj.lock.radiusOffset ?? parent.length;
          out = { cx: p.cx + r * Math.cos(a), cy: p.cy + r * Math.sin(a), angle: obj.lock.angle || 0 };
        } else {
          out = { cx: obj.lock.x ?? CENTER, cy: obj.lock.y ?? CENTER, angle: obj.lock.angle || 0 };
        }
      } else if (obj.lock.mode === 'degrees') {
        out = { cx: obj.lock.x, cy: obj.lock.y, angle: snapToStep(obj.lock.angle || 0, obj.lock.degreeStep) };
      } else {
        out = { cx: obj.lock.x, cy: obj.lock.y, angle: obj.lock.angle || 0 };
      }
      resolved.set(obj.id, out);
      return out;
    }

    objects.forEach(o => resolve(o, new Set()));
    return resolved;
  }

  function angleDiffMod180(a, b) {
    let d = ((a - b) % 180 + 180) % 180;
    if (d > 90) d = 180 - d;
    return d;
  }

  function snapToParallelLines(obj, angle) {
    const resolved = resolveAll();
    let bestAngle = null;
    let bestDiff = PARALLEL_SNAP_THRESHOLD;
    objects.forEach(o => {
      if (o.id === obj.id || o.type !== 'line') return;
      const oAngle = resolved.get(o.id).angle;
      const diff = angleDiffMod180(angle, oAngle);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestAngle = oAngle;
      }
    });
    if (bestAngle === null) return angle;
    let snapped = bestAngle;
    while (angle - snapped > 90) snapped += 180;
    while (angle - snapped < -90) snapped -= 180;
    return snapped;
  }

  function stripedDashArray(obj) {
    if (obj.type !== 'circle' || !obj.striped) return null;
    const span = 2 * Math.PI * obj.length;
    const segments = 24;
    const unit = span / segments;
    const gap = unit * 0.5;
    const dash = Math.max(0.5, unit - gap);
    return `${dash.toFixed(2)} ${gap.toFixed(2)}`;
  }

  function applyCommonAttrs(el, obj) {
    el.setAttribute('stroke-width', obj.width);
    el.classList.add('obj-shape');
    if (obj.filled && obj.type !== 'line') el.classList.add('filled');
    if (obj.id === selectedId) el.classList.add('selected');
  }

  // Thin strokes and small endpoint dots are hard to grab precisely, so every
  // draggable visible shape is paired with a much wider invisible hit-target
  // that carries the actual pointer listener and cursor styling.
  const HIT_STROKE_WIDTH = 14;
  const HIT_POINT_PADDING = 8;
  const HIT_POINT_MIN_R = 10;

  function hitCursorClass(locked) {
    return locked ? 'locked' : 'draggable';
  }

  function renderCanvas() {
    const resolved = resolveAll();
    layer.innerHTML = '';

    objects.forEach(obj => {
      const r = resolved.get(obj.id);
      const dash = stripedDashArray(obj);
      const haloWidth = obj.width + obj.negSpace * 2;

      if (obj.type === 'line') {
        const a = (r.angle * Math.PI) / 180;
        const x2 = r.cx + obj.length * Math.cos(a);
        const y2 = r.cy + obj.length * Math.sin(a);
        const capR = Math.max(2, obj.width * 1.4);

        if (obj.negSpace > 0) {
          const halo = document.createElementNS(SVG_NS, 'line');
          halo.setAttribute('x1', r.cx);
          halo.setAttribute('y1', r.cy);
          halo.setAttribute('x2', x2);
          halo.setAttribute('y2', y2);
          halo.setAttribute('stroke', 'var(--bg)');
          halo.setAttribute('stroke-width', haloWidth);
          halo.setAttribute('stroke-linecap', 'round');
          halo.setAttribute('pointer-events', 'none');
          layer.appendChild(halo);

          [[r.cx, r.cy], [x2, y2]].forEach(([cx, cy]) => {
            const capHalo = document.createElementNS(SVG_NS, 'circle');
            capHalo.setAttribute('cx', cx);
            capHalo.setAttribute('cy', cy);
            capHalo.setAttribute('r', capR + obj.negSpace);
            capHalo.setAttribute('fill', 'var(--bg)');
            capHalo.setAttribute('pointer-events', 'none');
            layer.appendChild(capHalo);
          });
        }

        const g = document.createElementNS(SVG_NS, 'g');

        const lineHit = document.createElementNS(SVG_NS, 'line');
        lineHit.setAttribute('x1', r.cx);
        lineHit.setAttribute('y1', r.cy);
        lineHit.setAttribute('x2', x2);
        lineHit.setAttribute('y2', y2);
        lineHit.setAttribute('stroke', 'transparent');
        lineHit.setAttribute('stroke-width', HIT_STROKE_WIDTH);
        lineHit.classList.add(hitCursorClass(obj.lock.mode === 'parent'));
        lineHit.addEventListener('pointerdown', evt => startInteraction(evt, obj));
        g.appendChild(lineHit);

        const el = document.createElementNS(SVG_NS, 'line');
        el.setAttribute('x1', r.cx);
        el.setAttribute('y1', r.cy);
        el.setAttribute('x2', x2);
        el.setAttribute('y2', y2);
        applyCommonAttrs(el, obj);
        g.appendChild(el);

        const capFill = obj.filled ? 'var(--text)' : 'var(--bg)';
        [{ x: r.cx, y: r.cy, which: 'start' }, { x: x2, y: y2, which: 'end' }].forEach(pt => {
          const cap = document.createElementNS(SVG_NS, 'circle');
          cap.setAttribute('cx', pt.x);
          cap.setAttribute('cy', pt.y);
          cap.setAttribute('r', capR);
          cap.setAttribute('fill', capFill);
          cap.setAttribute('stroke', 'var(--line)');
          cap.setAttribute('stroke-width', '1');
          cap.setAttribute('pointer-events', 'none');
          g.appendChild(cap);

          const pointLocked = pt.which === 'start' && obj.lock.mode === 'parent';
          const capHit = document.createElementNS(SVG_NS, 'circle');
          capHit.setAttribute('cx', pt.x);
          capHit.setAttribute('cy', pt.y);
          capHit.setAttribute('r', Math.max(HIT_POINT_MIN_R, capR + HIT_POINT_PADDING));
          capHit.setAttribute('fill', 'transparent');
          capHit.classList.add('line-point', hitCursorClass(pointLocked));
          capHit.addEventListener('pointerdown', evt => startLinePointDrag(evt, obj, pt.which));
          g.appendChild(capHit);
        });

        layer.appendChild(g);
      } else {
        if (obj.negSpace > 0) {
          const halo = document.createElementNS(SVG_NS, 'circle');
          halo.setAttribute('cx', r.cx);
          halo.setAttribute('cy', r.cy);
          halo.setAttribute('r', obj.length);
          halo.setAttribute('fill', 'none');
          halo.setAttribute('stroke', 'var(--bg)');
          halo.setAttribute('stroke-width', haloWidth);
          halo.setAttribute('pointer-events', 'none');
          layer.appendChild(halo);
        }

        const circleHit = document.createElementNS(SVG_NS, 'circle');
        circleHit.setAttribute('cx', r.cx);
        circleHit.setAttribute('cy', r.cy);
        circleHit.setAttribute('r', obj.length);
        circleHit.setAttribute('fill', obj.filled ? 'transparent' : 'none');
        circleHit.setAttribute('stroke', 'transparent');
        circleHit.setAttribute('stroke-width', HIT_STROKE_WIDTH);
        circleHit.classList.add(hitCursorClass(obj.lock.mode === 'parent'));
        circleHit.addEventListener('pointerdown', evt => startInteraction(evt, obj));
        layer.appendChild(circleHit);

        const el = document.createElementNS(SVG_NS, 'circle');
        el.setAttribute('cx', r.cx);
        el.setAttribute('cy', r.cy);
        el.setAttribute('r', obj.length);
        if (dash) el.setAttribute('stroke-dasharray', dash);
        if (r.angle) el.setAttribute('transform', `rotate(${r.angle} ${r.cx} ${r.cy})`);
        applyCommonAttrs(el, obj);
        layer.appendChild(el);
      }
    });
  }

  function render() {
    renderCanvas();
    renderList();
    renderInspector();
  }

  function renderList() {
    listEl.innerHTML = '';
    objects.forEach(obj => {
      const li = document.createElement('li');
      li.className = 'object-row' + (obj.id === selectedId ? ' selected' : '');
      const label = document.createElement('span');
      label.textContent = `${TYPE_LABELS[obj.type]} #${obj.id}`;
      li.appendChild(label);
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = 'Delete';
      del.addEventListener('click', evt => {
        evt.stopPropagation();
        deleteObject(obj.id);
      });
      li.appendChild(del);
      li.addEventListener('click', () => {
        selectedId = obj.id;
        render();
      });
      listEl.appendChild(li);
    });
  }

  function deleteObject(id) {
    const resolved = resolveAll();
    objects.forEach(o => {
      if (o.lock.mode === 'parent' && o.lock.parentId === id) {
        const r = resolved.get(o.id);
        o.lock.mode = 'free';
        o.lock.parentId = null;
        if (r) { o.lock.x = r.cx; o.lock.y = r.cy; }
      }
    });
    objects = objects.filter(o => o.id !== id);
    if (selectedId === id) selectedId = null;
    render();
  }

  function renderInspector() {
    const obj = objects.find(o => o.id === selectedId);
    if (!obj) {
      inspectorEmpty.hidden = false;
      inspectorBody.hidden = true;
      inspectorBody.innerHTML = '';
      return;
    }
    inspectorEmpty.hidden = true;
    inspectorBody.hidden = false;

    const lengthLabel = obj.type === 'line' ? 'Length' : 'Length (radius)';

    const stripedField = obj.type === 'circle' ? `
      <div class="field checkbox-field">
        <input type="checkbox" id="f-striped" ${obj.striped ? 'checked' : ''}>
        <label for="f-striped">Striped</label>
      </div>` : '';

    let lockSub = '';
    if (obj.lock.mode === 'degrees') {
      const displayAngle = Math.round(snapToStep(obj.lock.angle, obj.lock.degreeStep));
      lockSub = `
        <div class="lock-sub">
          <div class="field">
            <label>Snap step (deg) <span class="value-readout" id="ro-degstep">${obj.lock.degreeStep}&deg;</span></label>
            <input type="range" id="f-degstep" min="1" max="90" step="1" value="${obj.lock.degreeStep}">
          </div>
          <div class="field">
            <label>Angle <span class="value-readout" id="ro-angle">${displayAngle}&deg;</span></label>
            <input type="range" id="f-angle" min="0" max="359" step="1" value="${obj.lock.angle}">
          </div>
        </div>`;
    } else if (obj.lock.mode === 'parent') {
      const candidates = objects.filter(o => o.id !== obj.id && !wouldCycle(obj.id, o.id));
      const options = candidates.map(o =>
        `<option value="${o.id}" ${obj.lock.parentId === o.id ? 'selected' : ''}>${TYPE_LABELS[o.type]} #${o.id}</option>`
      ).join('');
      lockSub = `
        <div class="lock-sub">
          <div class="field">
            <label>Parent object</label>
            <select id="f-parent"><option value="">— choose —</option>${options}</select>
          </div>
          <div class="field">
            <label>Radius offset <span class="value-readout" id="ro-radoff">${Math.round(obj.lock.radiusOffset)}px</span></label>
            <input type="range" id="f-radoff" min="0" max="300" step="1" value="${obj.lock.radiusOffset}">
          </div>
          <div class="field">
            <label>Angle from parent <span class="value-readout" id="ro-pangle">${Math.round(obj.lock.parentAngle)}&deg;</span></label>
            <input type="range" id="f-pangle" min="0" max="359" step="1" value="${obj.lock.parentAngle}">
          </div>
        </div>`;
    } else if (obj.type === 'line') {
      lockSub = `
        <div class="lock-sub">
          <div class="field">
            <label>Angle <span class="value-readout" id="ro-angle">${Math.round(obj.lock.angle)}&deg;</span></label>
            <input type="range" id="f-angle" min="0" max="359" step="1" value="${obj.lock.angle}">
          </div>
        </div>`;
    }

    const grabHint = obj.lock.mode !== 'parent'
      ? `<p class="hint">Press <strong>G</strong> to grab the selected object and move it without snapping to the cursor &mdash; click to drop, Esc to cancel.</p>`
      : '';

    inspectorBody.innerHTML = `
      <div class="inspector-ref">
        <svg class="ref-icon" viewBox="0 0 48 48" aria-hidden="true">${REF_ICONS[obj.type]}</svg>
        <span class="type-name">${TYPE_LABELS[obj.type]} #${obj.id}</span>
      </div>
      ${grabHint}

      <div class="field">
        <label>Width <span class="value-readout" id="ro-width">${obj.width}px</span></label>
        <input type="range" id="f-width" min="0.5" max="8" step="0.5" value="${obj.width}">
      </div>
      <div class="field">
        <label>${lengthLabel} <span class="value-readout" id="ro-length">${obj.length}px</span></label>
        <input type="range" id="f-length" min="10" max="${obj.type === 'line' ? 400 : 300}" step="1" value="${obj.length}">
      </div>
      <div class="field">
        <label>Negative space <span class="value-readout" id="ro-negspace">${obj.negSpace}px</span></label>
        <input type="range" id="f-negspace" min="0" max="24" step="1" value="${obj.negSpace}">
      </div>

      ${stripedField}

      <div class="field checkbox-field">
        <input type="checkbox" id="f-filled" ${obj.filled ? 'checked' : ''}>
        <label for="f-filled">${obj.type === 'line' ? 'Solid end-caps' : 'Filled'}</label>
      </div>

      <h2>Lock</h2>
      <div class="lock-options">
        <label><input type="radio" name="lock-mode" value="free" ${obj.lock.mode === 'free' ? 'checked' : ''}> Free</label>
        <label><input type="radio" name="lock-mode" value="degrees" ${obj.lock.mode === 'degrees' ? 'checked' : ''}> Lock to degrees</label>
        <label><input type="radio" name="lock-mode" value="parent" ${obj.lock.mode === 'parent' ? 'checked' : ''}> Lock to object</label>
      </div>
      ${lockSub}

      <button class="btn danger" id="f-delete" type="button" style="width:100%">Delete object</button>
    `;

    wireInspector(obj);
  }

  function syncInspectorValues(obj) {
    if (!obj || obj.id !== selectedId) return;
    const setVal = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    };
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setVal('f-width', obj.width);
    setText('ro-width', `${obj.width}px`);
    setVal('f-length', obj.length);
    setText('ro-length', `${obj.length}px`);
    setVal('f-negspace', obj.negSpace);
    setText('ro-negspace', `${obj.negSpace}px`);

    if (document.getElementById('f-angle')) {
      setVal('f-angle', obj.lock.angle);
      const displayAngle = obj.lock.mode === 'degrees'
        ? Math.round(snapToStep(obj.lock.angle, obj.lock.degreeStep))
        : Math.round(obj.lock.angle);
      setText('ro-angle', `${displayAngle}°`);
    }
    if (document.getElementById('f-radoff')) {
      setVal('f-radoff', obj.lock.radiusOffset);
      setText('ro-radoff', `${Math.round(obj.lock.radiusOffset)}px`);
    }
  }

  function wireInspector(obj) {
    const q = sel => inspectorBody.querySelector(sel);

    q('#f-width').addEventListener('input', e => {
      obj.width = Number(e.target.value);
      renderCanvas();
      syncInspectorValues(obj);
    });
    q('#f-length').addEventListener('input', e => {
      obj.length = Number(e.target.value);
      renderCanvas();
      syncInspectorValues(obj);
    });
    q('#f-negspace').addEventListener('input', e => {
      obj.negSpace = Number(e.target.value);
      renderCanvas();
      syncInspectorValues(obj);
    });

    const striped = q('#f-striped');
    if (striped) striped.addEventListener('change', e => { obj.striped = e.target.checked; render(); });

    q('#f-filled').addEventListener('change', e => { obj.filled = e.target.checked; render(); });
    q('#f-delete').addEventListener('click', () => deleteObject(obj.id));

    inspectorBody.querySelectorAll('input[name="lock-mode"]').forEach(radio => {
      radio.addEventListener('change', e => {
        const mode = e.target.value;
        if (obj.lock.mode === 'parent' && mode !== 'parent') {
          const r = resolveAll().get(obj.id);
          if (r) { obj.lock.x = r.cx; obj.lock.y = r.cy; }
        }
        if (mode === 'parent' && obj.lock.parentId == null) {
          const firstValid = objects.find(o => o.id !== obj.id && !wouldCycle(obj.id, o.id));
          obj.lock.parentId = firstValid ? firstValid.id : null;
          if (!firstValid) {
            obj.lock.mode = 'free';
            render();
            return;
          }
        }
        obj.lock.mode = mode;
        render();
      });
    });

    const degstep = q('#f-degstep');
    if (degstep) degstep.addEventListener('input', e => {
      obj.lock.degreeStep = Number(e.target.value);
      renderCanvas();
      syncInspectorValues(obj);
    });

    const angle = q('#f-angle');
    if (angle) angle.addEventListener('input', e => {
      obj.lock.angle = Number(e.target.value);
      renderCanvas();
      syncInspectorValues(obj);
    });

    const parentSel = q('#f-parent');
    if (parentSel) parentSel.addEventListener('change', e => {
      obj.lock.parentId = e.target.value ? Number(e.target.value) : null;
      render();
    });

    const radoff = q('#f-radoff');
    if (radoff) radoff.addEventListener('input', e => {
      obj.lock.radiusOffset = Number(e.target.value);
      renderCanvas();
      syncInspectorValues(obj);
    });

    const pangle = q('#f-pangle');
    if (pangle) pangle.addEventListener('input', e => {
      obj.lock.parentAngle = Number(e.target.value);
      renderCanvas();
      syncInspectorValues(obj);
    });
  }

  function toSvgPoint(coords) {
    const pt = svg.createSVGPoint();
    pt.x = coords.clientX;
    pt.y = coords.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function startInteraction(evt, obj) {
    selectedId = obj.id;
    render();
    if (obj.lock.mode === 'parent') return;

    evt.preventDefault();
    const start = toSvgPoint(evt);
    const origX = obj.lock.x;
    const origY = obj.lock.y;

    const onMove = e => {
      const p = toSvgPoint(e);
      obj.lock.x = origX + (p.x - start.x);
      obj.lock.y = origY + (p.y - start.y);
      renderCanvas();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      render();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startLinePointDrag(evt, obj, which) {
    evt.preventDefault();
    evt.stopPropagation();
    selectedId = obj.id;
    if (which === 'start' && obj.lock.mode === 'parent') { render(); return; }

    const resolved = resolveAll();
    const r = resolved.get(obj.id);
    const a = (r.angle * Math.PI) / 180;
    const startPt = { x: r.cx, y: r.cy };
    const endPt = { x: r.cx + obj.length * Math.cos(a), y: r.cy + obj.length * Math.sin(a) };
    const fixedPt = which === 'start' ? endPt : startPt;

    const onMove = e => {
      const p = toSvgPoint(e);
      if (which === 'start') {
        const dx = fixedPt.x - p.x;
        const dy = fixedPt.y - p.y;
        obj.length = Math.max(2, Math.round(Math.hypot(dx, dy)));
        obj.lock.angle = normalizeAngle(snapToParallelLines(obj, Math.atan2(dy, dx) * 180 / Math.PI));
        obj.lock.x = p.x;
        obj.lock.y = p.y;
      } else {
        const dx = p.x - fixedPt.x;
        const dy = p.y - fixedPt.y;
        obj.length = Math.max(2, Math.round(Math.hypot(dx, dy)));
        obj.lock.angle = normalizeAngle(snapToParallelLines(obj, Math.atan2(dy, dx) * 180 / Math.PI));
      }
      renderCanvas();
      syncInspectorValues(obj);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      render();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    render();
  }

  // --- "G" to grab: press G to pick up the selected object (keeping its
  // offset from the cursor instead of snapping to it), move the mouse,
  // then click / Enter to drop or Esc to cancel. ---
  let grabState = null;
  let lastMouse = { clientX: 0, clientY: 0 };

  window.addEventListener('mousemove', e => {
    lastMouse = { clientX: e.clientX, clientY: e.clientY };
    if (grabState) {
      const p = toSvgPoint(e);
      grabState.obj.lock.x = grabState.origX + (p.x - grabState.startSvg.x);
      grabState.obj.lock.y = grabState.origY + (p.y - grabState.startSvg.y);
      renderCanvas();
    }
  });

  window.addEventListener('keydown', e => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

    if (!grabState && (e.key === 'g' || e.key === 'G')) {
      const obj = objects.find(o => o.id === selectedId);
      if (!obj || obj.lock.mode === 'parent') return;
      grabState = { obj, origX: obj.lock.x, origY: obj.lock.y, startSvg: toSvgPoint(lastMouse) };
      return;
    }
    if (!grabState) return;
    if (e.key === 'Escape') {
      grabState.obj.lock.x = grabState.origX;
      grabState.obj.lock.y = grabState.origY;
      grabState = null;
      render();
    } else if (e.key === 'Enter') {
      grabState = null;
      render();
    }
  });

  window.addEventListener('pointerdown', e => {
    if (!grabState) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.button === 2) {
      grabState.obj.lock.x = grabState.origX;
      grabState.obj.lock.y = grabState.origY;
    }
    grabState = null;
    render();
  }, true);

  svg.addEventListener('contextmenu', e => { if (grabState) e.preventDefault(); });

  document.querySelectorAll('.palette-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const obj = createObject(btn.dataset.type);
      objects.push(obj);
      selectedId = obj.id;
      render();
    });
  });

  function cloneCanvasWithBackground() {
    const clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('width', CANVAS_SIZE);
    clone.setAttribute('height', CANVAS_SIZE);
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', CANVAS_SIZE);
    bg.setAttribute('height', CANVAS_SIZE);
    bg.setAttribute('fill', '#000');
    clone.insertBefore(bg, clone.firstChild);
    return clone;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  document.getElementById('export-svg').addEventListener('click', () => {
    const clone = cloneCanvasWithBackground();
    const src = new XMLSerializer().serializeToString(clone);
    downloadBlob(new Blob([src], { type: 'image/svg+xml' }), 'orbital-notation.svg');
  });

  document.getElementById('export-png').addEventListener('click', () => {
    const clone = cloneCanvasWithBackground();
    const src = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvasEl = document.createElement('canvas');
      canvasEl.width = CANVAS_SIZE * scale;
      canvasEl.height = CANVAS_SIZE * scale;
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(img, 0, 0, CANVAS_SIZE * scale, CANVAS_SIZE * scale);
      URL.revokeObjectURL(url);
      canvasEl.toBlob(blob => downloadBlob(blob, 'orbital-notation.png'));
    };
    img.src = url;
  });

  render();
})();
